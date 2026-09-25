import { Body, Controller, Get, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { EmissionFactorsService } from './emission-factors.service';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuditLogInterceptor, Audit } from '../common/interceptors/audit-log.interceptor';

@Controller('emission-factors')
@UseGuards(RolesGuard)
@UseInterceptors(AuditLogInterceptor)
export class EmissionFactorsController {
  constructor(private service: EmissionFactorsService) {}

  @Get('categories')
  @Roles('admin', 'data_entry', 'management', 'verifier')
  listCategories() {
    return this.service.listCategories();
  }

  @Get()
  @Roles('admin', 'data_entry', 'management', 'verifier') // read-only view for all roles; only Admin can write (below)
  list(@CurrentUser() user: AuthenticatedUser, @Query('year') year?: string) {
    return this.service.list(user, year ? parseInt(year, 10) : undefined);
  }

  @Post()
  @Roles('admin')
  @Audit({ action: 'update', entityType: 'emission_factors' })
  createOverride(@CurrentUser() user: AuthenticatedUser, @Body() dto: any) {
    return this.service.createOverride(user, dto);
  }
}
