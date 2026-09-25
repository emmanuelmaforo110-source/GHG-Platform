import { BadRequestException } from '@nestjs/common';
import { DashboardService } from '../dashboard/dashboard.service';
import { ReportingPeriodsService } from '../reporting-periods/reporting-periods.service';
import { ActivityDataService, SUPPLIER_SPECIFIC_SOURCE } from './activity-data.service';
import { CalculationEngineService } from './calculation-engine.service';
import { co2eFromGases, GWP } from './gwp';
import { base, CAT, enterWorkbook, makeService, PERIOD, req, seed, user } from './testing/workbook-fixture';

const splitDiesel = {
  id: 'ef-diesel-split',
  organizationId: null,
  categoryId: CAT.stationary,
  factorName: 'Diesel (split by gas, test values)',
  value: 3.0758,
  unit: 'kg CO2e / litre',
  co2PerUnit: 2.5,
  ch4PerUnit: 0.001,
  n2oPerUnit: 0.002,
  validYear: 2026,
  source: 'Test factor',
};

const spendFactor = {
  id: 'ef-spend',
  organizationId: 'org-1',
  categoryId: CAT.purchasedGoods,
  factorName: 'Office supplies (spend-based)',
  value: 0.5,
  unit: 'kg CO2e / USD',
  validYear: 2026,
  source: 'Organisation spend-based factor',
};

function services(prisma: ReturnType<typeof seed>) {
  const calc = new CalculationEngineService(prisma as any);
  const activity = new ActivityDataService(prisma as any, calc);
  return { calc, activity, periods: new ReportingPeriodsService(prisma as any, calc, activity), dashboard: new DashboardService(prisma as any) };
}

describe('GWP values', () => {
  it('uses the IPCC AR5 and AR6 100-year values', () => {
    expect(GWP.AR5).toMatchObject({ ch4: 28, n2o: 265 });
    expect(GWP.AR6).toMatchObject({ ch4: 29.8, n2o: 273 });
    expect(co2eFromGases({ co2Kg: 1000, ch4Kg: 1, n2oKg: 1 }, 'AR6')).toBeCloseTo(1302.8, 6);
  });
});

describe('Results per gas', () => {
  it('stores the mass of each gas and converts to CO2e with the period GWP set (AR6)', async () => {
    const prisma = seed();
    prisma.tables.emissionFactor.push(splitDiesel);
    const row = await makeService(prisma).create(
      user,
      { ...base, categoryId: CAT.stationary, sourceName: 'Generator', quantity: 1000, unit: 'litres', emissionFactorId: 'ef-diesel-split' },
      req(),
    );
    expect(Number(row.co2Kg)).toBeCloseTo(2500, 6);
    expect(Number(row.ch4Kg)).toBeCloseTo(1, 6);
    expect(Number(row.n2oKg)).toBeCloseTo(2, 6);
    expect(row.gwpSetUsed).toBe('AR6');
    expect(Number(row.emissionsKgco2e)).toBeCloseTo(2500 + 29.8 + 546, 6);
  });

  it('keeps CO2e-only factors as published and leaves the gas columns empty', async () => {
    const prisma = seed();
    const { diesel } = await enterWorkbook(makeService(prisma));
    expect(diesel.co2Kg).toBeNull();
    expect(Number(diesel.emissionsTco2e)).toBeCloseTo(2.68, 6);
  });

  it('recalculates every entry when the period is switched from AR6 to AR5', async () => {
    const prisma = seed();
    prisma.tables.emissionFactor.push(splitDiesel);
    const { activity, periods } = services(prisma);
    const row = await activity.create(
      user,
      { ...base, categoryId: CAT.stationary, sourceName: 'Generator', quantity: 1000, unit: 'litres', emissionFactorId: 'ef-diesel-split' },
      req(),
    );
    const result = await periods.updateSettings(user, PERIOD, { gwpSet: 'AR5' });
    expect(result.recalculatedEntries).toBe(1);
    const after = prisma.tables.activityData.find((r) => r.id === row.id)!;
    expect(after.gwpSetUsed).toBe('AR5');
    expect(Number(after.emissionsKgco2e)).toBeCloseTo(2500 + 28 + 530, 6);
  });
});

describe('Scope 3 calculation methods', () => {
  it('supplier-specific: takes the emissions reported by the supplier directly', async () => {
    const prisma = seed();
    const row = await makeService(prisma).create(
      user,
      { ...base, categoryId: CAT.purchasedGoods, sourceName: 'Printing supplier', quantity: 0.4, unit: 't CO2e', calculationMethod: 'supplier_specific' },
      req(),
    );
    expect(row.calculationMethod).toBe('supplier_specific');
    expect(row.emissionFactorId).toBeNull();
    expect(row.emissionFactorSourceUsed).toBe(SUPPLIER_SPECIFIC_SOURCE);
    expect(Number(row.emissionsKgco2e)).toBeCloseTo(400, 6);
  });

  it('supplier-specific: rejects a quantity that is not in kg or t CO2e', async () => {
    const service = makeService(seed());
    await expect(
      service.create(user, { ...base, categoryId: CAT.purchasedGoods, sourceName: 'x', quantity: 5, unit: 'litres', calculationMethod: 'supplier_specific' }, req()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('supplier-specific Scope 1 fuel entries do not create an upstream (WTT) row', async () => {
    const prisma = seed();
    const row = await makeService(prisma).create(
      user,
      { ...base, categoryId: CAT.stationary, sourceName: 'Leased generator (supplier figure)', fuelOrMaterialType: 'Diesel', quantity: 2.68, unit: 't CO2e', calculationMethod: 'supplier_specific' },
      req(),
    );
    expect(prisma.tables.activityData.filter((r) => r.sourceActivityDataId === row.id)).toHaveLength(0);
  });

  it('spend-based: a factor per currency unit makes the entry spend-based automatically', async () => {
    const prisma = seed();
    prisma.tables.emissionFactor.push(spendFactor);
    const row = await makeService(prisma).create(
      user,
      { ...base, categoryId: CAT.purchasedGoods, sourceName: 'Office supplies', quantity: 2000, unit: 'USD' },
      req(),
    );
    expect(row.calculationMethod).toBe('spend_based');
    expect(Number(row.emissionsKgco2e)).toBeCloseTo(1000, 6);
  });

  it('spend-based: refuses a physical factor when spend-based is requested', async () => {
    const service = makeService(seed());
    await expect(
      service.create(user, { ...base, categoryId: CAT.stationary, sourceName: 'x', fuelOrMaterialType: 'Diesel', quantity: 10, unit: 'litres', calculationMethod: 'spend_based' }, req()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('spend-based: refuses spend in a different currency than the factor', async () => {
    const prisma = seed();
    prisma.tables.emissionFactor.push(spendFactor);
    await expect(
      makeService(prisma).create(user, { ...base, categoryId: CAT.purchasedGoods, sourceName: 'x', quantity: 10, unit: 'TZS' }, req()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('Scope 3 relevance screening', () => {
  it('records a decision per category and lists it with the quantified total', async () => {
    const prisma = seed();
    const { periods, activity } = services(prisma);
    await activity.create(user, { ...base, categoryId: CAT.commuting, sourceName: 'Staff commuting', quantity: 44160, unit: 'km' }, req());
    await periods.saveScope3Screen(user, PERIOD, {
      categoryId: CAT.purchasedGoods,
      isIncluded: false,
      relevanceAssessment: 'Size: low — services firm with minimal physical procurement.',
    });
    const list = await periods.scope3Screening(user, PERIOD);
    const cat1 = list.find((c) => c.categoryId === CAT.purchasedGoods)!;
    const cat7 = list.find((c) => c.categoryId === CAT.commuting)!;
    expect(cat1.isIncluded).toBe(false);
    expect(cat1.relevanceAssessment).toContain('services firm');
    expect(cat7.tco2e).toBeCloseTo(7.5072, 6);
    expect(list.every((c) => c.categoryNo !== null)).toBe(true);
  });

  it('refuses a non-Scope 3 category and a period that is no longer a draft', async () => {
    const prisma = seed();
    const { periods } = services(prisma);
    await expect(
      periods.saveScope3Screen(user, PERIOD, { categoryId: CAT.stationary, isIncluded: true, relevanceAssessment: 'Not a Scope 3 category' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    prisma.tables.reportingPeriod[0].status = 'approved';
    await expect(
      periods.saveScope3Screen(user, PERIOD, { categoryId: CAT.purchasedGoods, isIncluded: false, relevanceAssessment: 'Too late to change' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('Inventory report', () => {
  it('brings together totals, methods, screening, factors used and the GWP basis', async () => {
    const prisma = seed();
    const { activity, periods, dashboard } = services(prisma);
    await enterWorkbook(activity);
    await activity.create(
      user,
      { ...base, categoryId: CAT.purchasedGoods, sourceName: 'Printing supplier', quantity: 0.4, unit: 't CO2e', calculationMethod: 'supplier_specific' },
      req(),
    );
    await periods.saveScope3Screen(user, PERIOD, { categoryId: CAT.purchasedGoods, isIncluded: true, relevanceAssessment: 'Included: supplier reports its emissions.' });

    const r = await dashboard.report(user, PERIOD);
    expect(r.organization.name).toBe('Pemandu Associates (Demo)');
    expect(r.period.gwpSet).toBe('AR6');
    expect(r.gwpValues.ch4).toBe(29.8);
    expect(r.summary.totals.totalTco2e).toBeCloseTo(28.5116, 4);
    expect(r.byMethod.find((m) => m.method === 'supplier_specific')!.tco2e).toBeCloseTo(0.4, 6);
    const statusOf = (no: number) => r.scope3Screening.find((c) => c.categoryNo === no)!.status;
    expect(statusOf(1)).toBe('quantified');
    expect(statusOf(7)).toBe('quantified');
    expect(r.factorsUsed.find((f) => f.name === 'Tanzania grid electricity')!.entries).toBe(2); // Scope 2 row + T&D row
    expect(r.factorsUsed.some((f) => f.name === 'Supplier-reported emissions')).toBe(true);
    expect(r.byGas.shareOfEmissionsSplitByGas).toBe(0);
  });
});
