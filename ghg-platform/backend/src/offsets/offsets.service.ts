import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ReductionService } from '../reduction/reduction.service';
import {
  ClaimAttestationDto,
  CreditLotDto,
  RemovalRecordDto,
  RetireCreditsDto,
  TzCarbonProjectDto,
  UpdateCreditLotDto,
} from './dto/offsets.dto';
import { CCP_PRINCIPLES, creditEligibility, dueDiligenceScore, vcmiTier } from './claims.math';

const round = (n: number, dp = 4) => Math.round(n * 10 ** dp) / 10 ** dp;

@Injectable()
export class OffsetsService {
  constructor(private prisma: PrismaService, private reduction: ReductionService) {}

  // ---------------------------------------------------------------------------------------------
  // Carbon credit lots and retirements
  // ---------------------------------------------------------------------------------------------

  private cleanDueDiligence(dd?: Record<string, boolean | null>) {
    if (!dd) return undefined;
    const allowed = new Set<string>(CCP_PRINCIPLES.map((p) => p.key));
    const unknown = Object.keys(dd).filter((k) => !allowed.has(k));
    if (unknown.length) throw new BadRequestException(`Unknown due-diligence item(s): ${unknown.join(', ')}.`);
    return dd;
  }

  private async checkTzProject(user: AuthenticatedUser, tzProjectId?: string | null) {
    if (!tzProjectId) return;
    const p = await this.prisma.tzCarbonProject.findFirst({ where: { id: tzProjectId, organizationId: user.organizationId } });
    if (!p) throw new BadRequestException('Tanzanian project not found.');
  }

  async listLots(user: AuthenticatedUser) {
    const lots = await this.prisma.creditLot.findMany({
      where: { organizationId: user.organizationId },
      include: { retirements: true },
      orderBy: { vintageYear: 'desc' },
    });
    return lots.map((l) => {
      const retired = (l.retirements ?? []).reduce((s, r) => s + Number(r.quantityTco2e), 0);
      return {
        ...l,
        retiredTco2e: round(retired),
        availableTco2e: round(Number(l.quantityTco2e) - retired),
        dueDiligenceScore: dueDiligenceScore(l.dueDiligence as never),
      };
    });
  }

  async createLot(user: AuthenticatedUser, dto: CreditLotDto) {
    await this.checkTzProject(user, dto.tzProjectId);
    return this.prisma.creditLot.create({
      data: {
        organizationId: user.organizationId,
        projectName: dto.projectName.trim(),
        registry: dto.registry,
        registryProjectId: dto.registryProjectId,
        methodology: dto.methodology,
        kind: dto.kind ?? 'avoidance_reduction',
        country: dto.country,
        vintageYear: dto.vintageYear,
        serialRange: dto.serialRange,
        quantityTco2e: dto.quantityTco2e,
        ccpLabelled: dto.ccpLabelled ?? false,
        article6Authorized: dto.article6Authorized ?? false,
        correspondingAdjustment: dto.correspondingAdjustment ?? false,
        dueDiligence: this.cleanDueDiligence(dto.dueDiligence),
        purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : undefined,
        pricePerTonne: dto.pricePerTonne,
        currency: dto.currency?.trim().toUpperCase(),
        tzProjectId: dto.tzProjectId,
        notes: dto.notes,
        createdBy: user.id,
      },
    });
  }

  private async getLot(user: AuthenticatedUser, id: string) {
    const lot = await this.prisma.creditLot.findFirst({
      where: { id, organizationId: user.organizationId },
      include: { retirements: true },
    });
    if (!lot) throw new NotFoundException('Credit lot not found.');
    const retired = (lot.retirements ?? []).reduce((s, r) => s + Number(r.quantityTco2e), 0);
    return { lot, retired };
  }

  async updateLot(user: AuthenticatedUser, id: string, dto: UpdateCreditLotDto) {
    const { retired } = await this.getLot(user, id);
    if (dto.quantityTco2e !== undefined && dto.quantityTco2e < retired - 1e-9) {
      throw new BadRequestException(`The quantity cannot be less than the ${round(retired)} tCO2e already retired.`);
    }
    await this.checkTzProject(user, dto.tzProjectId);
    return this.prisma.creditLot.update({
      where: { id },
      data: {
        ...dto,
        dueDiligence: this.cleanDueDiligence(dto.dueDiligence),
        purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : undefined,
        currency: dto.currency?.trim().toUpperCase(),
      },
    });
  }

  async deleteLot(user: AuthenticatedUser, id: string) {
    const { retired } = await this.getLot(user, id);
    if (retired > 0) throw new BadRequestException('Credits from this lot have been retired; it cannot be deleted.');
    await this.prisma.creditLot.delete({ where: { id } });
    return { deleted: true };
  }

  /** Retiring credits is permanent in the registry; here it records that retirement against a claim year. */
  async retire(user: AuthenticatedUser, lotId: string, dto: RetireCreditsDto) {
    const { lot, retired } = await this.getLot(user, lotId);
    const available = Number(lot.quantityTco2e) - retired;
    if (dto.quantityTco2e > available + 1e-9) {
      throw new BadRequestException(`Only ${round(available)} tCO2e of this lot is still available to retire.`);
    }
    return this.prisma.creditRetirement.create({
      data: {
        organizationId: user.organizationId,
        lotId,
        quantityTco2e: dto.quantityTco2e,
        retiredOn: new Date(dto.retiredOn),
        claimYear: dto.claimYear,
        beneficiary: dto.beneficiary,
        retirementReference: dto.retirementReference.trim(),
        evidenceUrl: dto.evidenceUrl,
        notes: dto.notes,
        createdBy: user.id,
      },
    });
  }

  /** Removes a retirement recorded by mistake (Admin only). It does not undo a retirement in the registry. */
  async deleteRetirement(user: AuthenticatedUser, id: string) {
    const r = await this.prisma.creditRetirement.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!r) throw new NotFoundException('Retirement not found.');
    await this.prisma.creditRetirement.delete({ where: { id } });
    return { deleted: true };
  }

  // ---------------------------------------------------------------------------------------------
  // Removals (reported separately from the inventory)
  // ---------------------------------------------------------------------------------------------

  listRemovals(user: AuthenticatedUser) {
    return this.prisma.removalRecord.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { reportingYear: 'desc' },
    });
  }

  private removalData(dto: RemovalRecordDto) {
    if ((dto.reversalsTco2e ?? 0) > dto.removedTco2e + 1e-9 && dto.removedTco2e > 0) {
      // Allowed (a reversal can exceed the year's new removals) but worth a clear message elsewhere.
    }
    return {
      projectName: dto.projectName.trim(),
      removalType: dto.removalType,
      method: dto.method.trim(),
      location: dto.location,
      reportingYear: dto.reportingYear,
      removedTco2e: dto.removedTco2e,
      reversalsTco2e: dto.reversalsTco2e ?? 0,
      storageYears: dto.storageYears,
      reversalRiskPct: dto.reversalRiskPct,
      monitoringPlan: dto.monitoringPlan,
      lastMonitoredOn: dto.lastMonitoredOn ? new Date(dto.lastMonitoredOn) : undefined,
      inValueChain: dto.inValueChain ?? true,
      evidenceUrl: dto.evidenceUrl,
      notes: dto.notes,
    };
  }

  createRemoval(user: AuthenticatedUser, dto: RemovalRecordDto) {
    return this.prisma.removalRecord.create({
      data: { ...this.removalData(dto), organizationId: user.organizationId, createdBy: user.id },
    });
  }

  async updateRemoval(user: AuthenticatedUser, id: string, dto: RemovalRecordDto) {
    const r = await this.prisma.removalRecord.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!r) throw new NotFoundException('Removal record not found.');
    return this.prisma.removalRecord.update({ where: { id }, data: this.removalData(dto) });
  }

  async deleteRemoval(user: AuthenticatedUser, id: string) {
    const r = await this.prisma.removalRecord.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!r) throw new NotFoundException('Removal record not found.');
    await this.prisma.removalRecord.delete({ where: { id } });
    return { deleted: true };
  }

  // ---------------------------------------------------------------------------------------------
  // Tanzanian carbon projects
  // ---------------------------------------------------------------------------------------------

  private tzData(dto: TzCarbonProjectDto) {
    const shares = [dto.communitySharePct, dto.localGovernmentSharePct, dto.nationalSharePct, dto.otherSharePct];
    const total = shares.reduce<number>((s, v) => s + (v ?? 0), 0);
    if (total > 100 + 1e-9) throw new BadRequestException(`Benefit-sharing percentages add up to ${round(total, 2)}%, more than 100%.`);
    return {
      name: dto.name.trim(),
      projectType: dto.projectType.trim(),
      isReddPlus: dto.isReddPlus ?? false,
      region: dto.region,
      district: dto.district,
      proponent: dto.proponent,
      registrationStatus: dto.registrationStatus ?? 'concept',
      registrationNumber: dto.registrationNumber,
      ndcAlignment: dto.ndcAlignment,
      communitySharePct: dto.communitySharePct,
      localGovernmentSharePct: dto.localGovernmentSharePct,
      nationalSharePct: dto.nationalSharePct,
      otherSharePct: dto.otherSharePct,
      benefitSharingNote: dto.benefitSharingNote,
      article6Status: dto.article6Status ?? 'not_applicable',
      expectedAnnualCredits: dto.expectedAnnualCredits,
      standard: dto.standard,
      notes: dto.notes,
    };
  }

  async listTzProjects(user: AuthenticatedUser) {
    const projects = await this.prisma.tzCarbonProject.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: 'asc' },
    });
    // Points to check against the Tanzanian carbon trading regulations before credits are sold
    return projects.map((p) => {
      const warnings: string[] = [];
      if (!['approved', 'registered'].includes(p.registrationStatus)) warnings.push('Not yet approved/registered — credits should not be sold yet.');
      if (!p.ndcAlignment) warnings.push('NDC alignment not described.');
      const shares = [p.communitySharePct, p.localGovernmentSharePct, p.nationalSharePct, p.otherSharePct];
      if (shares.every((s) => s === null || s === undefined)) warnings.push('Benefit-sharing percentages not recorded.');
      if (p.article6Status === 'requested') warnings.push('Article 6 authorisation still pending — credits cannot be transferred abroad yet.');
      return { ...p, warnings };
    });
  }

  async createTzProject(user: AuthenticatedUser, dto: TzCarbonProjectDto) {
    return this.prisma.tzCarbonProject.create({
      data: { ...this.tzData(dto), organizationId: user.organizationId, createdBy: user.id },
    });
  }

  async updateTzProject(user: AuthenticatedUser, id: string, dto: TzCarbonProjectDto) {
    const p = await this.prisma.tzCarbonProject.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!p) throw new NotFoundException('Project not found.');
    return this.prisma.tzCarbonProject.update({ where: { id }, data: this.tzData(dto) });
  }

  async deleteTzProject(user: AuthenticatedUser, id: string) {
    const p = await this.prisma.tzCarbonProject.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!p) throw new NotFoundException('Project not found.');
    await this.prisma.tzCarbonProject.delete({ where: { id } });
    return { deleted: true };
  }

  // ---------------------------------------------------------------------------------------------
  // Claims (VCMI) and the gross / credits / removals summary
  // ---------------------------------------------------------------------------------------------

  async saveAttestation(user: AuthenticatedUser, claimYear: number, dto: ClaimAttestationDto) {
    return this.prisma.claimAttestation.upsert({
      where: { organizationId_claimYear: { organizationId: user.organizationId, claimYear } },
      update: { ...dto, updatedBy: user.id },
      create: { ...dto, organizationId: user.organizationId, claimYear, updatedBy: user.id },
    });
  }

  /**
   * Checks whether a VCMI claim can be made for a year. Gross emissions are never reduced by credits:
   * the result shows gross emissions, eligible credits retired for the year, and removals, side by side.
   */
  async claimCheck(user: AuthenticatedUser, claimYear: number) {
    const [actuals, targets, attestation, retirements, removals, period] = await Promise.all([
      this.reduction.actualsByYear(user),
      this.reduction.listTargets(user),
      this.prisma.claimAttestation.findFirst({ where: { organizationId: user.organizationId, claimYear } }),
      this.prisma.creditRetirement.findMany({
        where: { organizationId: user.organizationId, claimYear },
        include: { lot: true },
      }),
      this.prisma.removalRecord.findMany({ where: { organizationId: user.organizationId, reportingYear: claimYear } }),
      this.prisma.reportingPeriod.findFirst({ where: { organizationId: user.organizationId, year: claimYear } }),
    ]);

    const year = actuals.find((a) => a.year === claimYear);
    const grossTco2e = year ? year.scope1 + year.scope2 + year.scope3 : 0;

    // Credits
    const credits = retirements.map((r) => {
      const e = creditEligibility(r.lot, claimYear);
      return {
        retirementId: r.id,
        projectName: r.lot.projectName,
        registry: r.lot.registry,
        vintageYear: r.lot.vintageYear,
        quantityTco2e: Number(r.quantityTco2e),
        retirementReference: r.retirementReference,
        eligible: e.eligible,
        basis: e.basis,
        warnings: e.warnings,
      };
    });
    const eligibleTco2e = credits.filter((c) => c.eligible).reduce((s, c) => s + c.quantityTco2e, 0);
    const ineligibleTco2e = credits.filter((c) => !c.eligible).reduce((s, c) => s + c.quantityTco2e, 0);
    const coveragePct = grossTco2e > 0 ? (eligibleTco2e / grossTco2e) * 100 : 0;

    // Removals (net of reversals), reported separately
    const removedTco2e = removals.reduce((s, r) => s + Number(r.removedTco2e), 0);
    const reversalsTco2e = removals.reduce((s, r) => s + Number(r.reversalsTco2e), 0);

    // Prerequisites
    const opsTarget = targets.find(
      (t) => t.targetType === 'absolute' && (t.coverage === 'scope_1_2' || t.coverage === 'all_scopes') && t.ambition?.meetsReferenceRate,
    );
    const prerequisites = [
      {
        key: 'inventory',
        label: `A complete ${claimYear} inventory, approved in the platform`,
        met: !!period && ['approved', 'locked'].includes(period.status) && grossTco2e > 0,
        source: 'platform',
      },
      {
        key: 'assurance',
        label: 'The inventory has limited third-party assurance',
        met: !!attestation?.limitedAssurance,
        source: 'attested',
      },
      {
        key: 'published',
        label: 'The inventory and claim are published',
        met: !!attestation?.inventoryPublished,
        source: 'attested',
      },
      {
        key: 'target',
        label: 'A science-aligned near-term target covering Scope 1 + 2',
        met: !!opsTarget,
        source: 'platform',
      },
      {
        key: 'on_track',
        label: 'Emissions are on track against that target',
        met: opsTarget?.progress?.status === 'on_track',
        source: 'platform',
        note: opsTarget && !opsTarget.progress ? 'No year after the base year recorded yet.' : undefined,
      },
      {
        key: 'governance',
        label: 'Board oversight and investment plan for the target',
        met: !!attestation?.governanceInPlace,
        source: 'attested',
      },
      {
        key: 'advocacy',
        label: 'Public policy engagement consistent with the Paris Agreement',
        met: !!attestation?.advocacyParisAligned,
        source: 'attested',
      },
    ];

    const tier = vcmiTier(coveragePct);
    const allMet = prerequisites.every((p) => p.met);

    return {
      claimYear,
      grossEmissionsTco2e: round(grossTco2e),
      credits: {
        eligibleRetiredTco2e: round(eligibleTco2e),
        ineligibleRetiredTco2e: round(ineligibleTco2e),
        coveragePct: round(coveragePct, 1),
        items: credits,
      },
      removals: {
        removedTco2e: round(removedTco2e),
        reversalsTco2e: round(reversalsTco2e),
        netRemovalsTco2e: round(removedTco2e - reversalsTco2e),
      },
      prerequisites,
      attestation,
      tier,
      claimPossible: allMet && tier !== null,
      summary: !allMet
        ? 'Not yet: complete the prerequisites below before making any claim.'
        : tier === null
          ? 'Prerequisites met, but eligible credits cover less than 10% of remaining emissions (Silver needs at least 10%).'
          : `A VCMI ${tier[0].toUpperCase()}${tier.slice(1)} claim is supported for ${claimYear}.`,
      reminders: [
        'Credits are reported next to the inventory; gross emissions are never reduced by credits.',
        'Silver and Gold claims also require the share covered to increase each year.',
        'From 2027 only CCP-labelled or Article 6.4 credits count. Confirm the current VCMI and ICVCM rules before a public claim.',
      ],
    };
  }
}
