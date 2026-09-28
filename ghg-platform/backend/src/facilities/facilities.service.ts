import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { CreateFacilityDto, UpdateFacilityDto } from './dto/facility.dto';

const clean = (v?: string) => (v === undefined ? undefined : v.trim() || null);

@Injectable()
export class FacilitiesService {
  constructor(private prisma: PrismaService) {}

  /** Active facilities (for data entry), or all of them with entry counts (for the Admin page). */
  async list(user: AuthenticatedUser, includeInactive = false) {
    const facilities = await this.prisma.facility.findMany({
      where: { organizationId: user.organizationId, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: { name: 'asc' },
    });
    if (!includeInactive) return facilities;
    const entries = await this.prisma.activityData.findMany({
      where: { organizationId: user.organizationId },
      select: { facilityId: true },
    });
    return facilities.map((f) => ({ ...f, entryCount: entries.filter((e) => e.facilityId === f.id).length }));
  }

  private async assertUniqueName(user: AuthenticatedUser, name: string, exceptId?: string) {
    const all = await this.prisma.facility.findMany({ where: { organizationId: user.organizationId } });
    const clash = all.find((f) => f.id !== exceptId && f.name.trim().toLowerCase() === name.trim().toLowerCase());
    if (clash) throw new BadRequestException(`A facility called "${clash.name}" already exists.`);
  }

  async create(user: AuthenticatedUser, dto: CreateFacilityDto) {
    await this.assertUniqueName(user, dto.name);
    return this.prisma.facility.create({
      data: {
        organizationId: user.organizationId,
        name: dto.name.trim(),
        address: clean(dto.address),
        country: clean(dto.country),
      },
    });
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateFacilityDto, req?: { auditContext?: unknown }) {
    const existing = await this.prisma.facility.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!existing) throw new NotFoundException('Facility not found.');
    if (dto.name !== undefined) await this.assertUniqueName(user, dto.name, id);
    if (dto.isActive === false) {
      const restricted = await this.prisma.user.findMany({ where: { organizationId: user.organizationId, restrictedFacilityId: id } });
      if (restricted.length) {
        throw new BadRequestException(
          `${restricted.length} user(s) can only enter data for this facility. Change their access on the Users page first.`,
        );
      }
    }
    const updated = await this.prisma.facility.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        address: clean(dto.address),
        country: clean(dto.country),
        isActive: dto.isActive,
      },
    });
    if (req) req.auditContext = { entityId: id, oldValue: existing, newValue: updated };
    return updated;
  }
}
