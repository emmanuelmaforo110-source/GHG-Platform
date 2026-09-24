import { CalculationEngineService } from './calculation-engine.service';

describe('CalculationEngineService.computeEmissionsKg', () => {
  const engine = new CalculationEngineService(null as any); // pure function — no Prisma calls needed here

  it('matches the Scope 1 backup generator line from the reference workbook (1000L diesel x 2.68)', () => {
    expect(engine.computeEmissionsKg(1000, 2.68)).toBeCloseTo(2680, 4);
  });

  it('matches the Scope 1 company vehicle line (3000L petrol x 2.31)', () => {
    expect(engine.computeEmissionsKg(3000, 2.31)).toBeCloseTo(6930, 4);
  });

  it('matches the Scope 2 office electricity line (18,000 kWh x 0.34)', () => {
    expect(engine.computeEmissionsKg(18000, 0.34)).toBeCloseTo(6120, 4);
  });

  it('matches the Scope 3 employee commuting line (44,160 km x 0.17)', () => {
    expect(engine.computeEmissionsKg(44160, 0.17)).toBeCloseTo(7507.2, 4);
  });
});

/**
 * INTEGRATION TEST — requires a seeded test database (see README "Running tests").
 * This is the regression baseline referenced in GHG_Platform_Architecture.md Phase 4: after seeding
 * the demo organization and entering every activity-data row from Pemandu_GHG_Inventory_Calculator.xlsx
 * through the API, the reporting-period totals must match the workbook exactly:
 *
 *   Scope 1 total: 9.61 tCO2e
 *   Scope 2 total: 6.12 tCO2e
 *   Scope 3 total: 12.3816 tCO2e (quantified categories only)
 *   Grand total:   28.1116 tCO2e
 *
 * Implement this once the dashboard aggregation service (Section 5) exists — it should call the same
 * aggregation query the dashboard uses, so the test also guards against dashboard totals drifting from
 * the underlying activity_data rows.
 */
describe.skip('Full-inventory regression against Pemandu_GHG_Inventory_Calculator.xlsx (integration)', () => {
  it.todo('reproduces Scope 1 = 9.61 tCO2e, Scope 2 = 6.12 tCO2e, Scope 3 = 12.3816 tCO2e');
});
