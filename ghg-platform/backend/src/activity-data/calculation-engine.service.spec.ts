import { BadRequestException } from '@nestjs/common';
import { CalculationEngineService } from './calculation-engine.service';
import { createFakePrisma } from './testing/fake-prisma';

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

  it('converts units before applying the factor (18 MWh = 18,000 kWh)', () => {
    const { emissionsKg } = engine.computeWithUnits(18, 'MWh', { value: 0.34 as any, unit: 'kg CO2e / kWh' });
    expect(emissionsKg).toBeCloseTo(6120, 4);
  });

  it('rejects a quantity whose unit does not fit the factor (litres vs per-kWh)', () => {
    expect(() => engine.computeWithUnits(100, 'litres', { value: 0.34 as any, unit: 'kg CO2e / kWh' })).toThrow(
      BadRequestException,
    );
  });
});

describe('CalculationEngineService.pickFactor', () => {
  const engine = new CalculationEngineService(null as any);
  const travel = [
    { factorName: 'Air travel — short-haul (avg, econ.)' },
    { factorName: 'Air travel — long-haul (avg, econ.)' },
    { factorName: 'Hotel stay' },
  ];

  it('prefers an exact name match', () => {
    expect(engine.pickFactor(travel, 'hotel stay')?.factorName).toBe('Hotel stay');
  });

  it('accepts a single partial match', () => {
    expect(engine.pickFactor(travel, 'long-haul')?.factorName).toBe('Air travel — long-haul (avg, econ.)');
  });

  it('refuses to guess when several factors match', () => {
    expect(() => engine.pickFactor(travel, 'air travel')).toThrow(BadRequestException);
  });

  it('refuses to guess when no hint is given and the category has several factors', () => {
    expect(() => engine.pickFactor(travel, undefined)).toThrow(BadRequestException);
  });

  it('uses the only factor when the category has just one', () => {
    expect(engine.pickFactor([{ factorName: 'Tanzania grid electricity' }], undefined)?.factorName).toBe(
      'Tanzania grid electricity',
    );
  });

  it('returns null when nothing matches', () => {
    expect(engine.pickFactor(travel, 'rail')).toBeNull();
  });
});

describe('CalculationEngineService.resolveFactor', () => {
  const ORG_A = 'org-a';
  const ORG_B = 'org-b';
  const factor = (over: Record<string, unknown>) => ({
    id: `f-${Math.random()}`,
    organizationId: null,
    categoryId: 1,
    factorName: 'Automotive diesel (combustion)',
    value: 2.68,
    unit: 'kg CO2e / litre',
    validYear: 2026,
    source: 'test',
    ...over,
  });

  it("prefers the organization's own override over the global default", async () => {
    const prisma = createFakePrisma({
      emissionFactor: [factor({ id: 'global' }), factor({ id: 'own', organizationId: ORG_A, value: 2.7 })],
    });
    const engine = new CalculationEngineService(prisma as any);
    const f = await engine.resolveFactor({ organizationId: ORG_A, categoryId: 1, factorNameHint: 'diesel', year: 2026 });
    expect(f.id).toBe('own');
  });

  it("never falls back to another organization's private factor", async () => {
    const prisma = createFakePrisma({
      emissionFactor: [
        factor({ id: 'other-org-2025', organizationId: ORG_B, validYear: 2025 }),
        factor({ id: 'global-2024', validYear: 2024 }),
      ],
    });
    const engine = new CalculationEngineService(prisma as any);
    const f = await engine.resolveFactor({ organizationId: ORG_A, categoryId: 1, factorNameHint: 'diesel', year: 2026 });
    expect(f.id).toBe('global-2024');
    expect(f.isPriorYearFallback).toBe(true);
  });
});
