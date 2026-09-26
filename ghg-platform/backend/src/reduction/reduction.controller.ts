import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { ReductionService } from './reduction.service';
import { ReductionInitiativeDto, ReductionTargetDto, UpdateReductionInitiativeDto } from './dto/reduction.dto';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuditLogInterceptor, Audit } from '../common/interceptors/audit-log.interceptor';

/** Phase 2 (Reduce): reduction targets, initiatives, marginal abatement cost curve and scenarios. */
@Controller('reduction')
@UseGuards(RolesGuard)
@UseInterceptors(AuditLogInterceptor)
export class ReductionController {
  constructor(private service: ReductionService) {}

  @Get('overview')
  @Roles('admin', 'data_entry', 'management', 'verifier')
  overview(
    @CurrentUser() user: AuthenticatedUser,
    @Query('currency') currency?: string,
    @Query('growthPct') growthPct?: string,
  ) {
    const g = growthPct !== undefined && growthPct !== '' ? Number(growthPct) : undefined;
    return this.service.overview(user, { currency, growthPct: g !== undefined && Number.isFinite(g) ? g : undefined });
  }

  // ----- Targets (set by Admins) -----

  @Get('targets')
  @Roles('admin', 'data_entry', 'management', 'verifier')
  listTargets(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listTargets(user);
  }

  @Post('targets')
  @Roles('admin')
  @Audit({ action: 'create', entityType: 'reduction_targets' })
  createTarget(@CurrentUser() user: AuthenticatedUser, @Body() dto: ReductionTargetDto) {
    return this.service.createTarget(user, dto);
  }

  @Delete('targets/:id')
  @Roles('admin')
  @Audit({ action: 'delete', entityType: 'reduction_targets' })
  deleteTarget(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteTarget(user, id);
  }

  // ----- Initiatives -----

  @Get('initiatives')
  @Roles('admin', 'data_entry', 'management', 'verifier')
  listInitiatives(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listInitiatives(user);
  }

  @Post('initiatives')
  @Roles('admin', 'data_entry')
  @Audit({ action: 'create', entityType: 'reduction_initiatives' })
  createInitiative(@CurrentUser() user: AuthenticatedUser, @Body() dto: ReductionInitiativeDto) {
    return this.service.createInitiative(user, dto);
  }

  @Patch('initiatives/:id')
  @Roles('admin', 'data_entry')
  @Audit({ action: 'update', entityType: 'reduction_initiatives' })
  updateInitiative(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReductionInitiativeDto,
  ) {
    return this.service.updateInitiative(user, id, dto);
  }

  @Delete('initiatives/:id')
  @Roles('admin')
  @Audit({ action: 'delete', entityType: 'reduction_initiatives' })
  deleteInitiative(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteInitiative(user, id);
  }
}
