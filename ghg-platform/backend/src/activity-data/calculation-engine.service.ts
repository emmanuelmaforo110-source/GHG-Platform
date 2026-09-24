import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

/**
 * Implements Section 3 of GHG_Platform_Architecture.md:
 *  3.2 — factor resolution (org override -> global default -> prior-year fallback) + snapshotting
 *  3.3 — derived Scope 3 rows (WTT reuses Scope 1 fuel qty; T&D loss reuses Scope 2 kWh qty)
 *  3.4 — recalculation-threshold check against the org's base year
 *
 * Kept as a separate injectable (rather than static functions) so it can be unit-tested against the
 * reference workbook's known totals (Scope 1 = 9.61 tCO2e, Scope 2 = 6.12 tCO2e, Scope 3 = 12.38 tCO2e)
 * as described in the architecture doc's Phase 4 — see calculation-engine.service.spec.ts.
 */
@Injectable()
export class CalculationEngineService {
  constructor(private prisma: PrismaService) {}

  /** Core formula: emissions_kgco2e = quantity x factor_value. Section 3.1. */
  computeEmissionsKg(quantity: Prisma.Decimal | number, factorValue: Prisma.Decimal | number): number {
    return Number(quantity) * Number(factorValue);
  }

  /**
   * Resolves the applicable emission_factors row for a given category + fuel/material type + year,
   * preferring an organization-specific override over the global default, and falling back to the
   * most recent prior year (flagged) if nothing exists for the exact year. Section 3.2, step 1.
   */
  async resolveFactor(params: {
    organizationId: string;
    categoryId: number;
    factorNameHint?: string; // e.g. fuelOrMaterialType, used to narrow multi-factor categories
    year: number;
  }) {
    const { organizationId, categoryId, factorNameHint, year } = params;

    const nameFilter = factorNameHint
      ? { factorName: { contains: factorNameHint, mode: Prisma.QueryMode.insensitive } }
      : {};

    // 1. Org-specific override for the exact year
    let factor = await this.prisma.emissionFactor.findFirst({
      where: { organizationId, categoryId, validYear: year, ...nameFilter },
    });

    // 2. Global default for the exact year
    if (!factor) {
      factor = await this.prisma.emissionFactor.findFirst({
        where: { organizationId: null, categoryId, validYear: year, ...nameFilter },
      });
    }

    // 3. Fall back to the most recent prior year (org override, then global), and flag for review
    if (!factor) {
      factor = await this.prisma.emissionFactor.findFirst({
        where: { categoryId, validYear: { lt: year }, ...nameFilter },
        orderBy: { validYear: 'desc' },
      });
      if (factor) {
        console.warn(
          `No factor found for category ${categoryId} in ${year}; using ${factor.validYear} value as fallback — flag for Admin review.`,
        );
      }
    }

    if (!factor) {
      throw new NotFoundException(
        `No emission factor available for category ${categoryId}${factorNameHint ? ` / "${factorNameHint}"` : ''} in or before ${year}.`,
      );
    }
    return factor;
  }

  /**
   * Section 3.3 — after a Scope 1 fuel row or Scope 2 electricity row is saved, create/update the
   * derived Scope 3 Category 3 (Fuel- and Energy-Related Activities) rows that reuse its quantity.
   * Idempotent: if a derived row already exists for this source, it is updated rather than duplicated.
   */
  async syncDerivedRows(sourceRow: {
    id: string;
    organizationId: string;
    facilityId: string;
    reportingPeriodId: string;
    categoryId: number;
    fuelOrMaterialType: string | null;
    quantity: Prisma.Decimal;
    unit: string;
    enteredBy: string;
  }) {
    const sourceCategory = await this.prisma.ghgCategory.findUnique({ where: { id: sourceRow.categoryId } });
    if (!sourceCategory) return;

    const scope3FuelEnergyCategory = await this.prisma.ghgCategory.findFirst({
      where: { scope: 'scope_3', scope3CategoryNo: 3 },
    });
    if (!scope3FuelEnergyCategory) return; // reference data not seeded — nothing to derive against

    const period = await this.prisma.reportingPeriod.findUniqueOrThrow({ where: { id: sourceRow.reportingPeriodId } });

    // --- Case A: Scope 1 fuel combustion row -> WTT derived row ---
    if (sourceCategory.scope === 'scope_1' && sourceRow.fuelOrMaterialType) {
      const wttFactorHint = `WTT — ${sourceRow.fuelOrMaterialType.toLowerCase()}`;
      const wttFactor = await this.resolveFactor({
        organizationId: sourceRow.organizationId,
        categoryId: scope3FuelEnergyCategory.id,
        factorNameHint: sourceRow.fuelOrMaterialType, // matches "Well-to-tank (WTT) — diesel" / "— petrol"
        year: period.year,
      }).catch(() => null);
      if (!wttFactor) return; // e.g. LPG has no seeded WTT factor yet — skip rather than fail the parent save

      const emissionsKg = this.computeEmissionsKg(sourceRow.quantity, wttFactor.value);

      await this.prisma.activityData.upsert({
        where: {
          // No natural unique key on (sourceActivityDataId) alone in the schema, so look up first.
          // In a real build, add @@unique([sourceActivityDataId, categoryId]) to enforce this at the DB level.
          id: (await this.findDerivedRow(sourceRow.id, scope3FuelEnergyCategory.id)) ?? '00000000-0000-0000-0000-000000000000',
        },
        update: {
          quantity: sourceRow.quantity,
          unit: sourceRow.unit,
          emissionFactorId: wttFactor.id,
          emissionFactorValueUsed: wttFactor.value,
          emissionFactorUnitUsed: wttFactor.unit,
          emissionFactorSourceUsed: wttFactor.source,
          emissionsKgco2e: emissionsKg,
          emissionsTco2e: emissionsKg / 1000,
          updatedBy: sourceRow.enteredBy,
        },
        create: {
          organizationId: sourceRow.organizationId,
          facilityId: sourceRow.facilityId,
          reportingPeriodId: sourceRow.reportingPeriodId,
          categoryId: scope3FuelEnergyCategory.id,
          sourceName: `WTT — ${sourceRow.fuelOrMaterialType}`,
          detail: `Upstream (well-to-tank) emissions of ${sourceRow.fuelOrMaterialType} recorded in Scope 1`,
          fuelOrMaterialType: sourceRow.fuelOrMaterialType,
          quantity: sourceRow.quantity,
          unit: sourceRow.unit,
          emissionFactorId: wttFactor.id,
          emissionFactorValueUsed: wttFactor.value,
          emissionFactorUnitUsed: wttFactor.unit,
          emissionFactorSourceUsed: wttFactor.source,
          sourceActivityDataId: sourceRow.id,
          derivationNote: 'Auto-derived from linked Scope 1 fuel row; do not edit quantity here — edit the Scope 1 row instead.',
          emissionsKgco2e: emissionsKg,
          emissionsTco2e: emissionsKg / 1000,
          enteredBy: sourceRow.enteredBy,
        },
      });
    }

    // --- Case B: Scope 2 electricity row -> T&D loss derived row ---
    if (sourceCategory.scope === 'scope_2') {
      const tdLossFactor = await this.resolveFactor({
        organizationId: sourceRow.organizationId,
        categoryId: scope3FuelEnergyCategory.id,
        factorNameHint: 'T&D loss rate',
        year: period.year,
      }).catch(() => null);
      const gridFactor = await this.resolveFactor({
        organizationId: sourceRow.organizationId,
        categoryId: sourceRow.categoryId,
        year: period.year,
      }).catch(() => null);
      if (!tdLossFactor || !gridFactor) return;

      const lostKwh = Number(sourceRow.quantity) * Number(tdLossFactor.value);
      const emissionsKg = this.computeEmissionsKg(lostKwh, gridFactor.value);

      await this.prisma.activityData.upsert({
        where: {
          id: (await this.findDerivedRow(sourceRow.id, scope3FuelEnergyCategory.id)) ?? '00000000-0000-0000-0000-000000000000',
        },
        update: {
          quantity: lostKwh,
          unit: 'kWh (lost)',
          emissionFactorId: gridFactor.id,
          emissionFactorValueUsed: gridFactor.value,
          emissionFactorUnitUsed: gridFactor.unit,
          emissionFactorSourceUsed: gridFactor.source,
          emissionsKgco2e: emissionsKg,
          emissionsTco2e: emissionsKg / 1000,
          updatedBy: sourceRow.enteredBy,
        },
        create: {
          organizationId: sourceRow.organizationId,
          facilityId: sourceRow.facilityId,
          reportingPeriodId: sourceRow.reportingPeriodId,
          categoryId: scope3FuelEnergyCategory.id,
          sourceName: 'T&D losses — purchased electricity',
          detail: 'Grid electricity lost before reaching the facility, applying the same grid factor used in Scope 2',
          quantity: lostKwh,
          unit: 'kWh (lost)',
          emissionFactorId: gridFactor.id,
          emissionFactorValueUsed: gridFactor.value,
          emissionFactorUnitUsed: gridFactor.unit,
          emissionFactorSourceUsed: gridFactor.source,
          sourceActivityDataId: sourceRow.id,
          derivationNote: 'Auto-derived: source quantity x grid T&D loss rate x grid factor. Do not edit here — edit the Scope 2 row instead.',
          emissionsKgco2e: emissionsKg,
          emissionsTco2e: emissionsKg / 1000,
          enteredBy: sourceRow.enteredBy,
        },
      });
    }
  }

  private async findDerivedRow(sourceActivityDataId: string, categoryId: number): Promise<string | null> {
    const existing = await this.prisma.activityData.findFirst({
      where: { sourceActivityDataId, categoryId },
      select: { id: true },
    });
    return existing?.id ?? null;
  }

  /**
   * Section 3.4 — compares a reporting period's newly recomputed total against its approved base-year
   * total and flags whether the org's recalculation_threshold_pct has been breached.
   */
  async checkRecalculationThreshold(organizationId: string, currentPeriodId: string): Promise<{
    requiresRecalculation: boolean;
    percentChange: number | null;
    baseYearTotalKg: number | null;
    currentTotalKg: number;
  }> {
    const currentTotal = await this.getPeriodTotalKg(currentPeriodId);

    const baseYear = await this.prisma.reportingPeriod.findFirst({
      where: { organizationId, isBaseYear: true },
    });
    if (!baseYear) return { requiresRecalculation: false, percentChange: null, baseYearTotalKg: null, currentTotalKg: currentTotal };

    const baseYearTotal = await this.getPeriodTotalKg(baseYear.id);
    if (baseYearTotal === 0) return { requiresRecalculation: false, percentChange: null, baseYearTotalKg: baseYearTotal, currentTotalKg: currentTotal };

    const percentChange = Math.abs(((currentTotal - baseYearTotal) / baseYearTotal) * 100);
    const threshold = Number(baseYear.recalculationThresholdPct);

    return {
      requiresRecalculation: percentChange > threshold,
      percentChange,
      baseYearTotalKg: baseYearTotal,
      currentTotalKg: currentTotal,
    };
  }

  private async getPeriodTotalKg(reportingPeriodId: string): Promise<number> {
    const result = await this.prisma.activityData.aggregate({
      where: { reportingPeriodId },
      _sum: { emissionsKgco2e: true },
    });
    return Number(result._sum.emissionsKgco2e ?? 0);
  }
}
