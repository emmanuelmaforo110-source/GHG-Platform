import { BadRequestException } from '@nestjs/common';
import { DashboardService } from '../dashboard/dashboard.service';
import { parseCsv, toCsv } from '../common/csv';
import { ImportExportService } from './import-export.service';
import { CalculationEngineService } from './calculation-engine.service';
import { ActivityDataService, GRID_PROXY_NOTE } from './activity-data.service';
import { base, CAT, enterWorkbook, makeService, PERIOD, req, seed, user } from './testing/workbook-fixture';

const greenTariff = {
  id: 'ef-green',
  organizationId: null,
  categoryId: CAT.electricity,
  factorName: 'Green tariff (supplier-specific)',
  value: 0,
  unit: 'kg CO2e / kWh',
  validYear: 2026,
  source: 'Supplier disclosure',
};

describe('Scope 2 market-based results', () => {
  it('uses the grid average as a flagged proxy when no contractual instrument is recorded', async () => {
    const prisma = seed();
    const { power } = await enterWorkbook(makeService(prisma));
    const row = prisma.tables.activityData.find((r) => r.id === power.id)!;
    expect(Number(row.emissionsTco2e)).toBeCloseTo(6.12, 6);
    expect(Number(row.marketEmissionsTco2e)).toBeCloseTo(6.12, 6);
    expect(row.marketBasisNote).toBe(GRID_PROXY_NOTE);
  });

  it('uses the contractual instrument for the market-based result and leaves the location-based result unchanged', async () => {
    const prisma = seed();
    prisma.tables.emissionFactor.push(greenTariff);
    const service = makeService(prisma);
    const row = await service.create(
      user,
      { ...base, categoryId: CAT.electricity, sourceName: 'Office electricity', quantity: 18000, unit: 'kWh', emissionFactorId: 'ef-grid', marketEmissionFactorId: 'ef-green' },
      req(),
    );
    expect(Number(row.emissionsTco2e)).toBeCloseTo(6.12, 6);
    expect(Number(row.marketEmissionsTco2e)).toBeCloseTo(0, 6);
    expect(row.marketBasisNote).toContain('Green tariff');
  });

  it('keeps the instrument on edit unless it is cleared with null', async () => {
    const prisma = seed();
    prisma.tables.emissionFactor.push(greenTariff);
    const service = makeService(prisma);
    const row = await service.create(
      user,
      { ...base, categoryId: CAT.electricity, sourceName: 'Office electricity', quantity: 18000, unit: 'kWh', emissionFactorId: 'ef-grid', marketEmissionFactorId: 'ef-green' },
      req(),
    );
    const edited = await service.update(user, row.id, { quantity: 20000 }, req());
    expect(edited.marketEmissionFactorId).toBe('ef-green');
    expect(Number(edited.emissionsTco2e)).toBeCloseTo(6.8, 6);

    const cleared = await service.update(user, row.id, { marketEmissionFactorId: null }, req());
    expect(Number(cleared.marketEmissionsTco2e)).toBeCloseTo(6.8, 6);
    expect(cleared.marketBasisNote).toBe(GRID_PROXY_NOTE);
  });

  it('rejects a market-based factor on a non-Scope 2 entry', async () => {
    const prisma = seed();
    const service = makeService(prisma);
    await expect(
      service.create(user, { ...base, categoryId: CAT.stationary, sourceName: 'Gen', fuelOrMaterialType: 'Diesel', quantity: 1, unit: 'litres', marketEmissionFactorId: 'ef-grid' }, req()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('Data quality score', () => {
  it('is saved on the entry and copied to its automatic rows', async () => {
    const prisma = seed();
    const service = makeService(prisma);
    const diesel = await service.create(
      user,
      { ...base, categoryId: CAT.stationary, sourceName: 'Generator', fuelOrMaterialType: 'Diesel', quantity: 1000, unit: 'litres', dataQualityScore: 2 },
      req(),
    );
    const wtt = prisma.tables.activityData.find((r) => r.sourceActivityDataId === diesel.id)!;
    expect(diesel.dataQualityScore).toBe(2);
    expect(wtt.dataQualityScore).toBe(2);
  });
});

describe('Dashboard summary', () => {
  it('reports both Scope 2 methods and the emissions-weighted data quality', async () => {
    const prisma = seed();
    prisma.tables.emissionFactor.push(greenTariff);
    const service = makeService(prisma);
    await service.create(user, { ...base, categoryId: CAT.stationary, sourceName: 'Generator', fuelOrMaterialType: 'Diesel', quantity: 1000, unit: 'litres', dataQualityScore: 1 }, req());
    await service.create(
      user,
      { ...base, categoryId: CAT.electricity, sourceName: 'Office electricity', quantity: 18000, unit: 'kWh', emissionFactorId: 'ef-grid', marketEmissionFactorId: 'ef-green', dataQualityScore: 4 },
      req(),
    );

    const summary = await new DashboardService(prisma as any).summary(user, PERIOD);
    expect(summary.totals.scope2Tco2e).toBeCloseTo(6.12, 4);
    expect(summary.scope2.locationBasedTco2e).toBeCloseTo(6.12, 4);
    expect(summary.scope2.marketBasedTco2e).toBeCloseTo(0, 4);
    // Score 1: Scope 1 diesel 2.68 t + its WTT row 0.62 t. Score 4: Scope 2 6.12 t + its T&D row 1.0404 t.
    // (3.30*1 + 7.1604*4) / 10.4604 = 3.05
    expect(summary.dataQuality.overall.weightedScore).toBeCloseTo(3.05, 2);
    expect(summary.dataQuality.overall.scoredShare).toBeCloseTo(1, 4);
    expect(summary.dataQuality.scope2.weightedScore).toBe(4);
  });
});

function importService(prisma: ReturnType<typeof seed>) {
  const calc = new CalculationEngineService(prisma as any);
  const activity = new ActivityDataService(prisma as any, calc);
  return new ImportExportService(prisma as any, activity, calc);
}

const WORKBOOK_CSV = [
  'facility,category,source_name,fuel_or_material_type,quantity,unit,emission_factor,market_emission_factor,data_quality,detail,notes',
  'Dar es Salaam Office,Stationary Combustion,Backup generator,Diesel,"1,000",litres,,,2,Fuel receipts,',
  ',Mobile Combustion,Company car,Petrol,3000,litres,,,2,,',
  ',Purchased Electricity,Office electricity,,18000,kWh,Tanzania grid electricity,,1,TANESCO bills,',
  ',Employee Commuting,Staff commuting,,44160,km,,,4,,',
  ',Business Travel,Air travel — short-haul,,6000,passenger-km,short-haul,,3,,',
  ',Business Travel,Hotel nights,,15,room-nights,Hotel stay,,3,,',
  ',Business Travel,Ground transport (client visits),,800,km,taxi,,3,,',
  ',Waste Generated,Office waste,,240,kg,,,5,,',
].join('\n');

describe('CSV import', () => {
  it('previews the whole reference workbook without saving anything', async () => {
    const prisma = seed();
    const result = await importService(prisma).importCsv(user, PERIOD, WORKBOOK_CSV, false);
    expect(result.summary.invalid).toBe(0);
    expect(result.summary.valid).toBe(8);
    expect(result.committed).toBe(false);
    expect(prisma.tables.activityData).toHaveLength(0);
    // Direct lines only (automatic WTT / T&D rows are added on commit): 28.1116 - 3.4304 = 24.6812
    expect(result.summary.totalTco2e).toBeCloseTo(24.6812, 6);
  });

  it('commits a valid file, including the automatic rows, reproducing the 28.1116 t total', async () => {
    const prisma = seed();
    const result = await importService(prisma).importCsv(user, PERIOD, WORKBOOK_CSV, true);
    expect(result.committed).toBe(true);
    expect(result.created).toBe(8);
    const total = prisma.tables.activityData.reduce((s, r) => s + Number(r.emissionsTco2e), 0);
    expect(total).toBeCloseTo(28.1116, 6);
    expect(prisma.tables.activityData.find((r) => r.sourceName === 'Backup generator')!.dataQualityScore).toBe(2);
  });

  it('saves nothing when any row has a problem, and reports each problem by line number', async () => {
    const prisma = seed();
    const csv = [
      'category,source_name,quantity,unit,data_quality',
      'Purchased Electricity,Office electricity,18000,kWh,1',
      'Purchased Electricity,Office electricity,100,litres,1',
      'Unknown category,Something,1,kg,',
      'Stationary Combustion,Generator,-5,litres,9',
    ].join('\n');
    const result = await importService(prisma).importCsv(user, PERIOD, csv, true);
    expect(result.committed).toBe(false);
    expect(prisma.tables.activityData).toHaveLength(0);
    expect(result.summary).toEqual({ rows: 4, valid: 1, invalid: 3, totalTco2e: 6.12 });
    const byLine = Object.fromEntries(result.rows.map((r) => [r.line, r.errors.join(' | ')]));
    expect(byLine[3]).toContain('does not match the emission factor');
    expect(byLine[4]).toContain('Category "Unknown category" was not found');
    expect(byLine[5]).toContain('greater than zero');
    expect(byLine[5]).toContain('Data quality');
  });

  it('asks the user to choose when a factor name is ambiguous', async () => {
    const prisma = seed();
    const csv = ['category,source_name,quantity,unit,emission_factor', 'Business Travel,Flights,100,passenger-km,Air travel'].join('\n');
    const result = await importService(prisma).importCsv(user, PERIOD, csv, false);
    expect(result.rows[0].errors[0]).toContain('matches several');
  });

  it('rejects a file without the required columns', async () => {
    const prisma = seed();
    await expect(importService(prisma).importCsv(user, PERIOD, 'name,amount\nx,1', false)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('refuses to import into a period that is no longer a draft', async () => {
    const prisma = seed('submitted');
    await expect(importService(prisma).importCsv(user, PERIOD, WORKBOOK_CSV, true)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('provides a template that imports cleanly', async () => {
    const prisma = seed();
    const svc = importService(prisma);
    const result = await svc.importCsv(user, PERIOD, svc.templateCsv(), false);
    expect(result.summary.invalid).toBe(0);
  });
});

describe('CSV export', () => {
  it('exports every entry with its factor, market-based result and quality score', async () => {
    const prisma = seed();
    const svc = importService(prisma);
    await svc.importCsv(user, PERIOD, WORKBOOK_CSV, true);
    const { filename, csv } = await svc.exportCsv(user, PERIOD);
    expect(filename).toBe('activity-data-2026.csv');
    const rows = parseCsv(csv);
    expect(rows[0]).toContain('market_emissions_tco2e');
    expect(rows).toHaveLength(1 + 8 + 3); // header + 8 entries + 3 automatic rows
    const power = rows.find((r) => r[4] === 'Office electricity')!;
    expect(power[rows[0].indexOf('market_basis_note')]).toBe(GRID_PROXY_NOTE);
    expect(power[rows[0].indexOf('data_quality')]).toBe('1');
  });
});

describe('CSV helpers', () => {
  it('round-trips quotes, commas and line breaks', () => {
    const rows = [['a', 'b, with comma', 'say "hi"', 'two\nlines']];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });

  it('neutralises spreadsheet formulas in exported text', () => {
    expect(toCsv([['=SUM(A1:A2)', '-5', '+tax']])).toBe("'=SUM(A1:A2),-5,'+tax\r\n");
  });
});
