import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { FacilitiesService } from './facilities.service';
import { CreateFacilityDto, UpdateFacilityDto } from './dto/facility.dto';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuditLogInterceptor, Audit } from '../common/interceptors/audit-log.interceptor';

@Controller('facilities')
@UseGuards(RolesGuard)
@UseInterceptors(AuditLogInterceptor)
export class FacilitiesController {
  constructor(private service: FacilitiesService) {}

  /** `?includeInactive=true` (Admin page) also returns inactive facilities and entry counts. */
  @Get()
  @Roles('admin', 'data_entry', 'management', 'verifier')
  list(@CurrentUser() user: AuthenticatedUser, @Query('includeInactive') includeInactive?: string) {
    return this.service.list(user, includeInactive === 'true');
  }

  @Post()
  @Roles('admin')
  @Audit({ action: 'create', entityType: 'facilities' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateFacilityDto) {
    return this.service.create(user, dto);
  }

  @Patch(':id')
  @Roles('admin')
  @Audit({ action: 'update', entityType: 'facilities' })
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateFacilityDto, @Req() req: any) {
    return this.service.update(user, id, dto, req);
  }
}
