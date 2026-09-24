import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';

@Injectable()
export class EmissionFactorsService {
  constructor(private prisma: PrismaService) {}

  async listCategories() {
    return this.prisma.ghgCategory.findMany({
      orderBy: [{ scope: 'asc' }, { scope3CategoryNo: 'asc' }, { name: 'asc' }],
    });
  }

  /** Returns global defaults plus this org's overrides, so the Admin UI can badge "Default" vs "Verified". */
  async list(user: AuthenticatedUser, year?: number) {
    return this.prisma.emissionFactor.findMany({
      where: {
        OR: [{ organizationId: null }, { organizationId: user.organizationId }],
        ...(year ? { validYear: year } : {}),
      },
      include: { category: true },
      orderBy: [{ category: { scope: 'asc' } }, { factorName: 'asc' }],
    });
  }

  /** An Admin "reviewing" a factor creates an org-specific override row rather than mutating the
   * global default in place — this preserves the global default for other tenants and keeps a clean
   * history of when/why this org's figure diverged (e.g. a TANESCO-confirmed grid factor). */
  async createOverride(
    user: AuthenticatedUser,
    dto: {
      categoryId: number;
      factorName: string;
      value: number;
      unit: string;
      validYear: number;
      source: string;
      notes?: string;
    },
  ) {
    return this.prisma.emissionFactor.upsert({
      where: {
        organizationId_categoryId_factorName_validYear: {
          organizationId: user.organizationId,
          categoryId: dto.categoryId,
          factorName: dto.factorName,
          validYear: dto.validYear,
        },
      },
      update: {
        value: dto.value,
        unit: dto.unit,
        source: dto.source,
        notes: dto.notes,
        isDefault: false,
        isReviewed: true,
        createdBy: user.id,
      },
      create: {
        organizationId: user.organizationId,
        categoryId: dto.categoryId,
        factorName: dto.factorName,
        value: dto.value,
        unit: dto.unit,
        validYear: dto.validYear,
        source: dto.source,
        notes: dto.notes,
        isDefault: false,
        isReviewed: true,
        createdBy: user.id,
      },
    });
  }
}
