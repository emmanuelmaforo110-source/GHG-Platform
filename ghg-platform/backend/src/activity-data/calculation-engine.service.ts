import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmissionFactor, Prisma } from '@prisma/client';
import { toFactorUnit } from './units';

/**
 * Implements Section 3 of GHG_Platform_Architecture.md:
 *  3.2 — factor resolution (org override -> global default -> prior-year fallback) + snapshotting
 *  3.3 — derived Scope 3 rows (WTT reuses Scope 1 fuel qty; T&D loss reuses Scope 2 kWh qty)
 *  3.4 — recalculation-threshold check against the org's base year
 *
 * Phase 0 hardening (see GHG Platform Roadmap):
 *  - Factor matching is exact-first and refuses to guess when several factors could apply.
 *  - Prior-year fallback only looks at the caller's own organization and global defaults
 *    (it previously could pick up another tenant's private override).
 *  - Quantities are converted to the factor's unit before multiplying (see units.ts).
 *  - Derived rows are updated/created without the dummy-UUID upsert, and stale ones are removed.
 */
@Injectable()
export class CalculationEngineService {
  constructor(private prisma: PrismaService) {}

  /** Core formula: emissions_kgco2e = quantity x factor_value. Section 3.1. */
  computeEmissionsKg(quantity: Prisma.Decimal | number, factorValue: Prisma.Decimal | number): number {
    return Number(quantity) * Number(factorValue);
  }

  /**
   * Converts the activity quantity to the factor's unit, then applies the factor.
   * Throws BadRequestException if the units are incompatible.
   */
  computeWithUnits(
    quantity: Prisma.Decimal | number,
    activityUnit: string,
    factor: Pick<EmissionFactor, 'value' | 'unit'>,
  ): { convertedQuantity: number; emissionsKg: number } {
    const convertedQuantity = toFactorUnit(Number(quantity), activityUnit, factor.unit);
    return { convertedQuantity, emissionsKg: this.computeEmissionsKg(convertedQuantity, factor.value) };
  }

  /**
   * Picks exactly one factor from a candidate list:
   *  1. exact factor-name match (case-insensitive) with the hint,
   *  2. otherwise the single candidate whose name contains the hint,
   *  3. with no hint, the category's only factor.
   * Returns null when nothing matches; throws when the choice is ambiguous.
   */
  pickFactor<T extends { factorName: string }>(candidates: T[], hint?: string | null): T | null {
    if (candidates.length === 0) return null;
    const h = hint?.trim().toLowerCase();

    if (h) {
      const exact = candidates.filter((c) => c.factorName.trim().toLowerCase() === h);
      if (exact.length === 1) return exact[0];
      const partial = candidates.filter((c) => c.factorName.toLowerCase().includes(h));
      if (partial.length === 1) return partial[0];
      if (partial.length > 1) {
        throw new BadRequestException(
          `"${hint}" matches more than one emission factor (${partial.map((c) => c.factorName).join('; ')}). ` +
            'Choose the exact emission factor instead.',
        );
      }
      return null;
    }

    if (candidates.length === 1) return candidates[0];
    throw new BadRequestException(
      `This category has several emission factors (${candidates.map((c) => c.factorName).join('; ')}). ` +
        'Enter the fuel or material type, or choose the exact emission factor.',
    );
  }

  /**
   * Resolves the applicable emission_factors row for a given category + fuel/material type + year,
   * preferring an organization-specific override over the global default, and falling back to the
   * most recent prior year (flagged) if nothing exists for the exact year. Section 3.2, step 1.
   */
  async resolveFactor(params: {
    organizationId: string;
    categoryId: number;
    factorNameHint?: string | null; // e.g. fuelOrMaterialType, used to narrow multi-factor categories
    year: number;
  }): Promise<EmissionFactor & { isPriorYearFallback?: boolean }> {
    const { organizationId, categoryId, factorNameHint, year } = params;

    // 1. Org-specific override for the exact year
    const orgExact = await this.prisma.emissionFactor.findMany({
      where: { organizationId, categoryId, validYear: year },
    });
    let factor = this.pickFactor(orgExact, factorNameHint);

    // 2. Global default for the exact year
    if (!factor) {
      const globalExact = await this.prisma.emissionFactor.findMany({
        where: { organizationId: null, categoryId, validYear: year },
      });
      factor = this.pickFactor(globalExact, factorNameHint);
    }

    // 3. Most recent prior year — own org first, then global; never another organization's factors.
    if (!factor) {
      const prior = await this.prisma.emissionFactor.findMany({
        where: { categoryId, validYear: { lt: year }, OR: [{ organizationId }, { organizationId: null }] },
        orderBy: { validYear: 'desc' },
      });
      const years = [...new Set(prior.map((f) => f.validYear))];
      for (const y of years) {
        const sameYear = prior.filter((f) => f.validYear === y);
        const own = this.pickFactor(sameYear.filter((f) => f.organizationId === organizationId), factorNameHint);
        const picked = own ?? this.pickFactor(sameYear.filter((f) => f.organizationId === null), factorNameHint);
        if (picked) {
          console.warn(
            `No factor found for category ${categoryId} in ${year}; using ${picked.validYear} value as fallback — flag for Admin review.`,
          );
          return { ...picked, isPriorYearFallback: true };
        }
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
   * Idempotent: if a derived row already exists for this source, it is updated rather than duplicated;
   * if the source no longer qualifies (e.g. fuel changed to one without a WTT factor), the stale
   * derived row is deleted so it stops counting in totals.
   */
  async syncDerivedRows(sourceRow: {
    id: string;
    organizationId: string;
    facilityId: string;
    reportingPeriodId: string;
    categoryId: number;
    fuelOrMaterialType: string | null;
    quantity: Prisma.Decimal | number;
    unit: string;
    emissionFactorId?: string | null;
    dataQualityScore?: number | null;
    enteredBy: string;
  }) {
    const sourceCategory = await this.prisma.ghgCategory.findUnique({ where: { id: sourceRow.categoryId } });
    if (!sourceCategory) return;

    const scope3FuelEnergyCategory = await this.prisma.ghgCategory.findFirst({
      where: { scope: 'scope_3', scope3CategoryNo: 3 },
    });
    if (!scope3FuelEnergyCategory) return; // reference data not seeded — nothing to derive against

    const period = await this.prisma.reportingPeriod.findUniqueOrThrow({ where: { id: sourceRow.reportingPeriodId } });
    const existingId = await this.findDerivedRow(sourceRow.id, scope3FuelEnergyCategory.id);

    let derived: Omit<Prisma.ActivityDataUncheckedCreateInput, 'enteredBy'> | null = null;

    // --- Case A: Scope 1 fuel combustion row -> WTT derived row ---
    if (sourceCategory.scope === 'scope_1' && sourceRow.fuelOrMaterialType) {
      const wttFactor = await this.resolveFactor({
        organizationId: sourceRow.organizationId,
        categoryId: scope3FuelEnergyCategory.id,
        factorNameHint: `Well-to-tank (WTT) — ${sourceRow.fuelOrMaterialType}`,
        year: period.year,
      })
        .catch(() =>
          this.resolveFactor({
            organizationId: sourceRow.organizationId,
            categoryId: scope3FuelEnergyCategory.id,
            factorNameHint: sourceRow.fuelOrMaterialType,
            year: period.year,
          }),
        )
        .catch(() => null); // e.g. LPG has no seeded WTT factor yet — skip rather than fail the parent save

      if (wttFactor) {
        const { emissionsKg } = this.computeWithUnits(sourceRow.quantity, sourceRow.unit, wttFactor);
        derived = {
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
          dataQualityScore: sourceRow.dataQualityScore ?? null, // inherits the quality of its source entry
          derivationNote:
            'Auto-derived from linked Scope 1 fuel row; do not edit quantity here — edit the Scope 1 row instead.',
          emissionsKgco2e: emissionsKg,
          emissionsTco2e: emissionsKg / 1000,
        };
      }
    }

    // --- Case B: Scope 2 electricity row -> T&D loss derived row ---
    if (sourceCategory.scope === 'scope_2') {
      const tdLossFactor = await this.resolveFactor({
        organizationId: sourceRow.organizationId,
        categoryId: scope3FuelEnergyCategory.id,
        factorNameHint: 'T&D loss rate',
        year: period.year,
      }).catch(() => null);
      // Use the exact grid factor the Scope 2 row was calculated with — never re-guess it.
      const gridFactor = sourceRow.emissionFactorId
        ? await this.prisma.emissionFactor.findUnique({ where: { id: sourceRow.emissionFactorId } })
        : null;

      if (tdLossFactor && gridFactor) {
        const kwhDelivered = toFactorUnit(Number(sourceRow.quantity), sourceRow.unit, gridFactor.unit);
        const lostKwh = kwhDelivered * Number(tdLossFactor.value);
        const emissionsKg = this.computeEmissionsKg(lostKwh, gridFactor.value);
        derived = {
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
          dataQualityScore: sourceRow.dataQualityScore ?? null, // inherits the quality of its source entry
          derivationNote:
            'Auto-derived: source quantity x grid T&D loss rate x grid factor. Do not edit here — edit the Scope 2 row instead.',
          emissionsKgco2e: emissionsKg,
          emissionsTco2e: emissionsKg / 1000,
        };
      }
    }

    if (derived && existingId) {
      const { organizationId, sourceActivityDataId, ...changes } = derived;
      await this.prisma.activityData.update({
        where: { id: existingId },
        data: { ...changes, updatedBy: sourceRow.enteredBy },
      });
    } else if (derived) {
      await this.prisma.activityData.create({ data: { ...derived, enteredBy: sourceRow.enteredBy } });
    } else if (existingId) {
      // Source no longer produces a derived row — remove the stale one so it stops counting.
      await this.prisma.activityData.delete({ where: { id: existingId } });
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
