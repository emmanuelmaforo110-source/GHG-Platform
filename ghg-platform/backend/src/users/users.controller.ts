import { Body, Controller, Get, Param, Patch, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { UsersService } from './users.service';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuditLogInterceptor, Audit } from '../common/interceptors/audit-log.interceptor';

@Controller('users')
@UseGuards(RolesGuard)
@Roles('admin') // every route here is Admin-only: managing users is Admin's exclusive capability (Section 4 RBAC table)
@UseInterceptors(AuditLogInterceptor)
export class UsersController {
  constructor(private service: UsersService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.list(user);
  }

  @Post()
  @Audit({ action: 'create', entityType: 'users' })
  invite(@CurrentUser() user: AuthenticatedUser, @Body() dto: any) {
    return this.service.invite(user, dto);
  }

  @Patch(':id/deactivate')
  @Audit({ action: 'update', entityType: 'users' })
  deactivate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.deactivate(user, id);
  }
}
