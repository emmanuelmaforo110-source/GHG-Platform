import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OffsetsService } from './offsets.service';
import { ReductionService } from '../reduction/reduction.service';
import { CCP_PRINCIPLES, creditEligibility, dueDiligenceScore, vcmiTier } from './claims.math';
import { CAT, enterWorkbook, makeService, ORG, seed, user } from '../activity-data/testing/workbook-fixture';

const allChecked = Object.fromEntries(CCP_PRINCIPLES.map((p) => [p.key, true]));

describe('Claim rules', () => {
  it('scores due diligence against the 10 Core Carbon Principles', () => {
    expect(dueDiligenceScore(allChecked)).toEqual({ passed: 10, total: 10, complete: true });
    expect(dueDiligenceScore({ governance: true, tracking: false })).toMatchObject({ passed: 1, complete: false });
    expect(dueDiligenceScore(null).passed).toBe(0);
  });

  it('accepts CCP-labelled and Article 6.4 credits in any year', () => {
    const lot = { ccpLabelled: true, registry: 'verra', vintageYear: 2025 };
    expect(creditEligibility(lot, 2027)).toMatchObject({ eligible: true, basis: 'CCP-labelled' });
    expect(creditEligibility({ ...lot, ccpLabelled: false, registry: 'article_6_4' }, 2028).eligible).toBe(true);
  });

  it('accepts full due diligence only for claims before 2027', () => {
    const lot = { ccpLabelled: false, registry: 'gold_standard', vintageYear: 2024, dueDiligence: allChecked };
    expect(creditEligibility(lot, 2026).eligible).toBe(true);
    expect(creditEligibility(lot, 2027).eligible).toBe(false);
    expect(creditEligibility({ ...lot, dueDiligence: { governance: true } }, 2026).eligible).toBe(false);
  });

  it('warns about old vintages', () => {
    expect(creditEligibility({ ccpLabelled: true, registry: 'verra', vintageYear: 2019 }, 2026).warnings).toHaveLength(1);
    expect(creditEligibility({ ccpLabelled: true, registry: 'verra', vintageYear: 2021 }, 2026).warnings).toHaveLength(0);
  });

  it('maps coverage to VCMI tiers (Silver 10%, Gold 50%, Platinum 100%)', () => {
    expect(vcmiTier(9.9)).toBeNull();
    expect(vcmiTier(10)).toBe('silver');
    expect(vcmiTier(50)).toBe('gold');
    expect(vcmiTier(100)).toBe('platinum');
    expect(vcmiTier(140)).toBe('platinum');
  });
});

async function setup() {
  const prisma = seed();
  await enterWorkbook(makeService(prisma));
  const reduction = new ReductionService(prisma as any);
  return { prisma, reduction, service: new OffsetsService(prisma as any, reduction) };
}

const lotDto = (over: Record<string, unknown> = {}) => ({
  projectName: 'Clean cookstoves, Dodoma',
  registry: 'gold_standard' as const,
  vintageYear: 2025,
  quantityTco2e: 10,
  ...over,
});
const retireDto = (q: number, claimYear = 2027) => ({ quantityTco2e: q, retiredOn: '2027-12-01', claimYear, retirementReference: `GS-RET-${q}` });

describe('Credit register', () => {
  it('tracks retired and available tonnes and refuses to retire more than is left', async () => {
    const { service } = await setup();
    const lot = await service.createLot(user, lotDto({ currency: ' usd ' }));
    expect(lot.currency).toBe('USD');
    await service.retire(user, lot.id, retireDto(4));
    const [listed] = await service.listLots(user);
    expect(listed.retiredTco2e).toBe(4);
    expect(listed.availableTco2e).toBe(6);
    await expect(service.retire(user, lot.id, retireDto(6.5))).rejects.toBeInstanceOf(BadRequestException);
    await service.retire(user, lot.id, retireDto(6));
    expect((await service.listLots(user))[0].availableTco2e).toBe(0);
  });

  it('will not lower a lot below what is retired, nor delete a lot with retirements', async () => {
    const { service } = await setup();
    const lot = await service.createLot(user, lotDto());
    await service.retire(user, lot.id, retireDto(3));
    await expect(service.updateLot(user, lot.id, { quantityTco2e: 2 })).rejects.toBeInstanceOf(BadRequestException);
    const updated = await service.updateLot(user, lot.id, { quantityTco2e: 3 });
    expect(Number(updated.quantityTco2e)).toBe(3);
    await expect(service.deleteLot(user, lot.id)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects unknown due-diligence items and lots from other organisations', async () => {
    const { service } = await setup();
    await expect(service.createLot(user, lotDto({ dueDiligence: { magic: true } }))).rejects.toBeInstanceOf(BadRequestException);
    const other = { ...user, organizationId: 'other-org' };
    const lot = await service.createLot(user, lotDto());
    await expect(service.retire(other, lot.id, retireDto(1))).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('Tanzanian projects', () => {
  const tz = (over: Record<string, unknown> = {}) => ({ name: 'Kilosa REDD+', projectType: 'REDD+', isReddPlus: true, ...over });

  it('refuses benefit shares above 100%', async () => {
    const { service } = await setup();
    await expect(
      service.createTzProject(user, tz({ communitySharePct: 60, nationalSharePct: 50 })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lists the regulatory points still open', async () => {
    const { service } = await setup();
    await service.createTzProject(user, tz({ article6Status: 'requested' }));
    const [p] = await service.listTzProjects(user);
    expect(p.warnings).toHaveLength(4);
    await service.updateTzProject(user, p.id, tz({
      registrationStatus: 'registered', ndcAlignment: 'Forestry', communitySharePct: 40, article6Status: 'authorized',
    }));
    expect((await service.listTzProjects(user))[0].warnings).toHaveLength(0);
  });

  it('only links credit lots to the organisation’s own projects', async () => {
    const { service } = await setup();
    await expect(service.createLot(user, lotDto({ tzProjectId: 'nope' }))).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('Claim checker', () => {
  /** 2027 inventory: Scope 1 = 8, Scope 2 = 5, Scope 3 = 7 -> 20 t gross, approved. */
  async function claimReady() {
    const s = await setup();
    s.prisma.tables.reportingPeriod.push({ id: 'period-2027', organizationId: ORG, year: 2027, status: 'approved', staffFte: 12 });
    for (const [categoryId, t] of [[CAT.stationary, 8], [CAT.electricity, 5], [CAT.commuting, 7]] as const) {
      s.prisma.tables.activityData.push({ id: `2027-${categoryId}`, organizationId: ORG, reportingPeriodId: 'period-2027', categoryId, emissionsTco2e: t });
    }
    // 50% by 2031 from 2026 = 10% a year, above the 4.2% reference; 13 t in 2027 is on track.
    await s.reduction.createTarget(user, { name: 'Ops', coverage: 'scope_1_2', baseYear: 2026, targetYear: 2031, reductionPct: 50 });
    return s;
  }

  it('says "not yet" until the attested prerequisites are confirmed', async () => {
    const { service } = await claimReady();
    const c = await service.claimCheck(user, 2027);
    expect(c.grossEmissionsTco2e).toBe(20);
    expect(c.claimPossible).toBe(false);
    const met = Object.fromEntries(c.prerequisites.map((p) => [p.key, p.met]));
    expect(met).toEqual({ inventory: true, assurance: false, published: false, target: true, on_track: true, governance: false, advocacy: false });
  });

  it('counts only eligible credits and keeps gross emissions and removals separate', async () => {
    const { service } = await claimReady();
    const ccp = await service.createLot(user, lotDto({ ccpLabelled: true, quantityTco2e: 12 }));
    const ddOnly = await service.createLot(user, lotDto({ projectName: 'Old forest', dueDiligence: allChecked }));
    await service.retire(user, ccp.id, retireDto(12));
    await service.retire(user, ddOnly.id, retireDto(5));
    await service.createRemoval(user, { projectName: 'Farm trees', removalType: 'nature', method: 'Allometric', reportingYear: 2027, removedTco2e: 2, reversalsTco2e: 0.5 });
    await service.saveAttestation(user, 2027, { limitedAssurance: true, inventoryPublished: true, governanceInPlace: true, advocacyParisAligned: true });

    const c = await service.claimCheck(user, 2027);
    expect(c.grossEmissionsTco2e).toBe(20); // never reduced by credits
    expect(c.credits.eligibleRetiredTco2e).toBe(12);
    expect(c.credits.ineligibleRetiredTco2e).toBe(5); // due diligence alone no longer counts in 2027
    expect(c.credits.coveragePct).toBe(60);
    expect(c.removals).toEqual({ removedTco2e: 2, reversalsTco2e: 0.5, netRemovalsTco2e: 1.5 });
    expect(c.tier).toBe('gold');
    expect(c.claimPossible).toBe(true);
    expect(c.summary).toContain('Gold');
  });

  it('updates the attestation for the same year instead of adding another', async () => {
    const { prisma, service } = await claimReady();
    await service.saveAttestation(user, 2027, { limitedAssurance: true });
    await service.saveAttestation(user, 2027, { limitedAssurance: false, inventoryPublished: true });
    expect(prisma.tables.claimAttestation).toHaveLength(1);
    expect(prisma.tables.claimAttestation[0]).toMatchObject({ limitedAssurance: false, inventoryPublished: true });
  });
});
