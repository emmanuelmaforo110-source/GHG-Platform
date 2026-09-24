import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Usage: @Roles('admin')  or  @Roles('admin', 'data_entry')
 * Applied alongside RolesGuard (see roles.guard.ts). A route with no @Roles() decorator
 * is accessible to any authenticated user — be deliberate about omitting it.
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
