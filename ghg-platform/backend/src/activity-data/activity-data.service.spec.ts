import { BadRequestException } from '@nestjs/common';
import { ActivityDataService } from './activity-data.service';
import { CalculationEngineService } from './calculation-engine.service';
import { createFakePrisma } from './testing/fake-prisma';

/**
 * Regression tests for the activity-data flow against the reference workbook
 * (Pemandu_GHG_Inventory_Calculator.xlsx), using an in-memory database stand-in.
 */

const ORG = 'org-1';
const FACILITY = 'fac-1';
const PERIOD = 'period-2026';
const user = { id: 'user-1', organizationId: ORG, role: 'admin' as const, restrictedFacilityId: null, email: 'a@b.c' };
const req = () => ({}) as any;

const CAT = { stationary: 1, mobile: 2, electricity: 4, fuelEnergy: 13, commuting: 17 };

function seed(periodStatus = 'draft') {
  const f = (id: string, categoryId: number, factorName: string, value: number, unit: string) => ({
    id,
    organizationId: null,
    categoryId,
    factorName,
    value,
    unit,
    validYear: 2026,
    source: 'Seed (DEFRA/BEIS, IPCC, indicative)',
  });
  return createFakePrisma({
    ghgCategory: [
      { id: CAT.stationary, scope: 'scope_1', scope3CategoryNo: null, name: 'Stationary Combustion' },
      { id: CAT.mobile, scope: 'scope_1', scope3CategoryNo: null, name: 'Mobile Combustion' },
      { id: CAT.electricity, scope: 'scope_2', scope3CategoryNo: null, name: 'Purchased Electricity' },
      { id: CAT.fuelEnergy, scope: 'scope_3', scope3CategoryNo: 3, name: 'Category 3 — Fuel- and Energy-Related Activities' },
      { id: CAT.commuting, scope: 'scope_3', scope3CategoryNo: 7, name: 'Category 7 — Employee Commuting' },
    ],
    emissionFactor: [
      f('ef-diesel', CAT.stationary, 'Automotive diesel (combustion)', 2.68, 'kg CO2e / litre'),
      f('ef-lpg', CAT.stationary, 'LPG (combustion)', 1.51, 'kg CO2e / litre'),
      f('ef-petrol', CAT.mobile, 'Petrol / gasoline (combustion)', 2.31, 'kg CO2e / litre'),
      f('ef-grid', CAT.electricity, 'Tanzania grid electricity', 0.34, 'kg CO2e / kWh'),
      f('ef-wtt-diesel', CAT.fuelEnergy, 'Well-to-tank (WTT) — diesel', 0.62, 'kg CO2e / litre'),
      f('ef-wtt-petrol', CAT.fuelEnergy, 'Well-to-tank (WTT) — petrol', 0.59, 'kg CO2e / litre'),
      f('ef-td', CAT.fuelEnergy, 'Tanzania grid — T&D loss rate', 0.17, '% (as decimal) of kWh delivered'),
      f('ef-commute', CAT.commuting, 'Employee commuting — average car', 0.17, 'kg CO2e / km'),
    ],
    reportingPeriod: [{ id: PERIOD, organizationId: ORG, year: 2026, status: periodStatus }],
    facility: [{ id: FACILITY, organizationId: ORG, name: 'Dar es Salaam Office' }],
  });
}

function makeService(prisma: ReturnType<typeof createFakePrisma>) {
  const calc = new CalculationEngineService(prisma as any);
  return new ActivityDataService(prisma as any, calc);
}

const base = { facilityId: FACILITY, reportingPeriodId: PERIOD };
const tonnesByCategory = (prisma: ReturnType<typeof createFakePrisma>, categoryId: number) =>
  prisma.tables.activityData.filter((r) => r.categoryId === categoryId).reduce((s, r) => s + Number(r.emissionsTco2e), 0);

async function enterWorkbook(service: ActivityDataService) {
  const diesel = await service.create(user, { ...base, categoryId: CAT.stationary, sourceName: 'Backup generator', fuelOrMaterialType: 'Diesel', quantity: 1000, unit: 'litres' }, req());
  const petrol = await service.create(user, { ...base, categoryId: CAT.mobile, sourceName: 'Company vehicle', fuelOrMaterialType: 'Petrol', quantity: 3000, unit: 'litres' }, req());
  const power = await service.create(user, { ...base, categoryId: CAT.electricity, sourceName: 'Office electricity', quantity: 18000, unit: 'kWh', scope2Method: 'location_based' }, req());
  const commute = await service.create(user, { ...base, categoryId: CAT.commuting, sourceName: 'Staff commuting', quantity: 44160, unit: 'km' }, req());
  return { diesel, petrol, power, commute };
}

describe('Reference workbook regression (in-memory)', () => {
  it('reproduces Scope 1 = 9.61 tCO2e and Scope 2 = 6.12 tCO2e', async () => {
    const prisma = seed();
    await enterWorkbook(makeService(prisma));
    expect(tonnesByCategory(prisma, CAT.stationary) + tonnesByCategory(prisma, CAT.mobile)).toBeCloseTo(9.61, 6);
    expect(tonnesByCategory(prisma, CAT.electricity)).toBeCloseTo(6.12, 6);
  });

  it('creates the automatic Scope 3 rows: WTT diesel 0.62, WTT petrol 1.77, T&D losses 1.0404 tCO2e', async () => {
    const prisma = seed();
    await enterWorkbook(makeService(prisma));
    const derived = prisma.tables.activityData.filter((r) => r.sourceActivityDataId);
    expect(derived).toHaveLength(3);
    const byName = Object.fromEntries(derived.map((r) => [r.sourceName, Number(r.emissionsTco2e)]));
    expect(byName['WTT — Diesel']).toBeCloseTo(0.62, 6);
    expect(byName['WTT — Petrol']).toBeCloseTo(1.77, 6);
    expect(byName['T&D losses — purchased electricity']).toBeCloseTo(1.0404, 6);
    expect(tonnesByCategory(prisma, CAT.commuting)).toBeCloseTo(7.5072, 6);
  });

  it('gives the same result when the same quantities are entered in other units (MWh, US gallons)', async () => {
    const prisma = seed();
    const service = makeService(prisma);
    await service.create(user, { ...base, categoryId: CAT.electricity, sourceName: 'Office electricity', quantity: 18, unit: 'MWh' }, req());
    await service.create(user, { ...base, categoryId: CAT.stationary, sourceName: 'Generator', fuelOrMaterialType: 'Diesel', quantity: 264.172052, unit: 'gallons' }, req());
    expect(tonnesByCategory(prisma, CAT.electricity)).toBeCloseTo(6.12, 6);
    expect(tonnesByCategory(prisma, CAT.stationary)).toBeCloseTo(2.68, 4);
  });

  it('rejects a unit that does not fit the emission factor', async () => {
    const service = makeService(seed());
    await expect(
      service.create(user, { ...base, categoryId: CAT.electricity, sourceName: 'Office electricity', quantity: 100, unit: 'litres' }, req()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('Deleting and editing entries', () => {
  it('deletes the automatic WTT row together with its Scope 1 source row', async () => {
    const prisma = seed();
    const service = makeService(prisma);
    const { diesel } = await enterWorkbook(service);

    const res = await service.remove(user, diesel.id, req());
    expect(res.derivedRowsDeleted).toBe(1);
    expect(prisma.tables.activityData.find((r) => r.sourceActivityDataId === diesel.id)).toBeUndefined();
    expect(tonnesByCategory(prisma, CAT.stationary)).toBeCloseTo(0, 6);
  });

  it('refuses to delete entries in a period that is no longer a draft', async () => {
    const prisma = seed();
    const service = makeService(prisma);
    const { diesel } = await enterWorkbook(service);
    prisma.tables.reportingPeriod[0].status = 'locked';
    await expect(service.remove(user, diesel.id, req())).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.tables.activityData.find((r) => r.id === diesel.id)).toBeDefined();
  });

  it('refuses to delete or edit an automatic row directly', async () => {
    const prisma = seed();
    const service = makeService(prisma);
    const { diesel } = await enterWorkbook(service);
    const wtt = prisma.tables.activityData.find((r) => r.sourceActivityDataId === diesel.id)!;
    await expect(service.remove(user, wtt.id, req())).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.update(user, wtt.id, { quantity: 1 }, req())).rejects.toBeInstanceOf(BadRequestException);
  });

  it('recalculates the entry and its automatic row when the quantity is edited, and records old + new values', async () => {
    const prisma = seed();
    const service = makeService(prisma);
    const { diesel } = await enterWorkbook(service);
    const request = req();

    await service.update(user, diesel.id, { quantity: 2000 }, request);

    const row = prisma.tables.activityData.find((r) => r.id === diesel.id)!;
    const wtt = prisma.tables.activityData.find((r) => r.sourceActivityDataId === diesel.id)!;
    expect(Number(row.emissionsTco2e)).toBeCloseTo(5.36, 6);
    expect(Number(wtt.emissionsTco2e)).toBeCloseTo(1.24, 6);
    expect(prisma.tables.activityData.filter((r) => r.sourceActivityDataId === diesel.id)).toHaveLength(1);
    expect(request.auditContext.oldValue.quantity).toBe(1000);
    expect(request.auditContext.newValue.quantity).toBe(2000);
    expect(row.updatedBy).toBe(user.id);
  });

  it('removes the automatic WTT row when the fuel is changed to one without a WTT factor (LPG)', async () => {
    const prisma = seed();
    const service = makeService(prisma);
    const { diesel } = await enterWorkbook(service);

    await service.update(user, diesel.id, { fuelOrMaterialType: 'LPG' }, req());

    const row = prisma.tables.activityData.find((r) => r.id === diesel.id)!;
    expect(row.emissionFactorId).toBe('ef-lpg');
    expect(prisma.tables.activityData.find((r) => r.sourceActivityDataId === diesel.id)).toBeUndefined();
  });

  it('refuses to edit entries in a submitted period', async () => {
    const prisma = seed();
    const service = makeService(prisma);
    const { power } = await enterWorkbook(service);
    prisma.tables.reportingPeriod[0].status = 'submitted';
    await expect(service.update(user, power.id, { quantity: 1 }, req())).rejects.toBeInstanceOf(BadRequestException);
  });

  it("refuses an emission factor that belongs to another organization", async () => {
    const prisma = seed();
    prisma.tables.emissionFactor.push({
      id: 'ef-other-org',
      organizationId: 'org-2',
      categoryId: CAT.electricity,
      factorName: 'Private grid factor',
      value: 0.1,
      unit: 'kg CO2e / kWh',
      validYear: 2026,
      source: 'other org',
    });
    const service = makeService(prisma);
    await expect(
      service.create(user, { ...base, categoryId: CAT.electricity, sourceName: 'x', quantity: 1, unit: 'kWh', emissionFactorId: 'ef-other-org' }, req()),
    ).rejects.toThrow('Emission factor not found.');
  });
});
