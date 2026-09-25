/**
 * Shared test fixture: the reference workbook (Pemandu_GHG_Inventory_Calculator.xlsx) set up on the
 * in-memory database stand-in, plus helpers to enter its activity data through the real service.
 */
import { ActivityDataService } from '../activity-data.service';
import { CalculationEngineService } from '../calculation-engine.service';
import { createFakePrisma } from './fake-prisma';

export const ORG = 'org-1';
export const FACILITY = 'fac-1';
export const PERIOD = 'period-2026';
export const user = { id: 'user-1', organizationId: ORG, role: 'admin' as const, restrictedFacilityId: null, email: 'a@b.c' };
export const req = () => ({}) as any;

export const CAT = { stationary: 1, mobile: 2, electricity: 4, fuelEnergy: 13, waste: 15, travel: 16, commuting: 17 };

export function seed(periodStatus = 'draft') {
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
      { id: CAT.waste, scope: 'scope_3', scope3CategoryNo: 5, name: 'Category 5 — Waste Generated in Operations' },
      { id: CAT.travel, scope: 'scope_3', scope3CategoryNo: 6, name: 'Category 6 — Business Travel' },
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
      f('ef-air-short', CAT.travel, 'Air travel — short-haul (avg, econ.)', 0.15, 'kg CO2e / passenger-km'),
      f('ef-air-long', CAT.travel, 'Air travel — long-haul (avg, econ.)', 0.19, 'kg CO2e / passenger-km'),
      f('ef-hotel', CAT.travel, 'Hotel stay', 20, 'kg CO2e / room-night'),
      f('ef-taxi', CAT.travel, 'Ground transport — taxi/hired car', 0.17, 'kg CO2e / km'),
      f('ef-waste', CAT.waste, 'Mixed office waste to landfill', 0.45, 'kg CO2e / kg waste'),
    ],
    reportingPeriod: [{ id: PERIOD, organizationId: ORG, year: 2026, status: periodStatus }],
    facility: [{ id: FACILITY, organizationId: ORG, name: 'Dar es Salaam Office', isActive: true }],
  });
}

export function makeService(prisma: ReturnType<typeof createFakePrisma>) {
  const calc = new CalculationEngineService(prisma as any);
  return new ActivityDataService(prisma as any, calc);
}

export const base = { facilityId: FACILITY, reportingPeriodId: PERIOD };
export const tonnesByCategory = (prisma: ReturnType<typeof createFakePrisma>, categoryId: number) =>
  prisma.tables.activityData.filter((r) => r.categoryId === categoryId).reduce((s, r) => s + Number(r.emissionsTco2e), 0);

export async function enterWorkbook(service: ActivityDataService) {
  const diesel = await service.create(user, { ...base, categoryId: CAT.stationary, sourceName: 'Backup generator', fuelOrMaterialType: 'Diesel', quantity: 1000, unit: 'litres' }, req());
  const petrol = await service.create(user, { ...base, categoryId: CAT.mobile, sourceName: 'Company vehicle', fuelOrMaterialType: 'Petrol', quantity: 3000, unit: 'litres' }, req());
  const power = await service.create(user, { ...base, categoryId: CAT.electricity, sourceName: 'Office electricity', quantity: 18000, unit: 'kWh', scope2Method: 'location_based' }, req());
  const commute = await service.create(user, { ...base, categoryId: CAT.commuting, sourceName: 'Staff commuting', quantity: 44160, unit: 'km' }, req());
  // Category 6 — Business travel. (The workbook's long-haul flight line is 0 passenger-km, so it is not entered.)
  await service.create(user, { ...base, categoryId: CAT.travel, sourceName: 'Air travel — short-haul', quantity: 6000, unit: 'passenger-km', emissionFactorId: 'ef-air-short' }, req());
  await service.create(user, { ...base, categoryId: CAT.travel, sourceName: 'Hotel nights', quantity: 15, unit: 'room-nights', emissionFactorId: 'ef-hotel' }, req());
  await service.create(user, { ...base, categoryId: CAT.travel, sourceName: 'Ground transport (client visits)', quantity: 800, unit: 'km', emissionFactorId: 'ef-taxi' }, req());
  // Category 5 — Waste
  await service.create(user, { ...base, categoryId: CAT.waste, sourceName: 'Office waste', quantity: 240, unit: 'kg' }, req());
  return { diesel, petrol, power, commute };
}

