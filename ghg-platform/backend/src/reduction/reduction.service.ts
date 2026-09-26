import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ReductionInitiativeDto, ReductionTargetDto, UpdateReductionInitiativeDto } from './dto/reduction.dto';
import {
  abatementCost,
  ambitionCheck,
  buildMacc,
  plannedReductionInYear,
  round,
  trajectoryValue,
} from './reduction.math';

type Coverage = 'scope_1_2' | 'scope_3' | 'all_scopes';

interface YearActuals {
  year: number;
  scope1: number;
  scope2: number;
  scope3: number;
  staffFte: number | null;
  status: string;
}

const COVERAGE_LABEL: Record<Coverage, string> = {
  scope_1_2: 'Scope 1 + 2',
  scope_3: 'Scope 3',
  all_scopes: 'All scopes',
};

@Injectable()
export class ReductionService {
  constructor(private prisma: PrismaService) {}

  // ---------------------------------------------------------------------------------------------
  // Actual emissions per year (from the inventory)
  // ---------------------------------------------------------------------------------------------

  async actualsByYear(user: AuthenticatedUser): Promise<YearActuals[]> {
    const [periods, rows, categories] = await Promise.all([
      this.prisma.reportingPeriod.findMany({ where: { organizationId: user.organizationId }, orderBy: { year: 'asc' } }),
      this.prisma.activityData.findMany({
        where: { organizationId: user.organizationId },
        select: { reportingPeriodId: true, categoryId: true, emissionsTco2e: true },
      }),
      this.prisma.ghgCategory.findMany(),
    ]);
    const scopeOf = new Map(categories.map((c) => [c.id, c.scope]));
    return periods.map((p) => {
      const totals = { scope_1: 0, scope_2: 0, scope_3: 0 } as Record<string, number>;
      for (const r of rows) {
        if (r.reportingPeriodId !== p.id) continue;
        const scope = scopeOf.get(r.categoryId);
        if (scope) totals[scope] += Number(r.emissionsTco2e);
      }
      return {
        year: p.year,
        scope1: totals.scope_1,
        scope2: totals.scope_2,
        scope3: totals.scope_3,
        staffFte: p.staffFte === null || p.staffFte === undefined ? null : Number(p.staffFte),
        status: p.status,
      };
    });
  }

  private coveredValue(a: YearActuals, coverage: Coverage, type: 'absolute' | 'intensity'): number | null {
    const t = coverage === 'scope_1_2' ? a.scope1 + a.scope2 : coverage === 'scope_3' ? a.scope3 : a.scope1 + a.scope2 + a.scope3;
    if (type === 'absolute') return t;
    return a.staffFte ? t / a.staffFte : null;
  }

  // ---------------------------------------------------------------------------------------------
  // Targets
  // ---------------------------------------------------------------------------------------------

  async createTarget(user: AuthenticatedUser, dto: ReductionTargetDto) {
    if (dto.targetYear <= dto.baseYear) throw new BadRequestException('The target year must be after the base year.');
    const type = dto.targetType ?? 'absolute';
    let baseYearValue = dto.baseYearValue;
    if (baseYearValue === undefined || baseYearValue === null) {
      const actual = (await this.actualsByYear(user)).find((a) => a.year === dto.baseYear);
      const v = actual ? this.coveredValue(actual, dto.coverage, type) : null;
      if (v === null || v === undefined || v <= 0) {
        throw new BadRequestException(
          type === 'intensity'
            ? `No ${dto.baseYear} emissions and staff (FTE) figure found. Enter the base-year value by hand, or record ${dto.baseYear} data first.`
            : `No ${dto.baseYear} emissions found for ${COVERAGE_LABEL[dto.coverage]}. Enter the base-year value by hand, or record ${dto.baseYear} data first.`,
        );
      }
      baseYearValue = v;
    }
    return this.prisma.reductionTarget.create({
      data: {
        organizationId: user.organizationId,
        name: dto.name.trim(),
        coverage: dto.coverage,
        targetType: type,
        baseYear: dto.baseYear,
        baseYearValue,
        targetYear: dto.targetYear,
        reductionPct: dto.reductionPct,
        notes: dto.notes,
        createdBy: user.id,
      },
    });
  }

  async deleteTarget(user: AuthenticatedUser, id: string) {
    const t = await this.prisma.reductionTarget.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!t) throw new NotFoundException('Target not found.');
    await this.prisma.reductionTarget.delete({ where: { id } });
    return { deleted: true };
  }

  /** Targets with progress: latest actual vs. the straight-line path to the target, and an ambition check. */
  async listTargets(user: AuthenticatedUser) {
    const [targets, actuals] = await Promise.all([
      this.prisma.reductionTarget.findMany({ where: { organizationId: user.organizationId }, orderBy: { targetYear: 'asc' } }),
      this.actualsByYear(user),
    ]);
    return targets.map((t) => {
      const base = Number(t.baseYearValue);
      const pct = Number(t.reductionPct);
      const coverage = t.coverage as Coverage;
      const type = t.targetType as 'absolute' | 'intensity';
      const targetValue = base * (1 - pct / 100);

      const latest = [...actuals]
        .filter((a) => a.year > t.baseYear)
        .map((a) => ({ year: a.year, value: this.coveredValue(a, coverage, type) }))
        .filter((a) => a.value !== null && a.value > 0)
        .pop();

      let progress: {
        year: number;
        actual: number;
        expected: number;
        changeFromBasePct: number;
        status: 'on_track' | 'off_track';
      } | null = null;
      if (latest && latest.value !== null) {
        const expected = trajectoryValue(base, pct, t.baseYear, t.targetYear, latest.year);
        progress = {
          year: latest.year,
          actual: round(latest.value, 4),
          expected: round(expected, 4),
          changeFromBasePct: round(((latest.value - base) / base) * 100, 1),
          status: latest.value <= expected + 1e-9 ? 'on_track' : 'off_track',
        };
      }

      return {
        id: t.id,
        name: t.name,
        coverage,
        coverageLabel: COVERAGE_LABEL[coverage],
        targetType: type,
        unit: type === 'absolute' ? 'tCO2e' : 'tCO2e per employee (FTE)',
        baseYear: t.baseYear,
        baseYearValue: round(base, 4),
        targetYear: t.targetYear,
        reductionPct: pct,
        targetValue: round(targetValue, 4),
        notes: t.notes,
        progress,
        // The SBTi reference rates apply to absolute targets.
        ambition: type === 'absolute' ? ambitionCheck(coverage, pct, t.baseYear, t.targetYear) : null,
      };
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Initiatives
  // ---------------------------------------------------------------------------------------------

  private async checkCategory(scope: string, categoryId?: number | null) {
    if (categoryId === undefined || categoryId === null) return;
    const c = await this.prisma.ghgCategory.findUnique({ where: { id: categoryId } });
    if (!c) throw new BadRequestException('Category not found.');
    if (c.scope !== scope) throw new BadRequestException('The category does not belong to the selected scope.');
  }

  async listInitiatives(user: AuthenticatedUser) {
    const rows = await this.prisma.reductionInitiative.findMany({
      where: { organizationId: user.organizationId },
      include: { category: true },
      orderBy: { startYear: 'asc' },
    });
    return rows.map((r) => ({ ...r, ...this.initiativeFigures(r) }));
  }

  async createInitiative(user: AuthenticatedUser, dto: ReductionInitiativeDto) {
    await this.checkCategory(dto.scope, dto.categoryId);
    return this.prisma.reductionInitiative.create({
      data: {
        organizationId: user.organizationId,
        name: dto.name.trim(),
        description: dto.description,
        scope: dto.scope,
        categoryId: dto.categoryId ?? null,
        status: dto.status ?? 'idea',
        startYear: dto.startYear,
        lifetimeYears: dto.lifetimeYears,
        annualReductionTco2e: dto.annualReductionTco2e,
        capex: dto.capex ?? 0,
        annualOpexChange: dto.annualOpexChange ?? 0,
        currency: (dto.currency ?? 'USD').trim().toUpperCase(),
        discountRatePct: dto.discountRatePct ?? 10,
        owner: dto.owner,
        notes: dto.notes,
        createdBy: user.id,
      },
    });
  }

  async updateInitiative(user: AuthenticatedUser, id: string, dto: UpdateReductionInitiativeDto) {
    const existing = await this.prisma.reductionInitiative.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!existing) throw new NotFoundException('Initiative not found.');
    await this.checkCategory(dto.scope ?? existing.scope, dto.categoryId !== undefined ? dto.categoryId : existing.categoryId);
    return this.prisma.reductionInitiative.update({
      where: { id },
      data: { ...dto, ...(dto.currency ? { currency: dto.currency.trim().toUpperCase() } : {}) },
    });
  }

  async deleteInitiative(user: AuthenticatedUser, id: string) {
    const existing = await this.prisma.reductionInitiative.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!existing) throw new NotFoundException('Initiative not found.');
    await this.prisma.reductionInitiative.delete({ where: { id } });
    return { deleted: true };
  }

  // ---------------------------------------------------------------------------------------------
  // Overview: MACC + scenarios
  // ---------------------------------------------------------------------------------------------

  /**
   * - MACC: initiatives (except cancelled) in one currency, cheapest per tonne first.
   * - Scenarios, all scopes, tCO2e per year:
   *   business as usual = the latest recorded year held flat (or grown by `growthPct` a year);
   *   with plan = business as usual minus initiatives that start after the latest recorded year
   *   (earlier ones are already reflected in the recorded emissions) and are planned, in progress
   *   or completed; plus each absolute target's straight-line path and the recorded actuals.
   */
  async overview(user: AuthenticatedUser, options: { currency?: string; growthPct?: number } = {}) {
    const [initiatives, targets, actuals] = await Promise.all([
      this.prisma.reductionInitiative.findMany({ where: { organizationId: user.organizationId } }),
      this.listTargets(user),
      this.actualsByYear(user),
    ]);
    const active = initiatives.filter((i) => i.status !== 'cancelled');

    // Currencies in use; the MACC is drawn in one currency at a time.
    const currencyCount = new Map<string, number>();
    for (const i of active) currencyCount.set(i.currency, (currencyCount.get(i.currency) ?? 0) + 1);
    const currencies = [...currencyCount.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
    const currency = options.currency?.toUpperCase() ?? currencies[0] ?? 'USD';

    const macc = buildMacc(
      active
        .filter((i) => i.currency === currency)
        .map((i) => ({
          id: i.id,
          name: i.name,
          status: i.status,
          currency: i.currency,
          capex: Number(i.capex),
          annualOpexChange: Number(i.annualOpexChange),
          discountRatePct: Number(i.discountRatePct),
          lifetimeYears: i.lifetimeYears,
          annualReductionTco2e: Number(i.annualReductionTco2e),
        })),
    );

    // Scenario years
    const recorded = actuals.filter((a) => a.scope1 + a.scope2 + a.scope3 > 0);
    const last = recorded[recorded.length - 1];
    const thisYear = new Date().getFullYear();
    const firstYear = Math.min(
      recorded[0]?.year ?? thisYear,
      ...targets.map((t) => t.baseYear),
    );
    const endYear = Math.min(
      2050,
      Math.max(thisYear + 5, ...targets.map((t) => t.targetYear), ...active.map((i) => i.startYear + i.lifetimeYears - 1)),
    );
    const growth = (options.growthPct ?? 0) / 100;
    const planInitiatives = active
      .filter((i) => !last || i.startYear > last.year)
      .map((i) => ({
        status: i.status,
        startYear: i.startYear,
        lifetimeYears: i.lifetimeYears,
        annualReductionTco2e: Number(i.annualReductionTco2e),
      }));

    const absoluteTargets = targets.filter((t) => t.targetType === 'absolute');
    const years: Record<string, number | null>[] = [];
    for (let y = firstYear; y <= endYear; y++) {
      const actual = recorded.find((a) => a.year === y);
      const actualTotal = actual ? actual.scope1 + actual.scope2 + actual.scope3 : null;
      let bau: number | null = null;
      let plan: number | null = null;
      if (last) {
        if (y <= last.year) {
          bau = actualTotal;
          plan = actualTotal;
        } else {
          const lastTotal = last.scope1 + last.scope2 + last.scope3;
          bau = lastTotal * Math.pow(1 + growth, y - last.year);
          plan = Math.max(0, bau - plannedReductionInYear(planInitiatives, y));
        }
      }
      const row: Record<string, number | null> = {
        year: y,
        actual: actualTotal === null ? null : round(actualTotal, 4),
        businessAsUsual: bau === null ? null : round(bau, 4),
        withPlan: plan === null ? null : round(plan, 4),
      };
      for (const t of absoluteTargets) {
        row[`target:${t.id}`] =
          y >= t.baseYear && y <= t.targetYear ? round(trajectoryValue(t.baseYearValue, t.reductionPct, t.baseYear, t.targetYear, y), 4) : null;
      }
      years.push(row);
    }

    const totals = {
      initiatives: active.length,
      plannedAnnualReductionTco2e: round(
        active.filter((i) => ['planned', 'in_progress', 'completed'].includes(i.status)).reduce((s, i) => s + Number(i.annualReductionTco2e), 0),
        4,
      ),
      ideasAnnualReductionTco2e: round(active.filter((i) => i.status === 'idea').reduce((s, i) => s + Number(i.annualReductionTco2e), 0), 4),
      savingInitiatives: macc.filter((m) => m.costPerTonne < 0).length,
    };

    return {
      currency,
      currencies,
      macc,
      scenario: {
        growthPct: options.growthPct ?? 0,
        latestRecordedYear: last?.year ?? null,
        targetSeries: absoluteTargets.map((t) => ({ key: `target:${t.id}`, name: `${t.name} (${t.coverageLabel})` })),
        years,
      },
      targets,
      totals,
    };
  }

  /** Per-initiative figures shown in the initiatives table. */
  initiativeFigures(i: { capex: unknown; annualOpexChange: unknown; discountRatePct: unknown; lifetimeYears: number; annualReductionTco2e: unknown }) {
    const c = abatementCost({
      capex: Number(i.capex),
      annualOpexChange: Number(i.annualOpexChange),
      discountRatePct: Number(i.discountRatePct),
      lifetimeYears: i.lifetimeYears,
      annualReductionTco2e: Number(i.annualReductionTco2e),
    });
    return {
      costPerTonne: round(c.costPerTonne, 2),
      annualCost: round(c.annualCost, 2),
      lifetimeReductionTco2e: round(Number(i.annualReductionTco2e) * i.lifetimeYears, 4),
    };
  }
}
