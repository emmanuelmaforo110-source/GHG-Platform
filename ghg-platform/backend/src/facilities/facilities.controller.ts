import { Body, Controller, Get, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { FacilitiesService } from './facilities.service';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuditLogInterceptor, Audit } from '../common/interceptors/audit-log.interceptor';

@Controller('facilities')
@UseGuards(RolesGuard)
@UseInterceptors(AuditLogInterceptor)
export class FacilitiesController {
  constructor(private service: FacilitiesService) {}

  @Get()
  @Roles('admin', 'data_entry', 'management')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.list(user);
  }

  @Post()
  @Roles('admin')
  @Audit({ action: 'create', entityType: 'facilities' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: any) {
    return this.service.create(user, dto);
  }
}
