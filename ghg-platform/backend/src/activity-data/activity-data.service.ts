import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CalculationEngineService } from './calculation-engine.service';
import { CreateActivityDataDto } from './dto/create-activity-data.dto';
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

  async create(user: AuthenticatedUser, dto: CreateActivityDataDto, req: any) {
    // Facility-scope defense in depth (FacilityScopeGuard already checks this at the route level).
    if (user.restrictedFacilityId && dto.facilityId !== user.restrictedFacilityId) {
      throw new BadRequestException('You can only enter data for your assigned facility.');
    }

    const period = await this.prisma.reportingPeriod.findFirst({
      where: { id: dto.reportingPeriodId, organizationId: user.organizationId },
    });
    if (!period) throw new NotFoundException('Reporting period not found for this organization.');
    if (period.status !== 'draft') {
      throw new BadRequestException(`This reporting period is ${period.status} and can no longer be edited.`);
    }

    // Resolve the emission factor: explicit override from the DTO, or auto-resolved by category/fuel/year.
    const factor = dto.emissionFactorId
      ? await this.prisma.emissionFactor.findUniqueOrThrow({ where: { id: dto.emissionFactorId } })
      : await this.calc.resolveFactor({
          organizationId: user.organizationId,
          categoryId: dto.categoryId,
          factorNameHint: dto.fuelOrMaterialType,
          year: period.year,
        });

    const emissionsKg = this.calc.computeEmissionsKg(dto.quantity, factor.value);

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
    await this.calc.syncDerivedRows({
      id: row.id,
      organizationId: row.organizationId,
      facilityId: row.facilityId,
      reportingPeriodId: row.reportingPeriodId,
      categoryId: row.categoryId,
      fuelOrMaterialType: row.fuelOrMaterialType,
      quantity: row.quantity,
      unit: row.unit,
      enteredBy: user.id,
    });

    // Populate audit context for AuditLogInterceptor (see common/interceptors/audit-log.interceptor.ts)
    req.auditContext = { entityId: row.id, newValue: row };

    return row;
  }

  async remove(user: AuthenticatedUser, id: string, req: any) {
    const existing = await this.prisma.activityData.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!existing) throw new NotFoundException('Activity data row not found.');
    if (user.restrictedFacilityId && existing.facilityId !== user.restrictedFacilityId) {
      throw new BadRequestException('You do not have access to this facility.');
    }

    await this.prisma.activityData.delete({ where: { id } });
    req.auditContext = { entityId: id, oldValue: existing };
    return { deleted: true };
  }
}
