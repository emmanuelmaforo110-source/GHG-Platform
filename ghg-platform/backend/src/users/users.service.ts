import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { InviteUserDto } from './dto/invite-user.dto';

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

  async invite(user: AuthenticatedUser, dto: InviteUserDto) {
    const email = dto.email.trim().toLowerCase();
    if (dto.restrictedFacilityId) {
      const facility = await this.prisma.facility.findFirst({
        where: { id: dto.restrictedFacilityId, organizationId: user.organizationId },
      });
      if (!facility) throw new BadRequestException('The selected facility does not belong to your organization.');
    }
    const existing = await this.prisma.user.findFirst({ where: { organizationId: user.organizationId, email } });
    if (existing) throw new ConflictException('A user with this email already exists in your organization.');

    const passwordHash = await argon2.hash(dto.temporaryPassword);
    return this.prisma.user.create({
      data: {
        organizationId: user.organizationId,
        email,
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
