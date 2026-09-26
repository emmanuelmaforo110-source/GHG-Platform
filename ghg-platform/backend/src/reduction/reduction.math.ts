/**
 * Pure calculations for Phase 2 (Reduce): marginal abatement cost, the marginal abatement cost
 * curve (MACC), target trajectories and scenarios. No database access — easy to test.
 */

/** Capital recovery factor: spreads an up-front cost evenly over `years` at `ratePct` interest. */
export function capitalRecoveryFactor(ratePct: number, years: number): number {
  if (years <= 0) throw new Error('Lifetime must be at least one year.');
  const r = ratePct / 100;
  if (r === 0) return 1 / years;
  const f = Math.pow(1 + r, years);
  return (r * f) / (f - 1);
}

export interface CostInputs {
  capex: number;
  annualOpexChange: number; // negative = yearly savings
  discountRatePct: number;
  lifetimeYears: number;
  annualReductionTco2e: number;
}

/**
 * Marginal abatement cost (currency per tCO2e avoided):
 * (up-front cost spread over the lifetime + yearly change in running costs) / tonnes avoided per year.
 * Negative = the initiative saves money as well as emissions.
 */
export function abatementCost(i: CostInputs): { annualisedCapex: number; annualCost: number; costPerTonne: number } {
  const annualisedCapex = i.capex * capitalRecoveryFactor(i.discountRatePct, i.lifetimeYears);
  const annualCost = annualisedCapex + i.annualOpexChange;
  return { annualisedCapex, annualCost, costPerTonne: annualCost / i.annualReductionTco2e };
}

export interface MaccItem extends CostInputs {
  id: string;
  name: string;
  currency: string;
  status: string;
}

/** Initiatives sorted from cheapest to most expensive per tonne, with cumulative abatement for the chart. */
export function buildMacc(items: MaccItem[]) {
  let cumulative = 0;
  return items
    .map((i) => ({ ...i, ...abatementCost(i) }))
    .sort((a, b) => a.costPerTonne - b.costPerTonne)
    .map((i) => {
      const start = cumulative;
      cumulative += i.annualReductionTco2e;
      return {
        id: i.id,
        name: i.name,
        status: i.status,
        currency: i.currency,
        annualReductionTco2e: i.annualReductionTco2e,
        costPerTonne: round(i.costPerTonne, 2),
        annualCost: round(i.annualCost, 2),
        cumulativeStartTco2e: round(start, 4),
        cumulativeEndTco2e: round(cumulative, 4),
      };
    });
}

/** Value on a straight line from the base year to the target year. */
export function trajectoryValue(baseValue: number, reductionPct: number, baseYear: number, targetYear: number, year: number): number {
  if (year <= baseYear) return baseValue;
  const targetValue = baseValue * (1 - reductionPct / 100);
  if (year >= targetYear) return targetValue;
  return baseValue + ((targetValue - baseValue) * (year - baseYear)) / (targetYear - baseYear);
}

/**
 * Indicative ambition check against the SBTi absolute-contraction rates:
 * at least 4.2% a year (linear) for a 1.5°C-aligned Scope 1+2 target, and at least 2.5% a year
 * for a well-below-2°C Scope 3 target. Criteria change over time — confirm against the current
 * SBTi standard before submitting a target.
 */
export function ambitionCheck(coverage: 'scope_1_2' | 'scope_3' | 'all_scopes', reductionPct: number, baseYear: number, targetYear: number) {
  const years = targetYear - baseYear;
  const annualRatePct = reductionPct / years;
  const required = coverage === 'scope_3' ? 2.5 : 4.2;
  const pathway = coverage === 'scope_3' ? 'well-below 2°C' : '1.5°C';
  return {
    annualRatePct: round(annualRatePct, 2),
    requiredAnnualRatePct: required,
    pathway,
    meetsReferenceRate: annualRatePct >= required - 1e-9,
  };
}

export interface ScenarioInitiative {
  status: string;
  startYear: number;
  lifetimeYears: number;
  annualReductionTco2e: number;
}

/** Tonnes avoided in a given year by initiatives that count toward the plan (not ideas or cancelled). */
export function plannedReductionInYear(initiatives: ScenarioInitiative[], year: number): number {
  return initiatives
    .filter((i) => ['planned', 'in_progress', 'completed'].includes(i.status))
    .filter((i) => year >= i.startYear && year < i.startYear + i.lifetimeYears)
    .reduce((s, i) => s + i.annualReductionTco2e, 0);
}

export function round(n: number, dp = 4): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
