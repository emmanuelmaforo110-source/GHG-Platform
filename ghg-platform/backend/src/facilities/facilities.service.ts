import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';

@Injectable()
export class FacilitiesService {
  constructor(private prisma: PrismaService) {}

  list(user: AuthenticatedUser) {
    return this.prisma.facility.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  create(user: AuthenticatedUser, dto: { name: string; address?: string; country?: string }) {
    return this.prisma.facility.create({
      data: { organizationId: user.organizationId, ...dto },
    });
  }
}
