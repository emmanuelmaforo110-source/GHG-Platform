import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { GWP } from '../activity-data/gwp';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  /** Section 5.1/5.4 — headline scope totals + activity-level breakdown for one reporting period. */
  async summary(user: AuthenticatedUser, reportingPeriodId: string) {
    const period = await this.prisma.reportingPeriod.findFirst({
      where: { id: reportingPeriodId, organizationId: user.organizationId },
    });
    if (!period) throw new NotFoundException('Reporting period not found.');

    const rows = await this.prisma.activityData.findMany({
      where: { reportingPeriodId },
      include: { category: true },
    });

    const byScope = { scope_1: 0, scope_2: 0, scope_3: 0 } as Record<string, number>;
    const byActivity: { sourceName: string; scope: string; tco2e: number; dataQualityScore: number | null }[] = [];
    let scope2MarketBased = 0;
    // Data quality: emissions-weighted average of the 1-5 scores, over the rows that have a score.
    const quality = {
      all: { weighted: 0, scoredT: 0 },
      scope_1: { weighted: 0, scoredT: 0 },
      scope_2: { weighted: 0, scoredT: 0 },
      scope_3: { weighted: 0, scoredT: 0 },
    } as Record<string, { weighted: number; scoredT: number }>;

    for (const row of rows) {
      const tco2e = Number(row.emissionsTco2e);
      const scope = row.category.scope;
      byScope[scope] += tco2e;
      if (scope === 'scope_2') {
        // Market-based: the contractual-instrument result, or the location-based one if none was recorded.
        scope2MarketBased += row.marketEmissionsTco2e !== null && row.marketEmissionsTco2e !== undefined
          ? Number(row.marketEmissionsTco2e)
          : tco2e;
      }
      if (row.dataQualityScore) {
        for (const key of ['all', scope]) {
          quality[key].weighted += row.dataQualityScore * tco2e;
          quality[key].scoredT += tco2e;
        }
      }
      byActivity.push({ sourceName: row.sourceName, scope, tco2e, dataQualityScore: row.dataQualityScore ?? null });
    }

    const total = byScope.scope_1 + byScope.scope_2 + byScope.scope_3;
    const perEmployee = period.staffFte ? total / Number(period.staffFte) : null;

    const largestScope = Object.entries(byScope).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    const totalMarketBased = byScope.scope_1 + scope2MarketBased + byScope.scope_3;
    const qualityOf = (key: string, scopeTotal: number) => ({
      // 1 = best ... 5 = weakest; null when no entry in this group has a score yet
      weightedScore: quality[key].scoredT > 0 ? round(quality[key].weighted / quality[key].scoredT, 2) : null,
      // share of the group's emissions that has a quality score
      scoredShare: scopeTotal > 0 ? round(quality[key].scoredT / scopeTotal, 4) : null,
    });

    return {
      reportingPeriod: { id: period.id, year: period.year, isBaseYear: period.isBaseYear, status: period.status },
      totals: {
        scope1Tco2e: round(byScope.scope_1),
        scope2Tco2e: round(byScope.scope_2), // location-based (headline, as in the reference workbook)
        scope3Tco2e: round(byScope.scope_3),
        totalTco2e: round(total),
      },
      // GHG Protocol Scope 2 Guidance: report both methods.
      scope2: {
        locationBasedTco2e: round(byScope.scope_2),
        marketBasedTco2e: round(scope2MarketBased),
        totalMarketBasedTco2e: round(totalMarketBased),
      },
      dataQuality: {
        overall: qualityOf('all', total),
        scope1: qualityOf('scope_1', byScope.scope_1),
        scope2: qualityOf('scope_2', byScope.scope_2),
        scope3: qualityOf('scope_3', byScope.scope_3),
      },
      shareOfTotal: total > 0 ? {
        scope1: round(byScope.scope_1 / total),
        scope2: round(byScope.scope_2 / total),
        scope3: round(byScope.scope_3 / total),
      } : null,
      emissionsPerEmployee: perEmployee !== null ? round(perEmployee) : null,
      largestScope,
      byActivity: byActivity.sort((a, b) => b.tco2e - a.tco2e),
    };
  }

  /** Section 5.3 — period-over-period comparison across every reporting period for the org. */
  async periodOverPeriod(user: AuthenticatedUser) {
    const periods = await this.prisma.reportingPeriod.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { year: 'asc' },
    });

    const results: {
      year: number;
      isBaseYear: boolean;
      status: typeof periods[number]['status'];
      scope1Tco2e: number;
      scope2Tco2e: number;
      scope3Tco2e: number;
      totalTco2e: number;
    }[] = [];
    // One query for all entries of the organization, rolled up by period and scope.
    const [rows, categories] = await Promise.all([
      this.prisma.activityData.findMany({
        where: { organizationId: user.organizationId },
        select: { reportingPeriodId: true, categoryId: true, emissionsTco2e: true },
      }),
      this.prisma.ghgCategory.findMany(),
    ]);
    const catScope = new Map(categories.map((c) => [c.id, c.scope]));

    for (const period of periods) {
      const byScope = { scope_1: 0, scope_2: 0, scope_3: 0 } as Record<string, number>;
      for (const r of rows) {
        if (r.reportingPeriodId !== period.id) continue;
        const scope = catScope.get(r.categoryId);
        if (scope) byScope[scope] += Number(r.emissionsTco2e);
      }
      const total = byScope.scope_1 + byScope.scope_2 + byScope.scope_3;

      results.push({
        year: period.year,
        isBaseYear: period.isBaseYear,
        status: period.status,
        scope1Tco2e: round(byScope.scope_1),
        scope2Tco2e: round(byScope.scope_2),
        scope3Tco2e: round(byScope.scope_3),
        totalTco2e: round(total),
      });
    }
    return results;
  }

  /** Section 5.5 — Scope 3 completeness panel: which categories are quantified vs. screened out, and why. */
  async scope3Completeness(user: AuthenticatedUser, reportingPeriodId: string) {
    const screens = await this.prisma.scope3RelevanceScreen.findMany({
      where: { organizationId: user.organizationId, reportingPeriodId },
      include: { category: true },
      orderBy: { category: { scope3CategoryNo: 'asc' } },
    });

    const quantifiedCategoryIds = new Set(
      (
        await this.prisma.activityData.findMany({
          where: { organizationId: user.organizationId, reportingPeriodId, category: { scope: 'scope_3' } },
          select: { categoryId: true },
          distinct: ['categoryId'],
        })
      ).map((r) => r.categoryId),
    );

    return screens.map((s) => ({
      category: s.category.name,
      isIncluded: s.isIncluded,
      isQuantified: quantifiedCategoryIds.has(s.categoryId),
      relevanceAssessment: s.relevanceAssessment,
    }));
  }

  /**
   * Everything needed for a printable GHG inventory report (GHG Protocol / ISO 14064-1 style):
   * organisation and boundary, method (GWP set, Scope 2 methods), totals by scope, category, gas and
   * calculation method, Scope 3 screening of all 15 categories, data quality, emission factors used,
   * approval trail and year-on-year history.
   */
  async report(user: AuthenticatedUser, reportingPeriodId: string) {
    const summary = await this.summary(user, reportingPeriodId);
    const period = await this.prisma.reportingPeriod.findFirst({
      where: { id: reportingPeriodId, organizationId: user.organizationId },
    });
    if (!period) throw new NotFoundException('Reporting period not found.');

    const [organization, facilities, rows, categories, screens, history, people] = await Promise.all([
      this.prisma.organization.findFirst({ where: { id: user.organizationId } }),
      this.prisma.facility.findMany({ where: { organizationId: user.organizationId }, orderBy: { name: 'asc' } }),
      this.prisma.activityData.findMany({
        where: { reportingPeriodId, organizationId: user.organizationId },
        include: { category: true, emissionFactor: true },
      }),
      this.prisma.ghgCategory.findMany({ orderBy: [{ scope: 'asc' }, { scope3CategoryNo: 'asc' }, { name: 'asc' }] }),
      this.prisma.scope3RelevanceScreen.findMany({ where: { reportingPeriodId, organizationId: user.organizationId } }),
      this.periodOverPeriod(user),
      this.prisma.user.findMany({
        where: { organizationId: user.organizationId, id: { in: [period.submittedBy, period.approvedBy].filter((x): x is string => !!x) } },
        select: { id: true, fullName: true },
      }),
    ]);
    const nameOf = (id: string | null) => people.find((p) => p.id === id)?.fullName ?? null;

    // Totals by category
    const byCategory = categories
      .map((c) => {
        const inCat = rows.filter((r) => r.categoryId === c.id);
        return {
          scope: c.scope,
          category: c.name,
          entries: inCat.length,
          tco2e: round(inCat.reduce((s, r) => s + Number(r.emissionsTco2e), 0), 6),
        };
      })
      .filter((c) => c.entries > 0);

    // Totals by gas (only entries whose emission factor is split by gas)
    const split = rows.filter((r) => r.co2Kg !== null && r.co2Kg !== undefined);
    const total = rows.reduce((s, r) => s + Number(r.emissionsTco2e), 0);
    const splitT = split.reduce((s, r) => s + Number(r.emissionsTco2e), 0);
    const byGas = {
      co2Tonnes: round(split.reduce((s, r) => s + Number(r.co2Kg), 0) / 1000, 6),
      ch4Tonnes: round(split.reduce((s, r) => s + Number(r.ch4Kg ?? 0), 0) / 1000, 6),
      n2oTonnes: round(split.reduce((s, r) => s + Number(r.n2oKg ?? 0), 0) / 1000, 6),
      shareOfEmissionsSplitByGas: total > 0 ? round(splitT / total, 4) : null,
    };

    // Totals by calculation method
    const byMethod = (['activity_based', 'spend_based', 'supplier_specific'] as const).map((m) => ({
      method: m,
      tco2e: round(rows.filter((r) => (r.calculationMethod ?? 'activity_based') === m).reduce((s, r) => s + Number(r.emissionsTco2e), 0), 6),
    }));

    // Scope 3 screening across all 15 categories
    const scope3Screening = categories
      .filter((c) => c.scope === 'scope_3')
      .map((c) => {
        const screen = screens.find((x) => x.categoryId === c.id);
        const t = rows.filter((r) => r.categoryId === c.id).reduce((s, r) => s + Number(r.emissionsTco2e), 0);
        const status = t > 0 ? 'quantified' : screen ? (screen.isIncluded ? 'included_not_quantified' : 'excluded') : 'not_screened';
        return { categoryNo: c.scope3CategoryNo, category: c.name, status, tco2e: round(t, 6), reason: screen?.relevanceAssessment ?? null };
      });

    // Emission factors used (one line per distinct factor)
    const factorMap = new Map<string, { name: string; value: number; unit: string; source: string; year: number | null; entries: number }>();
    for (const r of rows) {
      const key = r.emissionFactorId ?? `supplier:${r.emissionFactorSourceUsed}`;
      const f = factorMap.get(key);
      if (f) f.entries++;
      else
        factorMap.set(key, {
          name: r.emissionFactor?.factorName ?? 'Supplier-reported emissions',
          value: Number(r.emissionFactorValueUsed),
          unit: r.emissionFactorUnitUsed,
          source: r.emissionFactorSourceUsed,
          year: r.emissionFactor?.validYear ?? null,
          entries: 1,
        });
    }

    const gwpSet = period.gwpSet ?? 'AR6';
    return {
      generatedAt: new Date().toISOString(),
      organization: { name: organization?.name ?? '', country: organization?.country ?? null },
      facilities: facilities.map((f) => ({ name: f.name, country: f.country, isActive: f.isActive })),
      period: {
        year: period.year,
        status: period.status,
        isBaseYear: period.isBaseYear,
        boundaryApproach: period.boundaryApproach,
        gwpSet,
        staffFte: period.staffFte === null ? null : Number(period.staffFte),
        recalculationThresholdPct: Number(period.recalculationThresholdPct),
        submittedBy: nameOf(period.submittedBy),
        submittedAt: period.submittedAt,
        approvedBy: nameOf(period.approvedBy),
        approvedAt: period.approvedAt,
      },
      gwpValues: GWP[gwpSet as keyof typeof GWP],
      summary,
      byCategory,
      byGas,
      byMethod,
      scope3Screening,
      factorsUsed: [...factorMap.values()].sort((a, b) => b.entries - a.entries),
      history,
    };
  }
}

function round(n: number, dp = 4): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
