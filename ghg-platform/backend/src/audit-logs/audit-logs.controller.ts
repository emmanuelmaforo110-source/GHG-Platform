import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

@Controller('audit-logs')
@UseGuards(RolesGuard)
@Roles('admin') // Section 4 RBAC table: only Admin can view audit logs
export class AuditLogsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('entityType') entityType?: string,
    @Query('limit') limit = '100',
  ) {
    return this.prisma.auditLog.findMany({
      where: { organizationId: user.organizationId, ...(entityType ? { entityType } : {}) },
      include: { user: { select: { fullName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(parseInt(limit, 10) || 100, 500),
    });
  }
}
