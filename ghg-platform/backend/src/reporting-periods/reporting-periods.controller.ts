import { Body, Controller, Get, Param, Patch, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { ReportingPeriodsService } from './reporting-periods.service';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuditLogInterceptor, Audit } from '../common/interceptors/audit-log.interceptor';

@Controller('reporting-periods')
@UseGuards(RolesGuard)
@UseInterceptors(AuditLogInterceptor)
export class ReportingPeriodsController {
  constructor(private service: ReportingPeriodsService) {}

  @Get()
  @Roles('admin', 'data_entry', 'management')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.list(user);
  }

  @Post()
  @Roles('admin')
  @Audit({ action: 'create', entityType: 'reporting_periods' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: any) {
    return this.service.create(user, dto);
  }

  @Patch(':id/submit')
  @Roles('admin', 'data_entry')
  @Audit({ action: 'submit', entityType: 'reporting_periods' })
  submit(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.submit(user, id);
  }

  @Patch(':id/approve')
  @Roles('admin')
  @Audit({ action: 'approve', entityType: 'reporting_periods' })
  approve(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.approve(user, id);
  }
}
