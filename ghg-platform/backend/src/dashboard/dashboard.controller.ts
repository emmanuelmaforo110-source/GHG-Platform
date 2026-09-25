import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

@Controller('dashboard')
@UseGuards(RolesGuard)
@Roles('admin', 'data_entry', 'management', 'verifier') // all three roles can view; RolesGuard on write endpoints elsewhere blocks mutation
export class DashboardController {
  constructor(private service: DashboardService) {}

  @Get('summary/:reportingPeriodId')
  summary(@CurrentUser() user: AuthenticatedUser, @Param('reportingPeriodId') reportingPeriodId: string) {
    return this.service.summary(user, reportingPeriodId);
  }

  /** Data for the printable GHG inventory report. */
  @Get('report/:reportingPeriodId')
  report(@CurrentUser() user: AuthenticatedUser, @Param('reportingPeriodId') reportingPeriodId: string) {
    return this.service.report(user, reportingPeriodId);
  }

  @Get('period-over-period')
  periodOverPeriod(@CurrentUser() user: AuthenticatedUser) {
    return this.service.periodOverPeriod(user);
  }

  @Get('scope3-completeness/:reportingPeriodId')
  scope3Completeness(@CurrentUser() user: AuthenticatedUser, @Param('reportingPeriodId') reportingPeriodId: string) {
    return this.service.scope3Completeness(user, reportingPeriodId);
  }
}
