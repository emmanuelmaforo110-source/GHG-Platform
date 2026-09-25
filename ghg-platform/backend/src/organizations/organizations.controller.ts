import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

// Deliberately no :id param routes — a user can only ever see/edit THEIR OWN organization,
// identified from the JWT, never one supplied by the client. This is the multi-tenancy boundary
// in practice, not just in the schema.
@Controller('organization')
@UseGuards(RolesGuard)
export class OrganizationsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @Roles('admin', 'data_entry', 'management', 'verifier')
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.organization.findUnique({ where: { id: user.organizationId } });
  }

  @Patch()
  @Roles('admin')
  update(@CurrentUser() user: AuthenticatedUser, @Body() dto: { name?: string; country?: string }) {
    return this.prisma.organization.update({ where: { id: user.organizationId }, data: dto });
  }
}
