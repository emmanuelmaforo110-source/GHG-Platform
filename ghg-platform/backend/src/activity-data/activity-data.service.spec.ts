import { BadRequestException } from '@nestjs/common';
import { base, CAT, enterWorkbook, makeService, req, seed, tonnesByCategory, user } from './testing/workbook-fixture';

/**
 * Regression tests for the activity-data flow against the reference workbook
 * (Pemandu_GHG_Inventory_Calculator.xlsx), using an in-memory database stand-in.
 */

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

  it('reproduces every Scope 3 line and the totals: Scope 3 = 12.3816 t, grand total = 28.1116 t', async () => {
    const prisma = seed();
    await enterWorkbook(makeService(prisma));
    const line = (name: string) => Number(prisma.tables.activityData.find((r) => r.sourceName === name)!.emissionsTco2e);

    // Summary Dashboard lines of the workbook
    expect(line('Air travel — short-haul')).toBeCloseTo(0.9, 6);
    expect(line('Hotel nights')).toBeCloseTo(0.3, 6);
    expect(line('Ground transport (client visits)')).toBeCloseTo(0.136, 6);
    expect(line('Office waste')).toBeCloseTo(0.108, 6);
    expect(tonnesByCategory(prisma, CAT.fuelEnergy)).toBeCloseTo(3.4304, 6); // WTT + T&D

    const scope3 = [CAT.fuelEnergy, CAT.waste, CAT.travel, CAT.commuting].reduce((s, c) => s + tonnesByCategory(prisma, c), 0);
    const total = prisma.tables.activityData.reduce((s, r) => s + Number(r.emissionsTco2e), 0);
    expect(scope3).toBeCloseTo(12.3816, 6);
    expect(total).toBeCloseTo(28.1116, 6);
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
