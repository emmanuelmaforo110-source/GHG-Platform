/**
 * Rules used by the claim checker (VCMI Claims Code of Practice) and the credit quality checklist
 * (ICVCM Core Carbon Principles). Pure functions — easy to test and to update when the rules change.
 *
 * VCMI tiers, by share of the year's remaining emissions covered by eligible retired credits:
 *   Silver 10–<50%, Gold 50–<100%, Platinum 100% or more.
 * Credit eligibility: from 1 January 2027 credits must carry the ICVCM CCP label or be Article 6.4
 * credits; before that, a due-diligence route is accepted (here: all 10 Core Carbon Principles checked).
 * Always confirm against the current VCMI and ICVCM guidance before making a public claim.
 */

export const CCP_PRINCIPLES = [
  { key: 'governance', label: 'Effective governance of the crediting programme' },
  { key: 'tracking', label: 'Tracking: registry that uniquely identifies each credit' },
  { key: 'transparency', label: 'Transparency: public project documents' },
  { key: 'validation_verification', label: 'Robust independent third-party validation and verification' },
  { key: 'additionality', label: 'Additionality: would not have happened without credit revenue' },
  { key: 'permanence', label: 'Permanence: reversals are prevented or compensated' },
  { key: 'quantification', label: 'Robust, conservative quantification' },
  { key: 'no_double_counting', label: 'No double counting (issuance, use or claim)' },
  { key: 'safeguards', label: 'Sustainable development benefits and safeguards' },
  { key: 'net_zero_contribution', label: 'Contribution to the transition to net zero' },
] as const;

export type DueDiligence = Partial<Record<(typeof CCP_PRINCIPLES)[number]['key'], boolean | null>>;

export function dueDiligenceScore(dd: DueDiligence | null | undefined): { passed: number; total: number; complete: boolean } {
  const passed = CCP_PRINCIPLES.filter((p) => dd?.[p.key] === true).length;
  return { passed, total: CCP_PRINCIPLES.length, complete: passed === CCP_PRINCIPLES.length };
}

export const CCP_ONLY_FROM_YEAR = 2027;

export function creditEligibility(
  lot: { ccpLabelled: boolean; registry: string; dueDiligence?: unknown; vintageYear: number },
  claimYear: number,
): { eligible: boolean; basis: string; warnings: string[] } {
  const warnings: string[] = [];
  if (claimYear - lot.vintageYear > 5) warnings.push(`Vintage ${lot.vintageYear} is more than 5 years older than the claim year.`);
  if (lot.ccpLabelled) return { eligible: true, basis: 'CCP-labelled', warnings };
  if (lot.registry === 'article_6_4') return { eligible: true, basis: 'Article 6.4 credit', warnings };
  if (claimYear < CCP_ONLY_FROM_YEAR && dueDiligenceScore(lot.dueDiligence as DueDiligence).complete) {
    return { eligible: true, basis: 'Due diligence against all 10 Core Carbon Principles (accepted until end of 2026)', warnings };
  }
  return {
    eligible: false,
    basis:
      claimYear >= CCP_ONLY_FROM_YEAR
        ? 'Not CCP-labelled and not an Article 6.4 credit (required from 2027)'
        : 'Not CCP-labelled, not Article 6.4, and due diligence incomplete',
    warnings,
  };
}

export type VcmiTier = 'platinum' | 'gold' | 'silver' | null;

export function vcmiTier(coveragePct: number): VcmiTier {
  if (coveragePct >= 100) return 'platinum';
  if (coveragePct >= 50) return 'gold';
  if (coveragePct >= 10) return 'silver';
  return null;
}
