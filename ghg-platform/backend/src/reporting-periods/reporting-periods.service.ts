import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { CalculationEngineService } from '../activity-data/calculation-engine.service';

@Injectable()
export class ReportingPeriodsService {
  constructor(private prisma: PrismaService, private calc: CalculationEngineService) {}

  list(user: AuthenticatedUser) {
    return this.prisma.reportingPeriod.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { year: 'desc' },
    });
  }

  async create(user: AuthenticatedUser, dto: { year: number; isBaseYear?: boolean; staffFte?: number }) {
    // A new org's first reporting period should default to being the base year, matching the
    // workbook's "As this is the first inventory year, it is also the base year by default" logic.
    const existingCount = await this.prisma.reportingPeriod.count({ where: { organizationId: user.organizationId } });
    return this.prisma.reportingPeriod.create({
      data: {
        organizationId: user.organizationId,
        year: dto.year,
        isBaseYear: dto.isBaseYear ?? existingCount === 0,
        staffFte: dto.staffFte,
      },
    });
  }

  async submit(user: AuthenticatedUser, id: string) {
    const period = await this.prisma.reportingPeriod.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!period) throw new NotFoundException('Reporting period not found.');
    if (period.status !== 'draft') throw new BadRequestException('Only a draft period can be submitted.');

    return this.prisma.reportingPeriod.update({
      where: { id },
      data: { status: 'submitted', submittedBy: user.id, submittedAt: new Date() },
    });
  }

  async approve(user: AuthenticatedUser, id: string) {
    const period = await this.prisma.reportingPeriod.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!period) throw new NotFoundException('Reporting period not found.');
    if (period.status !== 'submitted') throw new BadRequestException('Only a submitted period can be approved.');

    // Section 3.4 — surface a recalculation flag alongside approval rather than blocking it; an Admin
    // may still choose to approve while acknowledging the base-year variance for disclosure purposes.
    const thresholdCheck = period.isBaseYear
      ? null
      : await this.calc.checkRecalculationThreshold(user.organizationId, id);

    const updated = await this.prisma.reportingPeriod.update({
      where: { id },
      data: { status: 'approved', approvedBy: user.id, approvedAt: new Date() },
    });

    return { ...updated, recalculationCheck: thresholdCheck };
  }
}
