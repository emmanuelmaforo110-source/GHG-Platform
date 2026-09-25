import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityData, EmissionFactor, GhgCategory, ReportingPeriod } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CalculationEngineService } from './calculation-engine.service';
import { CreateActivityDataDto } from './dto/create-activity-data.dto';
import { UpdateActivityDataDto } from './dto/update-activity-data.dto';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { convertQuantity, factorDenominator, isCurrencyUnit } from './units';
import { GasSplit, GwpSetName } from './gwp';

export type CalculationMethodName = 'activity_based' | 'spend_based' | 'supplier_specific';
export const SUPPLIER_SPECIFIC_SOURCE = 'Supplier-reported emissions (supplier-specific method)';

export const GRID_PROXY_NOTE = 'No contractual instrument recorded; grid average used as a proxy for the residual mix.';

/** The calculated part of an entry, before it is saved. Shared by create, update and CSV import. */
export interface PreparedCalculation {
  category: GhgCategory;
  /** Null for supplier-specific entries, where the emissions are entered directly. */
  factor: EmissionFactor | null;
  method: CalculationMethodName;
  gwpSet: GwpSetName;
  gases: GasSplit | null;
  convertedQuantity: number;
  emissionsKg: number;
  market: {
    factor: EmissionFactor | null;
    emissionsKg: number;
    note: string;
  } | null;
}

@Injectable()
export class ActivityDataService {
  constructor(private prisma: PrismaService, private calc: CalculationEngineService) {}

  async list(user: AuthenticatedUser, reportingPeriodId?: string, facilityId?: string) {
    return this.prisma.activityData.findMany({
      where: {
        organizationId: user.organizationId, // tenant scoping — always from the JWT, never the query string
        ...(reportingPeriodId ? { reportingPeriodId } : {}),
        ...(facilityId ? { facilityId } : {}),
        ...(user.restrictedFacilityId ? { facilityId: user.restrictedFacilityId } : {}),
      },
      include: { category: true, attachments: true },
      orderBy: { enteredAt: 'desc' },
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Shared guards
  // ---------------------------------------------------------------------------------------------

  /** Loads a reporting period of the caller's organization and ensures it can still be edited. */
  async getEditablePeriod(user: AuthenticatedUser, reportingPeriodId: string) {
    const period = await this.prisma.reportingPeriod.findFirst({
      where: { id: reportingPeriodId, organizationId: user.organizationId },
    });
    if (!period) throw new NotFoundException('Reporting period not found for this organization.');
    if (period.status !== 'draft') {
      throw new BadRequestException(`This reporting period is ${period.status} and can no longer be edited.`);
    }
    return period;
  }

  /** Ensures the facility belongs to the caller's organization and to their facility restriction. */
  async assertFacilityAccess(user: AuthenticatedUser, facilityId: string) {
    if (user.restrictedFacilityId && facilityId !== user.restrictedFacilityId) {
      throw new BadRequestException('You can only enter data for your assigned facility.');
    }
    const facility = await this.prisma.facility.findFirst({
      where: { id: facilityId, organizationId: user.organizationId },
    });
    if (!facility) throw new NotFoundException('Facility not found for this organization.');
  }

  /** Loads a row of the caller's organization, checking facility restriction and that it's not auto-derived. */
  private async getOwnRow(user: AuthenticatedUser, id: string, action: 'edit' | 'delete'): Promise<ActivityData> {
    const existing = await this.prisma.activityData.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!existing) throw new NotFoundException('Activity data row not found.');
    if (user.restrictedFacilityId && existing.facilityId !== user.restrictedFacilityId) {
      throw new BadRequestException('You do not have access to this facility.');
    }
    if (existing.sourceActivityDataId) {
      throw new BadRequestException(
        `This row is calculated automatically from another entry and cannot be ${action === 'edit' ? 'edited' : 'deleted'} directly. ` +
          `Please ${action} the original Scope 1 or Scope 2 entry instead.`,
      );
    }
    return existing;
  }

  /** An explicitly chosen factor must be a global default or the caller's own, in the given category. */
  private async getExplicitFactor(user: AuthenticatedUser, factorId: string, categoryId: number, label: string) {
    const factor = await this.prisma.emissionFactor.findFirst({
      where: { id: factorId, OR: [{ organizationId: null }, { organizationId: user.organizationId }] },
    });
    if (!factor) throw new NotFoundException(`${label} not found.`);
    if (factor.categoryId !== categoryId) {
      throw new BadRequestException(`The selected ${label.toLowerCase()} belongs to a different category.`);
    }
    return factor;
  }

  // ---------------------------------------------------------------------------------------------
  // Calculation (no database writes)
  // ---------------------------------------------------------------------------------------------

  /**
   * Resolves the category and factors and calculates the emissions for one entry, without saving.
   * For Scope 2 entries it also calculates the market-based result: with the contractual instrument's
   * factor when one is given, otherwise with the grid average (flagged as a proxy).
   */
  async prepare(
    user: AuthenticatedUser,
    period: Pick<ReportingPeriod, 'year'> & Partial<Pick<ReportingPeriod, 'gwpSet'>>,
    input: {
      calculationMethod?: CalculationMethodName | null;
      categoryId: number;
      fuelOrMaterialType?: string | null;
      emissionFactorId?: string | null;
      marketEmissionFactorId?: string | null;
      quantity: number;
      unit: string;
    },
  ): Promise<PreparedCalculation> {
    const category = await this.prisma.ghgCategory.findUnique({ where: { id: input.categoryId } });
    if (!category) throw new NotFoundException('Category not found.');
    const gwpSet = (period.gwpSet ?? 'AR6') as GwpSetName;

    // Supplier-specific: the supplier's reported emissions are entered directly, in kg or t CO2e.
    if (input.calculationMethod === 'supplier_specific') {
      if (input.marketEmissionFactorId) {
        throw new BadRequestException('A market-based emission factor cannot be combined with supplier-reported emissions.');
      }
      let emissionsKg: number;
      try {
        emissionsKg = convertQuantity(input.quantity, input.unit, 'kg CO2e');
      } catch {
        throw new BadRequestException('For supplier-reported emissions, enter the quantity in "kg CO2e" or "t CO2e".');
      }
      return {
        category,
        factor: null,
        method: 'supplier_specific',
        gwpSet,
        gases: null,
        convertedQuantity: emissionsKg,
        emissionsKg,
        market:
          category.scope === 'scope_2'
            ? { factor: null, emissionsKg, note: 'Supplier-reported emissions used for both methods.' }
            : null,
      };
    }

    const factor = input.emissionFactorId
      ? await this.getExplicitFactor(user, input.emissionFactorId, input.categoryId, 'Emission factor')
      : await this.calc.resolveFactor({
          organizationId: user.organizationId,
          categoryId: input.categoryId,
          factorNameHint: input.fuelOrMaterialType,
          year: period.year,
        });

    // A factor "per USD", "per TZS" etc. makes this a spend-based entry.
    const isSpendFactor = isCurrencyUnit(factorDenominator(factor.unit));
    if (input.calculationMethod === 'spend_based' && !isSpendFactor) {
      throw new BadRequestException(
        'Spend-based entries need a spend-based emission factor (per currency unit, e.g. "kg CO2e / USD").',
      );
    }
    const method: CalculationMethodName = isSpendFactor ? 'spend_based' : 'activity_based';

    // Converts e.g. MWh -> kWh or gallons -> litres; rejects incompatible units.
    const { convertedQuantity, emissionsKg, gases } = this.calc.computeWithUnits(input.quantity, input.unit, factor, gwpSet);

    let market: PreparedCalculation['market'] = null;
    if (category.scope === 'scope_2') {
      const marketFactor = input.marketEmissionFactorId
        ? await this.getExplicitFactor(user, input.marketEmissionFactorId, input.categoryId, 'Market-based emission factor')
        : factor;
      market = {
        factor: marketFactor,
        emissionsKg: this.calc.computeWithUnits(input.quantity, input.unit, marketFactor, gwpSet).emissionsKg,
        note: input.marketEmissionFactorId ? `Contractual instrument: ${marketFactor.factorName}` : GRID_PROXY_NOTE,
      };
    } else if (input.marketEmissionFactorId) {
      throw new BadRequestException('A market-based emission factor can only be used for Scope 2 (purchased energy) entries.');
    }

    return { category, factor, method, gwpSet, gases, convertedQuantity, emissionsKg, market };
  }

  /** Maps a prepared calculation onto the activity_data columns. */
  private calculatedColumns(p: PreparedCalculation) {
    return {
      calculationMethod: p.method,
      emissionFactorId: p.factor?.id ?? null,
      emissionFactorValueUsed: p.factor ? p.factor.value : 1,
      emissionFactorUnitUsed: p.factor ? p.factor.unit : 'kg CO2e / kg CO2e',
      emissionFactorSourceUsed: p.factor ? p.factor.source : SUPPLIER_SPECIFIC_SOURCE,
      emissionsKgco2e: p.emissionsKg,
      emissionsTco2e: p.emissionsKg / 1000,
      co2Kg: p.gases?.co2Kg ?? null,
      ch4Kg: p.gases?.ch4Kg ?? null,
      n2oKg: p.gases?.n2oKg ?? null,
      gwpSetUsed: p.gwpSet,
      marketEmissionFactorId: p.market?.factor?.id ?? null,
      marketFactorValueUsed: p.market ? (p.market.factor ? p.market.factor.value : 1) : null,
      marketFactorUnitUsed: p.market ? (p.market.factor ? p.market.factor.unit : 'kg CO2e / kg CO2e') : null,
      marketFactorSourceUsed: p.market ? (p.market.factor ? p.market.factor.source : SUPPLIER_SPECIFIC_SOURCE) : null,
      marketEmissionsKgco2e: p.market ? p.market.emissionsKg : null,
      marketEmissionsTco2e: p.market ? p.market.emissionsKg / 1000 : null,
      marketBasisNote: p.market?.note ?? null,
    };
  }

  // ---------------------------------------------------------------------------------------------
  // Create
  // ---------------------------------------------------------------------------------------------

  async create(user: AuthenticatedUser, dto: CreateActivityDataDto, req: any) {
    await this.assertFacilityAccess(user, dto.facilityId);
    const period = await this.getEditablePeriod(user, dto.reportingPeriodId);
    const prepared = await this.prepare(user, period, dto);

    const row = await this.prisma.activityData.create({
      data: {
        organizationId: user.organizationId,
        facilityId: dto.facilityId,
        reportingPeriodId: dto.reportingPeriodId,
        categoryId: dto.categoryId,
        scope2Method: dto.scope2Method,
        sourceName: dto.sourceName,
        detail: dto.detail,
        fuelOrMaterialType: dto.fuelOrMaterialType,
        quantity: dto.quantity,
        unit: dto.unit,
        dataQualityScore: dto.dataQualityScore ?? null,
        ...this.calculatedColumns(prepared),
        notes: dto.notes,
        enteredBy: user.id,
      },
      include: { category: true },
    });

    // Section 3.3: if this row feeds a derived Scope 3 row (WTT / T&D loss), sync it now.
    await this.calc.syncDerivedRows({ ...row, enteredBy: user.id });

    // Populate audit context for AuditLogInterceptor (see common/interceptors/audit-log.interceptor.ts)
    if (req) req.auditContext = { entityId: row.id, newValue: row };

    return row;
  }

  // ---------------------------------------------------------------------------------------------
  // Update (edit with history — the audit log keeps the old and new values)
  // ---------------------------------------------------------------------------------------------

  async update(user: AuthenticatedUser, id: string, dto: UpdateActivityDataDto, req: any) {
    const existing = await this.getOwnRow(user, id, 'edit');
    if (dto.facilityId && dto.facilityId !== existing.facilityId) {
      await this.assertFacilityAccess(user, dto.facilityId);
    }
    // Both the row's current period and (if moving it) the target period must still be drafts.
    const period = await this.getEditablePeriod(user, existing.reportingPeriodId);
    const targetPeriod =
      dto.reportingPeriodId && dto.reportingPeriodId !== existing.reportingPeriodId
        ? await this.getEditablePeriod(user, dto.reportingPeriodId)
        : period;

    const merged = {
      facilityId: dto.facilityId ?? existing.facilityId,
      reportingPeriodId: targetPeriod.id,
      categoryId: dto.categoryId ?? existing.categoryId,
      scope2Method: dto.scope2Method ?? existing.scope2Method,
      sourceName: dto.sourceName ?? existing.sourceName,
      detail: dto.detail ?? existing.detail,
      fuelOrMaterialType: dto.fuelOrMaterialType ?? existing.fuelOrMaterialType,
      quantity: dto.quantity ?? Number(existing.quantity),
      unit: dto.unit ?? existing.unit,
      notes: dto.notes ?? existing.notes,
      dataQualityScore: dto.dataQualityScore !== undefined ? dto.dataQualityScore : existing.dataQualityScore,
    };

    // Keep the previously used factor unless the caller picked a new one or changed what it depends on.
    const factorInputsChanged =
      merged.categoryId !== existing.categoryId ||
      merged.fuelOrMaterialType !== existing.fuelOrMaterialType ||
      targetPeriod.year !== period.year;
    const factorId =
      dto.emissionFactorId ??
      (factorInputsChanged || dto.calculationMethod === 'supplier_specific' ? null : existing.emissionFactorId);

    // A previously recorded contractual instrument is kept unless the caller changes or clears it (null).
    const hadInstrument = !!existing.marketEmissionFactorId && existing.marketEmissionFactorId !== existing.emissionFactorId;
    const marketFactorId =
      dto.marketEmissionFactorId !== undefined
        ? dto.marketEmissionFactorId
        : hadInstrument && merged.categoryId === existing.categoryId
          ? existing.marketEmissionFactorId
          : null;

    // Spend- vs activity-based follows the chosen factor; only "supplier-specific" is kept explicitly.
    const method: CalculationMethodName | undefined =
      dto.calculationMethod ?? (existing.calculationMethod === 'supplier_specific' ? 'supplier_specific' : undefined);
    const prepared = await this.prepare(user, targetPeriod, {
      calculationMethod: method,
      categoryId: merged.categoryId,
      fuelOrMaterialType: merged.fuelOrMaterialType,
      emissionFactorId: factorId,
      marketEmissionFactorId: marketFactorId,
      quantity: merged.quantity,
      unit: merged.unit,
    });

    const row = await this.prisma.activityData.update({
      where: { id },
      data: {
        ...merged,
        ...this.calculatedColumns(prepared),
        updatedBy: user.id,
      },
      include: { category: true },
    });

    await this.calc.syncDerivedRows({ ...row, enteredBy: user.id });

    if (req) req.auditContext = { entityId: row.id, oldValue: existing, newValue: row };
    return row;
  }

  // ---------------------------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------------------------

  async remove(user: AuthenticatedUser, id: string, req: any) {
    const existing = await this.getOwnRow(user, id, 'delete');
    // Rows in submitted, approved or locked periods must not change.
    await this.getEditablePeriod(user, existing.reportingPeriodId);

    // Delete the automatic WTT / T&D rows together with their source, so they stop counting in totals.
    const [derived] = await this.prisma.$transaction([
      this.prisma.activityData.deleteMany({ where: { sourceActivityDataId: id, organizationId: user.organizationId } }),
      this.prisma.activityData.delete({ where: { id } }),
    ]);

    if (req) req.auditContext = { entityId: id, oldValue: existing };
    return { deleted: true, derivedRowsDeleted: derived.count };
  }
}
