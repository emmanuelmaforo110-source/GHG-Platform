import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  list(user: AuthenticatedUser) {
    return this.prisma.user.findMany({
      where: { organizationId: user.organizationId },
      select: {
        id: true, email: true, fullName: true, role: true, restrictedFacilityId: true,
        isActive: true, lastLoginAt: true, createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async invite(
    user: AuthenticatedUser,
    dto: { email: string; fullName: string; role: UserRole; restrictedFacilityId?: string; temporaryPassword: string },
  ) {
    const passwordHash = await argon2.hash(dto.temporaryPassword);
    return this.prisma.user.create({
      data: {
        organizationId: user.organizationId,
        email: dto.email,
        fullName: dto.fullName,
        role: dto.role,
        restrictedFacilityId: dto.restrictedFacilityId,
        passwordHash,
      },
      select: { id: true, email: true, fullName: true, role: true },
    });
  }

  deactivate(user: AuthenticatedUser, targetUserId: string) {
    return this.prisma.user.updateMany({
      where: { id: targetUserId, organizationId: user.organizationId },
      data: { isActive: false },
    });
  }
}
