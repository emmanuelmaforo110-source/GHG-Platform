import { BadRequestException } from '@nestjs/common';
import { ReductionService } from './reduction.service';
import {
  abatementCost,
  ambitionCheck,
  buildMacc,
  capitalRecoveryFactor,
  plannedReductionInYear,
  trajectoryValue,
} from './reduction.math';
import { CAT, enterWorkbook, makeService, ORG, seed, user } from '../activity-data/testing/workbook-fixture';

describe('Reduction maths', () => {
  it('spreads an investment over its lifetime with the capital recovery factor', () => {
    expect(capitalRecoveryFactor(10, 10)).toBeCloseTo(0.162745, 6);
    expect(capitalRecoveryFactor(0, 4)).toBeCloseTo(0.25, 10);
  });

  it('works out the cost per tonne avoided (negative = saves money)', () => {
    const c = abatementCost({ capex: 10000, annualOpexChange: -2000, discountRatePct: 10, lifetimeYears: 10, annualReductionTco2e: 5 });
    expect(c.annualisedCapex).toBeCloseTo(1627.45, 2);
    expect(c.annualCost).toBeCloseTo(-372.55, 2);
    expect(c.costPerTonne).toBeCloseTo(-74.51, 2);
  });

  it('orders the MACC from cheapest to most expensive with cumulative tonnes', () => {
    const base = { discountRatePct: 0, lifetimeYears: 1, currency: 'USD', status: 'planned' };
    const macc = buildMacc([
      { ...base, id: 'b', name: 'Solar PV', capex: 0, annualOpexChange: 500, annualReductionTco2e: 5 }, // +100/t
      { ...base, id: 'a', name: 'LED lighting', capex: 0, annualOpexChange: -200, annualReductionTco2e: 2 }, // -100/t
    ]);
    expect(macc.map((m) => m.name)).toEqual(['LED lighting', 'Solar PV']);
    expect(macc[0].costPerTonne).toBe(-100);
    expect(macc[1].cumulativeStartTco2e).toBe(2);
    expect(macc[1].cumulativeEndTco2e).toBe(7);
  });

  it('draws a straight line from the base year to the target', () => {
    expect(trajectoryValue(100, 50, 2026, 2036, 2026)).toBe(100);
    expect(trajectoryValue(100, 50, 2026, 2036, 2031)).toBeCloseTo(75, 10);
    expect(trajectoryValue(100, 50, 2026, 2036, 2040)).toBe(50);
  });

  it('compares the yearly rate with the SBTi reference rates (4.2% / 2.5% a year)', () => {
    expect(ambitionCheck('scope_1_2', 42, 2020, 2030).meetsReferenceRate).toBe(true);
    expect(ambitionCheck('scope_1_2', 30, 2020, 2030).meetsReferenceRate).toBe(false);
    expect(ambitionCheck('scope_3', 25, 2020, 2030)).toMatchObject({ meetsReferenceRate: true, requiredAnnualRatePct: 2.5 });
  });

  it('counts only planned, in-progress and completed initiatives during their lifetime', () => {
    const list = [
      { status: 'planned', startYear: 2027, lifetimeYears: 2, annualReductionTco2e: 1 },
      { status: 'idea', startYear: 2027, lifetimeYears: 5, annualReductionTco2e: 10 },
      { status: 'cancelled', startYear: 2027, lifetimeYears: 5, annualReductionTco2e: 10 },
    ];
    expect(plannedReductionInYear(list, 2026)).toBe(0);
    expect(plannedReductionInYear(list, 2028)).toBe(1);
    expect(plannedReductionInYear(list, 2029)).toBe(0);
  });
});

async function workbookWithService() {
  const prisma = seed();
  await enterWorkbook(makeService(prisma));
  return { prisma, service: new ReductionService(prisma as any) };
}

/** Adds a later reporting year with the given totals per scope (one entry each). */
function addYear(prisma: ReturnType<typeof seed>, year: number, s1: number, s2: number, s3: number) {
  const periodId = `period-${year}`;
  prisma.tables.reportingPeriod.push({ id: periodId, organizationId: ORG, year, status: 'draft', staffFte: 12 });
  for (const [categoryId, t] of [[CAT.stationary, s1], [CAT.electricity, s2], [CAT.commuting, s3]] as const) {
    prisma.tables.activityData.push({ id: `${year}-${categoryId}`, organizationId: ORG, reportingPeriodId: periodId, categoryId, emissionsTco2e: t });
  }
}

describe('Reduction targets', () => {
  it('takes the base-year value from the inventory (Scope 1 + 2 = 15.73 t in 2026)', async () => {
    const { service } = await workbookWithService();
    const t = await service.createTarget(user, { name: 'Operations', coverage: 'scope_1_2', baseYear: 2026, targetYear: 2031, reductionPct: 42 });
    expect(Number(t.baseYearValue)).toBeCloseTo(15.73, 6);
  });

  it('works out an intensity base value per employee (28.1116 t / 12 FTE)', async () => {
    const { service } = await workbookWithService();
    const t = await service.createTarget(user, {
      name: 'Per employee', coverage: 'all_scopes', targetType: 'intensity', baseYear: 2026, targetYear: 2030, reductionPct: 30,
    });
    expect(Number(t.baseYearValue)).toBeCloseTo(28.1116 / 12, 6);
  });

  it('refuses a base year without data (unless entered by hand) and a target year before the base year', async () => {
    const { service } = await workbookWithService();
    await expect(
      service.createTarget(user, { name: 'Old', coverage: 'scope_1_2', baseYear: 2020, targetYear: 2030, reductionPct: 40 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createTarget(user, { name: 'Backwards', coverage: 'scope_1_2', baseYear: 2026, targetYear: 2025, reductionPct: 40 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    const manual = await service.createTarget(user, { name: 'Old', coverage: 'scope_1_2', baseYear: 2020, baseYearValue: 20, targetYear: 2030, reductionPct: 42 });
    expect(Number(manual.baseYearValue)).toBe(20);
  });

  it('reports on track / off track against the straight-line path', async () => {
    const { prisma, service } = await workbookWithService();
    await service.createTarget(user, { name: 'Ops', coverage: 'scope_1_2', baseYear: 2026, targetYear: 2031, reductionPct: 50 });
    // Path: 15.73 in 2026 -> 7.865 in 2031, so 14.157 expected in 2027.
    addYear(prisma, 2027, 8, 5, 7); // Scope 1+2 = 13 -> on track
    let [t] = await service.listTargets(user);
    expect(t.progress).toMatchObject({ year: 2027, status: 'on_track' });
    expect(t.progress!.expected).toBeCloseTo(14.157, 3);
    expect(t.ambition!.meetsReferenceRate).toBe(true); // 10% a year

    prisma.tables.activityData.find((r) => r.id === `2027-${CAT.stationary}`)!.emissionsTco2e = 10; // 15 > 14.157
    [t] = await service.listTargets(user);
    expect(t.progress!.status).toBe('off_track');
  });
});

describe('Reduction initiatives and overview', () => {
  const init = (over: Record<string, unknown>) => ({
    name: 'Solar PV on the office roof',
    scope: 'scope_2' as const,
    categoryId: CAT.electricity,
    status: 'planned' as const,
    startYear: 2028,
    lifetimeYears: 20,
    annualReductionTco2e: 3,
    capex: 12000,
    annualOpexChange: -1500,
    currency: 'usd',
    ...over,
  });

  it('refuses a category from another scope', async () => {
    const { service } = await workbookWithService();
    await expect(service.createInitiative(user, init({ categoryId: CAT.stationary }))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('builds the MACC per currency and the business-as-usual vs. plan scenario', async () => {
    const { service } = await workbookWithService();
    await service.createInitiative(user, init({}));
    await service.createInitiative(user, init({ name: 'LED lighting', capex: 800, annualOpexChange: -400, annualReductionTco2e: 0.5, lifetimeYears: 8, startYear: 2027 }));
    await service.createInitiative(user, init({ name: 'Idea only', status: 'idea', annualReductionTco2e: 5 }));
    await service.createInitiative(user, init({ name: 'Dropped', status: 'cancelled', annualReductionTco2e: 9 }));
    await service.createInitiative(user, init({ name: 'Local supplier', currency: 'TZS', annualReductionTco2e: 1 }));
    await service.createTarget(user, { name: 'All scopes', coverage: 'all_scopes', baseYear: 2026, targetYear: 2030, reductionPct: 20 });

    const o = await service.overview(user);
    expect(o.currency).toBe('USD');
    expect(o.currencies).toEqual(['USD', 'TZS']);
    expect(o.macc.map((m) => m.name)).toEqual(['LED lighting', 'Solar PV on the office roof', 'Idea only']);
    expect(o.macc.find((m) => m.name === 'Dropped')).toBeUndefined();

    const year = (y: number) => o.scenario.years.find((r) => r.year === y)!;
    expect(year(2026).actual).toBeCloseTo(28.1116, 4);
    expect(year(2027).businessAsUsual).toBeCloseTo(28.1116, 4);
    expect(year(2027).withPlan).toBeCloseTo(28.1116 - 0.5, 4); // LED from 2027
    expect(year(2029).withPlan).toBeCloseTo(28.1116 - 0.5 - 3 - 1, 4); // + solar and the TZS initiative; not the idea
    const targetKey = o.scenario.targetSeries[0].key;
    expect(year(2030)[targetKey]).toBeCloseTo(28.1116 * 0.8, 4);
    expect(o.totals.plannedAnnualReductionTco2e).toBeCloseTo(4.5, 4);
    expect(o.totals.ideasAnnualReductionTco2e).toBeCloseTo(5, 4);

    const tzs = await service.overview(user, { currency: 'tzs' });
    expect(tzs.macc.map((m) => m.name)).toEqual(['Local supplier']);
  });

  it('grows business as usual when a growth rate is given', async () => {
    const { service } = await workbookWithService();
    const o = await service.overview(user, { growthPct: 10 });
    expect(o.scenario.years.find((r) => r.year === 2028)!.businessAsUsual).toBeCloseTo(28.1116 * 1.21, 4);
  });

  it('adds cost per tonne and lifetime tonnes to the initiatives list', async () => {
    const { service } = await workbookWithService();
    await service.createInitiative(user, init({ capex: 10000, annualOpexChange: -2000, lifetimeYears: 10, annualReductionTco2e: 5 }));
    const [i] = await service.listInitiatives(user);
    expect(i.costPerTonne).toBeCloseTo(-74.51, 2);
    expect(i.lifetimeReductionTco2e).toBe(50);
    expect(i.currency).toBe('USD');
  });
});
