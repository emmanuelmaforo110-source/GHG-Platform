import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';

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
    for (const period of periods) {
      const agg = await this.prisma.activityData.groupBy({
        by: ['categoryId'],
        where: { reportingPeriodId: period.id },
        _sum: { emissionsTco2e: true },
      });

      // Roll category-level sums up to scope-level using the categories reference table.
      const categories = await this.prisma.ghgCategory.findMany();
      const catScope = new Map(categories.map((c) => [c.id, c.scope]));

      const byScope = { scope_1: 0, scope_2: 0, scope_3: 0 } as Record<string, number>;
      for (const a of agg) {
        const scope = catScope.get(a.categoryId);
        if (scope) byScope[scope] += Number(a._sum.emissionsTco2e ?? 0);
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
}

function round(n: number, dp = 4): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
