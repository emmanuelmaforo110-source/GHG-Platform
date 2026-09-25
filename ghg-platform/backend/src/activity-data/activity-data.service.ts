import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityData } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CalculationEngineService } from './calculation-engine.service';
import { CreateActivityDataDto } from './dto/create-activity-data.dto';
import { UpdateActivityDataDto } from './dto/update-activity-data.dto';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';

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
  private async getEditablePeriod(user: AuthenticatedUser, reportingPeriodId: string) {
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
  private async assertFacilityAccess(user: AuthenticatedUser, facilityId: string) {
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

  /**
   * Resolves the emission factor for a row: an explicit factor id (must be a global default or the
   * caller's own organization's factor, in the same category), or auto-resolution by category/fuel/year.
   */
  private async resolveFactorFor(
    user: AuthenticatedUser,
    params: { categoryId: number; fuelOrMaterialType?: string | null; emissionFactorId?: string | null; year: number },
  ) {
    if (params.emissionFactorId) {
      const factor = await this.prisma.emissionFactor.findFirst({
        where: {
          id: params.emissionFactorId,
          OR: [{ organizationId: null }, { organizationId: user.organizationId }],
        },
      });
      if (!factor) throw new NotFoundException('Emission factor not found.');
      if (factor.categoryId !== params.categoryId) {
        throw new BadRequestException('The selected emission factor belongs to a different category.');
      }
      return factor;
    }
    return this.calc.resolveFactor({
      organizationId: user.organizationId,
      categoryId: params.categoryId,
      factorNameHint: params.fuelOrMaterialType,
      year: params.year,
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Create
  // ---------------------------------------------------------------------------------------------

  async create(user: AuthenticatedUser, dto: CreateActivityDataDto, req: any) {
    await this.assertFacilityAccess(user, dto.facilityId);
    const period = await this.getEditablePeriod(user, dto.reportingPeriodId);

    const factor = await this.resolveFactorFor(user, {
      categoryId: dto.categoryId,
      fuelOrMaterialType: dto.fuelOrMaterialType,
      emissionFactorId: dto.emissionFactorId,
      year: period.year,
    });

    // Converts e.g. MWh -> kWh or gallons -> litres; rejects incompatible units.
    const { emissionsKg } = this.calc.computeWithUnits(dto.quantity, dto.unit, factor);

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
        emissionFactorId: factor.id,
        emissionFactorValueUsed: factor.value,
        emissionFactorUnitUsed: factor.unit,
        emissionFactorSourceUsed: factor.source,
        emissionsKgco2e: emissionsKg,
        emissionsTco2e: emissionsKg / 1000,
        notes: dto.notes,
        enteredBy: user.id,
      },
      include: { category: true },
    });

    // Section 3.3: if this row feeds a derived Scope 3 row (WTT / T&D loss), sync it now.
    await this.calc.syncDerivedRows({ ...row, enteredBy: user.id });

    // Populate audit context for AuditLogInterceptor (see common/interceptors/audit-log.interceptor.ts)
    req.auditContext = { entityId: row.id, newValue: row };

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
    };

    // Keep the previously used factor unless the caller picked a new one or changed what it depends on.
    const factorInputsChanged =
      merged.categoryId !== existing.categoryId ||
      merged.fuelOrMaterialType !== existing.fuelOrMaterialType ||
      targetPeriod.year !== period.year;
    const factorId = dto.emissionFactorId ?? (factorInputsChanged ? null : existing.emissionFactorId);

    const factor = await this.resolveFactorFor(user, {
      categoryId: merged.categoryId,
      fuelOrMaterialType: merged.fuelOrMaterialType,
      emissionFactorId: factorId,
      year: targetPeriod.year,
    });
    const { emissionsKg } = this.calc.computeWithUnits(merged.quantity, merged.unit, factor);

    const row = await this.prisma.activityData.update({
      where: { id },
      data: {
        ...merged,
        emissionFactorId: factor.id,
        emissionFactorValueUsed: factor.value,
        emissionFactorUnitUsed: factor.unit,
        emissionFactorSourceUsed: factor.source,
        emissionsKgco2e: emissionsKg,
        emissionsTco2e: emissionsKg / 1000,
        updatedBy: user.id,
      },
      include: { category: true },
    });

    await this.calc.syncDerivedRows({ ...row, enteredBy: user.id });

    req.auditContext = { entityId: row.id, oldValue: existing, newValue: row };
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

    req.auditContext = { entityId: id, oldValue: existing };
    return { deleted: true, derivedRowsDeleted: derived.count };
  }
}
