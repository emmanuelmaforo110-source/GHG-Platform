import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { CreateReportingPeriodDto, ReturnToDraftDto, Scope3ScreenDto, UpdateReportingPeriodDto } from './dto/reporting-period.dto';
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
  @Roles('admin', 'data_entry', 'management', 'verifier')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.list(user);
  }

  @Post()
  @Roles('admin')
  @Audit({ action: 'create', entityType: 'reporting_periods' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateReportingPeriodDto) {
    return this.service.create(user, dto);
  }

  /** Change a draft period's settings (staff FTE, boundary, GWP set, recalculation threshold). */
  @Patch(':id')
  @Roles('admin')
  @Audit({ action: 'update', entityType: 'reporting_periods' })
  updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReportingPeriodDto,
  ) {
    return this.service.updateSettings(user, id, dto);
  }

  /** The 15 Scope 3 categories with this period's include/exclude decision and quantified totals. */
  @Get(':id/scope3-screening')
  @Roles('admin', 'data_entry', 'management', 'verifier')
  scope3Screening(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.scope3Screening(user, id);
  }

  @Put(':id/scope3-screening')
  @Roles('admin', 'data_entry')
  @Audit({ action: 'update', entityType: 'scope3_relevance_screen' })
  saveScope3Screen(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Scope3ScreenDto,
  ) {
    return this.service.saveScope3Screen(user, id, dto);
  }

  @Patch(':id/submit')
  @Roles('admin', 'data_entry')
  @Audit({ action: 'submit', entityType: 'reporting_periods' })
  submit(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.submit(user, id);
  }

  @Patch(':id/return')
  @Roles('admin')
  @Audit({ action: 'update', entityType: 'reporting_periods' })
  returnToDraft(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ReturnToDraftDto, @Req() req: any) {
    return this.service.returnToDraft(user, id, dto.reason, req);
  }

  @Patch(':id/approve')
  @Roles('admin')
  @Audit({ action: 'approve', entityType: 'reporting_periods' })
  approve(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.approve(user, id);
  }
}
