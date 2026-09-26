import { Body, Controller, Delete, Get, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Put, UseGuards, UseInterceptors } from '@nestjs/common';
import { OffsetsService } from './offsets.service';
import {
  ClaimAttestationDto,
  CreditLotDto,
  RemovalRecordDto,
  RetireCreditsDto,
  TzCarbonProjectDto,
  UpdateCreditLotDto,
} from './dto/offsets.dto';
import { CCP_PRINCIPLES } from './claims.math';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuditLogInterceptor, Audit } from '../common/interceptors/audit-log.interceptor';

const READ = ['admin', 'data_entry', 'management', 'verifier'] as const;

/** Phase 3a (Offset): carbon credits and retirements, removals, Tanzanian projects and claim checks. */
@Controller('offsets')
@UseGuards(RolesGuard)
@UseInterceptors(AuditLogInterceptor)
export class OffsetsController {
  constructor(private service: OffsetsService) {}

  @Get('ccp-principles')
  @Roles(...READ)
  principles() {
    return CCP_PRINCIPLES;
  }

  // ----- Credit lots -----
  @Get('credits')
  @Roles(...READ)
  listLots(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listLots(user);
  }

  @Post('credits')
  @Roles('admin', 'data_entry')
  @Audit({ action: 'create', entityType: 'credit_lots' })
  createLot(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreditLotDto) {
    return this.service.createLot(user, dto);
  }

  @Patch('credits/:id')
  @Roles('admin', 'data_entry')
  @Audit({ action: 'update', entityType: 'credit_lots' })
  updateLot(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCreditLotDto) {
    return this.service.updateLot(user, id, dto);
  }

  @Delete('credits/:id')
  @Roles('admin')
  @Audit({ action: 'delete', entityType: 'credit_lots' })
  deleteLot(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteLot(user, id);
  }

  @Post('credits/:id/retire')
  @Roles('admin')
  @Audit({ action: 'create', entityType: 'credit_retirements' })
  retire(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RetireCreditsDto) {
    return this.service.retire(user, id, dto);
  }

  @Delete('retirements/:id')
  @Roles('admin')
  @Audit({ action: 'delete', entityType: 'credit_retirements' })
  deleteRetirement(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteRetirement(user, id);
  }

  // ----- Removals -----
  @Get('removals')
  @Roles(...READ)
  listRemovals(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listRemovals(user);
  }

  @Post('removals')
  @Roles('admin', 'data_entry')
  @Audit({ action: 'create', entityType: 'removal_records' })
  createRemoval(@CurrentUser() user: AuthenticatedUser, @Body() dto: RemovalRecordDto) {
    return this.service.createRemoval(user, dto);
  }

  @Patch('removals/:id')
  @Roles('admin', 'data_entry')
  @Audit({ action: 'update', entityType: 'removal_records' })
  updateRemoval(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RemovalRecordDto) {
    return this.service.updateRemoval(user, id, dto);
  }

  @Delete('removals/:id')
  @Roles('admin')
  @Audit({ action: 'delete', entityType: 'removal_records' })
  deleteRemoval(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteRemoval(user, id);
  }

  // ----- Tanzanian carbon projects -----
  @Get('tz-projects')
  @Roles(...READ)
  listTz(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listTzProjects(user);
  }

  @Post('tz-projects')
  @Roles('admin', 'data_entry')
  @Audit({ action: 'create', entityType: 'tz_carbon_projects' })
  createTz(@CurrentUser() user: AuthenticatedUser, @Body() dto: TzCarbonProjectDto) {
    return this.service.createTzProject(user, dto);
  }

  @Patch('tz-projects/:id')
  @Roles('admin', 'data_entry')
  @Audit({ action: 'update', entityType: 'tz_carbon_projects' })
  updateTz(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TzCarbonProjectDto) {
    return this.service.updateTzProject(user, id, dto);
  }

  @Delete('tz-projects/:id')
  @Roles('admin')
  @Audit({ action: 'delete', entityType: 'tz_carbon_projects' })
  deleteTz(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteTzProject(user, id);
  }

  // ----- Claims -----
  @Get('claims/:year')
  @Roles(...READ)
  claimCheck(@CurrentUser() user: AuthenticatedUser, @Param('year', ParseIntPipe) year: number) {
    return this.service.claimCheck(user, year);
  }

  @Put('claims/:year/attestation')
  @Roles('admin')
  @Audit({ action: 'update', entityType: 'claim_attestations' })
  saveAttestation(@CurrentUser() user: AuthenticatedUser, @Param('year', ParseIntPipe) year: number, @Body() dto: ClaimAttestationDto) {
    return this.service.saveAttestation(user, year, dto);
  }
}
