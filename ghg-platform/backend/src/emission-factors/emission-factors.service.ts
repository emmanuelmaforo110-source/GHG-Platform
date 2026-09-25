import { BadRequestException, Injectable } from '@nestjs/common';
import { EmissionFactorDto } from './dto/emission-factor.dto';
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
  async createOverride(user: AuthenticatedUser, dto: EmissionFactorDto) {
    const gases = [dto.co2PerUnit, dto.ch4PerUnit, dto.n2oPerUnit];
    const given = gases.filter((g) => g !== undefined && g !== null).length;
    if (given !== 0 && given !== 3) {
      throw new BadRequestException('To split a factor by gas, give all three values: CO2, CH4 and N2O per unit.');
    }
    if (!/\//.test(dto.unit)) {
      throw new BadRequestException('Write the unit as "kg CO2e / <unit>", e.g. "kg CO2e / litre" or "kg CO2e / USD".');
    }
    const category = await this.prisma.ghgCategory.findUnique({ where: { id: dto.categoryId } });
    if (!category) throw new BadRequestException('Category not found.');

    const data = {
      value: dto.value,
      unit: dto.unit.trim(),
      source: dto.source.trim(),
      notes: dto.notes,
      co2PerUnit: dto.co2PerUnit ?? null,
      ch4PerUnit: dto.ch4PerUnit ?? null,
      n2oPerUnit: dto.n2oPerUnit ?? null,
      isDefault: false,
      isReviewed: true,
      createdBy: user.id,
    };
    return this.prisma.emissionFactor.upsert({
      where: {
        organizationId_categoryId_factorName_validYear: {
          organizationId: user.organizationId,
          categoryId: dto.categoryId,
          factorName: dto.factorName.trim(),
          validYear: dto.validYear,
        },
      },
      update: data,
      create: {
        ...data,
        organizationId: user.organizationId,
        categoryId: dto.categoryId,
        factorName: dto.factorName.trim(),
        validYear: dto.validYear,
      },
    });
  }
}
