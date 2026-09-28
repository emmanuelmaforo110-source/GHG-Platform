import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { CalculationEngineService } from '../activity-data/calculation-engine.service';
import { ActivityDataService } from '../activity-data/activity-data.service';
import { CreateReportingPeriodDto, Scope3ScreenDto, UpdateReportingPeriodDto } from './dto/reporting-period.dto';

@Injectable()
export class ReportingPeriodsService {
  constructor(
    private prisma: PrismaService,
    private calc: CalculationEngineService,
    private activityData: ActivityDataService,
  ) {}

  /** Periods with the names of who submitted, approved or returned them (for the approval screen). */
  async list(user: AuthenticatedUser) {
    const [periods, users] = await Promise.all([
      this.prisma.reportingPeriod.findMany({
        where: { organizationId: user.organizationId },
        orderBy: { year: 'desc' },
      }),
      this.prisma.user.findMany({ where: { organizationId: user.organizationId }, select: { id: true, fullName: true } }),
    ]);
    const name = (id?: string | null) => (id ? users.find((u) => u.id === id)?.fullName ?? null : null);
    return periods.map((p) => ({
      ...p,
      submittedByName: name(p.submittedBy),
      approvedByName: name(p.approvedBy),
      returnedByName: name(p.returnedBy),
    }));
  }

  async create(user: AuthenticatedUser, dto: CreateReportingPeriodDto) {
    const duplicate = await this.prisma.reportingPeriod.findFirst({ where: { organizationId: user.organizationId, year: dto.year } });
    if (duplicate) throw new BadRequestException(`A reporting period for ${dto.year} already exists.`);
    // A new org's first reporting period should default to being the base year, matching the
    // workbook's "As this is the first inventory year, it is also the base year by default" logic.
    const existingCount = await this.prisma.reportingPeriod.count({ where: { organizationId: user.organizationId } });
    return this.prisma.reportingPeriod.create({
      data: {
        organizationId: user.organizationId,
        year: dto.year,
        isBaseYear: dto.isBaseYear ?? existingCount === 0,
        staffFte: dto.staffFte,
        boundaryApproach: dto.boundaryApproach,
        gwpSet: dto.gwpSet,
        recalculationThresholdPct: dto.recalculationThresholdPct,
      },
    });
  }

  private async getDraft(user: AuthenticatedUser, id: string) {
    const period = await this.prisma.reportingPeriod.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!period) throw new NotFoundException('Reporting period not found.');
    if (period.status !== 'draft') throw new BadRequestException(`This reporting period is ${period.status} and can no longer be changed.`);
    return period;
  }

  /**
   * Changes a draft period's settings. Changing the GWP set (AR5 <-> AR6) recalculates every entry
   * in the period, so CH4 and N2O are converted to CO2e with the new values.
   */
  async updateSettings(user: AuthenticatedUser, id: string, dto: UpdateReportingPeriodDto) {
    const period = await this.getDraft(user, id);
    const updated = await this.prisma.reportingPeriod.update({
      where: { id },
      data: {
        staffFte: dto.staffFte,
        boundaryApproach: dto.boundaryApproach,
        gwpSet: dto.gwpSet,
        recalculationThresholdPct: dto.recalculationThresholdPct,
      },
    });

    let recalculated = 0;
    if (dto.gwpSet && dto.gwpSet !== period.gwpSet) {
      const rows = await this.prisma.activityData.findMany({
        where: { reportingPeriodId: id, organizationId: user.organizationId, sourceActivityDataId: null },
        select: { id: true },
      });
      // Re-running each entry through the normal edit path keeps its factor and recalculates CO2e
      // (and its automatic upstream rows) with the new GWP values. Facility restrictions don't apply
      // to this admin-only action, so it runs as an unrestricted user of the same organization.
      const admin = { ...user, restrictedFacilityId: null };
      for (const row of rows) {
        await this.activityData.update(admin, row.id, {}, null);
        recalculated++;
      }
    }
    return { ...updated, recalculatedEntries: recalculated };
  }

  /** The 15 Scope 3 categories with this period's relevance decision (or none yet). */
  async scope3Screening(user: AuthenticatedUser, id: string) {
    const period = await this.prisma.reportingPeriod.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!period) throw new NotFoundException('Reporting period not found.');
    const [categories, screens, quantified] = await Promise.all([
      this.prisma.ghgCategory.findMany({ where: { scope: 'scope_3' }, orderBy: { scope3CategoryNo: 'asc' } }),
      this.prisma.scope3RelevanceScreen.findMany({ where: { reportingPeriodId: id, organizationId: user.organizationId } }),
      this.prisma.activityData.findMany({
        where: { reportingPeriodId: id, organizationId: user.organizationId, category: { scope: 'scope_3' } },
        select: { categoryId: true, emissionsTco2e: true },
      }),
    ]);
    return categories.map((c) => {
      const screen = screens.find((s) => s.categoryId === c.id);
      const rows = quantified.filter((q) => q.categoryId === c.id);
      return {
        categoryId: c.id,
        categoryNo: c.scope3CategoryNo,
        category: c.name,
        isIncluded: screen ? screen.isIncluded : null,
        relevanceAssessment: screen?.relevanceAssessment ?? null,
        assessedAt: screen?.assessedAt ?? null,
        entries: rows.length,
        tco2e: Math.round(rows.reduce((s, r) => s + Number(r.emissionsTco2e), 0) * 1e6) / 1e6,
      };
    });
  }

  /** Records (or changes) the relevance decision for one Scope 3 category in a draft period. */
  async saveScope3Screen(user: AuthenticatedUser, id: string, dto: Scope3ScreenDto) {
    await this.getDraft(user, id);
    const category = await this.prisma.ghgCategory.findFirst({ where: { id: dto.categoryId, scope: 'scope_3' } });
    if (!category) throw new BadRequestException('Choose one of the 15 Scope 3 categories.');
    return this.prisma.scope3RelevanceScreen.upsert({
      where: { reportingPeriodId_categoryId: { reportingPeriodId: id, categoryId: dto.categoryId } },
      update: { isIncluded: dto.isIncluded, relevanceAssessment: dto.relevanceAssessment.trim(), assessedBy: user.id, assessedAt: new Date() },
      create: {
        organizationId: user.organizationId,
        reportingPeriodId: id,
        categoryId: dto.categoryId,
        isIncluded: dto.isIncluded,
        relevanceAssessment: dto.relevanceAssessment.trim(),
        assessedBy: user.id,
      },
    });
  }

  async submit(user: AuthenticatedUser, id: string) {
    const period = await this.prisma.reportingPeriod.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!period) throw new NotFoundException('Reporting period not found.');
    if (period.status !== 'draft') throw new BadRequestException('Only a draft period can be submitted.');

    const entries = await this.prisma.activityData.findMany({ where: { reportingPeriodId: id, organizationId: user.organizationId }, select: { id: true } });
    if (entries.length === 0) throw new BadRequestException('Add at least one entry before submitting the period for approval.');

    return this.prisma.reportingPeriod.update({
      where: { id },
      data: { status: 'submitted', submittedBy: user.id, submittedAt: new Date() },
    });
  }

  /**
   * Sends a submitted period back to draft so errors can be corrected. The reason is kept on the period
   * (and in the audit log) so the person who submitted it knows what to fix.
   */
  async returnToDraft(user: AuthenticatedUser, id: string, reason: string, req?: { auditContext?: unknown }) {
    const period = await this.prisma.reportingPeriod.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!period) throw new NotFoundException('Reporting period not found.');
    if (period.status !== 'submitted') throw new BadRequestException('Only a submitted period can be sent back to draft.');
    const updated = await this.prisma.reportingPeriod.update({
      where: { id },
      data: {
        status: 'draft',
        submittedBy: null,
        submittedAt: null,
        returnReason: reason.trim(),
        returnedBy: user.id,
        returnedAt: new Date(),
      },
    });
    if (req) req.auditContext = { entityId: id, oldValue: period, newValue: updated };
    return updated;
  }

  async approve(user: AuthenticatedUser, id: string) {
    const period = await this.prisma.reportingPeriod.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!period) throw new NotFoundException('Reporting period not found.');
    if (period.status !== 'submitted') throw new BadRequestException('Only a submitted period can be approved.');
    // Separation of duties (the "four-eyes" check auditors expect): the person who submitted the
    // inventory cannot also approve it.
    if (period.submittedBy && period.submittedBy === user.id) {
      throw new ForbiddenException(
        'You submitted this period, so another Admin must approve it. Invite a second Admin on the Users page if needed.',
      );
    }

    // Section 3.4 — surface a recalculation flag alongside approval rather than blocking it; an Admin
    // may still choose to approve while acknowledging the base-year variance for disclosure purposes.
    const thresholdCheck = period.isBaseYear
      ? null
      : await this.calc.checkRecalculationThreshold(user.organizationId, id);

    const updated = await this.prisma.reportingPeriod.update({
      where: { id },
      data: { status: 'approved', approvedBy: user.id, approvedAt: new Date(), returnReason: null },
    });

    return { ...updated, recalculationCheck: thresholdCheck };
  }
}
