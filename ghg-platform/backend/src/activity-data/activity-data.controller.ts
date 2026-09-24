import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { ActivityDataService } from './activity-data.service';
import { CreateActivityDataDto } from './dto/create-activity-data.dto';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { FacilityScopeGuard } from '../common/guards/facility-scope.guard';
import { AuditLogInterceptor, Audit } from '../common/interceptors/audit-log.interceptor';

// Note: JwtAuthGuard is applied globally in app.module.ts (APP_GUARD), so it's not repeated here.
@Controller('activity-data')
@UseGuards(RolesGuard, FacilityScopeGuard)
@UseInterceptors(AuditLogInterceptor)
export class ActivityDataController {
  constructor(private service: ActivityDataService) {}

  @Get()
  @Roles('admin', 'data_entry', 'management')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('reportingPeriodId') reportingPeriodId?: string,
    @Query('facilityId') facilityId?: string,
  ) {
    return this.service.list(user, reportingPeriodId, facilityId);
  }

  @Post()
  @Roles('admin', 'data_entry')
  @Audit({ action: 'create', entityType: 'activity_data' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateActivityDataDto, @Req() req: any) {
    return this.service.create(user, dto, req);
  }

  @Delete(':id')
  @Roles('admin', 'data_entry')
  @Audit({ action: 'delete', entityType: 'activity_data' })
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Req() req: any) {
    return this.service.remove(user, id, req);
  }
}
