// Mirrors the shapes returned by the backend (see backend/prisma/schema.prisma and the
// controllers under backend/src/). Kept as plain types, not generated, since there's no shared
// package boundary in this MVP — see README "What's next" if you later add a monorepo/OpenAPI step.

export type UserRole = 'admin' | 'data_entry' | 'management' | 'verifier';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  organizationId: string;
  organizationName?: string;
  restrictedFacilityId?: string | null;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

export interface Facility {
  id: string;
  organizationId: string;
  name: string;
  address: string | null;
  country: string | null;
  isActive: boolean;
  entryCount?: number; // only on the Admin list (?includeInactive=true)
}

export interface GhgCategory {
  id: number;
  scope: 'scope_1' | 'scope_2' | 'scope_3';
  scope3CategoryNo: number | null;
  name: string;
  scope1Subcategory: string | null;
  description: string | null;
}

export interface EmissionFactor {
  id: string;
  organizationId: string | null;
  categoryId: number;
  category: GhgCategory;
  factorName: string;
  value: string; // Prisma Decimal serializes as string over JSON
  unit: string;
  validYear: number;
  source: string;
  notes: string | null;
  isDefault: boolean;
  isReviewed: boolean;
  /** Optional split by gas, kg of each gas per unit. */
  co2PerUnit?: string | null;
  ch4PerUnit?: string | null;
  n2oPerUnit?: string | null;
}

export type GwpSet = 'AR5' | 'AR6';
export type BoundaryApproach = 'operational_control' | 'financial_control' | 'equity_share';
export type CalculationMethod = 'activity_based' | 'spend_based' | 'supplier_specific';

export const BOUNDARY_LABELS: Record<BoundaryApproach, string> = {
  operational_control: 'Operational control',
  financial_control: 'Financial control',
  equity_share: 'Equity share',
};

export const METHOD_LABELS: Record<CalculationMethod, string> = {
  activity_based: 'Activity-based (quantity × factor)',
  spend_based: 'Spend-based (money spent × factor)',
  supplier_specific: 'Supplier-specific (emissions reported by the supplier)',
};

export type ReportingStatus = 'draft' | 'submitted' | 'approved' | 'locked';

export interface ReportingPeriod {
  id: string;
  organizationId: string;
  year: number;
  isBaseYear: boolean;
  status: ReportingStatus;
  staffFte: string | null;
  recalculationThresholdPct: string;
  gwpSet?: GwpSet;
  boundaryApproach?: BoundaryApproach;
  submittedBy?: string | null;
  submittedAt?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  returnReason?: string | null;
  returnedAt?: string | null;
  submittedByName?: string | null;
  approvedByName?: string | null;
  returnedByName?: string | null;
}

export interface ActivityDataRow {
  id: string;
  facilityId: string;
  reportingPeriodId: string;
  categoryId: number;
  category: GhgCategory;
  sourceName: string;
  detail: string | null;
  fuelOrMaterialType: string | null;
  quantity: string;
  unit: string;
  scope2Method?: 'location_based' | 'market_based' | null;
  emissionFactorId?: string | null;
  /** Set on rows calculated automatically from another entry (WTT fuel, grid T&D losses). */
  sourceActivityDataId?: string | null;
  /** 1 = best (metered / supplier-verified) ... 5 = weakest (rough estimate). */
  dataQualityScore?: number | null;
  /** Scope 2 only: market-based result next to the location-based one. */
  marketEmissionFactorId?: string | null;
  marketEmissionsTco2e?: string | null;
  marketBasisNote?: string | null;
  calculationMethod?: CalculationMethod;
  co2Kg?: string | null;
  ch4Kg?: string | null;
  n2oKg?: string | null;
  gwpSetUsed?: GwpSet | null;
  emissionFactorValueUsed: string;
  emissionFactorUnitUsed: string;
  emissionFactorSourceUsed: string;
  emissionsKgco2e: string;
  emissionsTco2e: string;
  notes: string | null;
  status: ReportingStatus;
  enteredAt: string;
  attachments?: Attachment[];
}

export interface CreateActivityDataInput {
  facilityId: string;
  reportingPeriodId: string;
  categoryId: number;
  scope2Method?: 'location_based' | 'market_based';
  sourceName: string;
  detail?: string;
  fuelOrMaterialType?: string;
  quantity: number;
  unit: string;
  emissionFactorId?: string;
  notes?: string;
  marketEmissionFactorId?: string | null;
  dataQualityScore?: number | null;
  calculationMethod?: CalculationMethod;
}

export interface Scope3ScreeningRow {
  categoryId: number;
  categoryNo: number | null;
  category: string;
  isIncluded: boolean | null;
  relevanceAssessment: string | null;
  assessedAt: string | null;
  entries: number;
  tco2e: number;
}

export interface InventoryReport {
  generatedAt: string;
  organization: { name: string; country: string | null };
  facilities: { name: string; country: string | null; isActive: boolean }[];
  period: {
    year: number;
    status: ReportingStatus;
    isBaseYear: boolean;
    boundaryApproach: BoundaryApproach;
    gwpSet: GwpSet;
    staffFte: number | null;
    recalculationThresholdPct: number;
    submittedBy: string | null;
    submittedAt: string | null;
    approvedBy: string | null;
    approvedAt: string | null;
  };
  gwpValues: { co2: number; ch4: number; n2o: number; label: string };
  summary: DashboardSummary;
  byCategory: { scope: string; category: string; entries: number; tco2e: number }[];
  byGas: { co2Tonnes: number; ch4Tonnes: number; n2oTonnes: number; shareOfEmissionsSplitByGas: number | null };
  byMethod: { method: CalculationMethod; tco2e: number }[];
  scope3Screening: {
    categoryNo: number | null;
    category: string;
    status: 'quantified' | 'included_not_quantified' | 'excluded' | 'not_screened';
    tco2e: number;
    reason: string | null;
  }[];
  factorsUsed: { name: string; value: number; unit: string; source: string; year: number | null; entries: number }[];
  history: PeriodOverPeriodRow[];
}

export interface DashboardSummary {
  reportingPeriod: { id: string; year: number; isBaseYear: boolean; status: ReportingStatus };
  totals: { scope1Tco2e: number; scope2Tco2e: number; scope3Tco2e: number; totalTco2e: number };
  shareOfTotal: { scope1: number; scope2: number; scope3: number } | null;
  emissionsPerEmployee: number | null;
  largestScope: string | null;
  byActivity: { sourceName: string; scope: string; tco2e: number; dataQualityScore: number | null }[];
  scope2: { locationBasedTco2e: number; marketBasedTco2e: number; totalMarketBasedTco2e: number };
  dataQuality: Record<'overall' | 'scope1' | 'scope2' | 'scope3', { weightedScore: number | null; scoredShare: number | null }>;
}

export interface ImportRowResult {
  line: number;
  ok: boolean;
  errors: string[];
  sourceName?: string;
  category?: string;
  facility?: string;
  quantity?: number;
  unit?: string;
  emissionFactor?: string;
  emissionsTco2e?: number;
  marketEmissionsTco2e?: number | null;
}

export interface ImportResult {
  committed: boolean;
  created: number;
  summary: { rows: number; valid: number; invalid: number; totalTco2e: number };
  rows: ImportRowResult[];
}

export const DATA_QUALITY_LABELS: Record<number, string> = {
  1: '1 — Metered or supplier-verified',
  2: '2 — From invoices / receipts',
  3: '3 — Calculated from partial records',
  4: '4 — Industry average or benchmark',
  5: '5 — Rough estimate',
};

export interface PeriodOverPeriodRow {
  year: number;
  isBaseYear: boolean;
  status: ReportingStatus;
  scope1Tco2e: number;
  scope2Tco2e: number;
  scope3Tco2e: number;
  totalTco2e: number;
}

export interface Scope3CompletenessRow {
  category: string;
  isIncluded: boolean;
  isQuantified: boolean;
  relevanceAssessment: string;
}

// ---------- Phase 2: Reduce ----------

export type TargetCoverage = 'scope_1_2' | 'scope_3' | 'all_scopes';
export type InitiativeStatus = 'idea' | 'planned' | 'in_progress' | 'completed' | 'cancelled';

export const INITIATIVE_STATUS_LABELS: Record<InitiativeStatus, string> = {
  idea: 'Idea',
  planned: 'Planned',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export interface ReductionTargetRow {
  id: string;
  name: string;
  coverage: TargetCoverage;
  coverageLabel: string;
  targetType: 'absolute' | 'intensity';
  unit: string;
  baseYear: number;
  baseYearValue: number;
  targetYear: number;
  reductionPct: number;
  targetValue: number;
  notes: string | null;
  progress: { year: number; actual: number; expected: number; changeFromBasePct: number; status: 'on_track' | 'off_track' } | null;
  ambition: { annualRatePct: number; requiredAnnualRatePct: number; pathway: string; meetsReferenceRate: boolean } | null;
}

export interface ReductionInitiativeRow {
  id: string;
  name: string;
  description: string | null;
  scope: 'scope_1' | 'scope_2' | 'scope_3';
  categoryId: number | null;
  category: GhgCategory | null;
  status: InitiativeStatus;
  startYear: number;
  lifetimeYears: number;
  annualReductionTco2e: string;
  capex: string;
  annualOpexChange: string;
  currency: string;
  discountRatePct: string;
  owner: string | null;
  notes: string | null;
  costPerTonne: number;
  annualCost: number;
  lifetimeReductionTco2e: number;
}

export interface MaccBar {
  id: string;
  name: string;
  status: InitiativeStatus;
  currency: string;
  annualReductionTco2e: number;
  costPerTonne: number;
  annualCost: number;
  cumulativeStartTco2e: number;
  cumulativeEndTco2e: number;
}

export interface ReductionOverview {
  currency: string;
  currencies: string[];
  macc: MaccBar[];
  scenario: {
    growthPct: number;
    latestRecordedYear: number | null;
    targetSeries: { key: string; name: string }[];
    years: Record<string, number | null>[];
  };
  targets: ReductionTargetRow[];
  totals: { initiatives: number; plannedAnnualReductionTco2e: number; ideasAnnualReductionTco2e: number; savingInitiatives: number };
}


// ---------------------------------------------------------------------------------------------
// Offsets: carbon credits, removals, Tanzanian projects and claims (Phase 3a)
// ---------------------------------------------------------------------------------------------

export type CreditRegistry = 'verra' | 'gold_standard' | 'plan_vivo' | 'acr' | 'car' | 'article_6_4' | 'tanzania_national' | 'other';
export const REGISTRY_LABELS: Record<CreditRegistry, string> = {
  verra: 'Verra (VCS)',
  gold_standard: 'Gold Standard',
  plan_vivo: 'Plan Vivo',
  acr: 'ACR (American Carbon Registry)',
  car: 'CAR (Climate Action Reserve)',
  article_6_4: 'Article 6.4 (UN Paris Agreement mechanism)',
  tanzania_national: 'Tanzania national registry',
  other: 'Other',
};
export type CreditKind = 'avoidance_reduction' | 'removal_nature' | 'removal_technological';
export const CREDIT_KIND_LABELS: Record<CreditKind, string> = {
  avoidance_reduction: 'Avoids or reduces emissions',
  removal_nature: 'Removes CO2 — nature (trees, soil)',
  removal_technological: 'Removes CO2 — technology (biochar, capture)',
};

export interface CcpPrinciple { key: string; label: string }

export interface CreditRetirementRow {
  id: string;
  quantityTco2e: string;
  retiredOn: string;
  claimYear: number;
  beneficiary: string | null;
  retirementReference: string;
  evidenceUrl: string | null;
}

export interface CreditLotRow {
  id: string;
  projectName: string;
  registry: CreditRegistry;
  registryProjectId: string | null;
  methodology: string | null;
  kind: CreditKind;
  country: string | null;
  vintageYear: number;
  serialRange: string | null;
  quantityTco2e: string;
  ccpLabelled: boolean;
  article6Authorized: boolean;
  correspondingAdjustment: boolean;
  dueDiligence: Record<string, boolean | null> | null;
  pricePerTonne: string | null;
  currency: string | null;
  tzProjectId: string | null;
  notes: string | null;
  retirements: CreditRetirementRow[];
  retiredTco2e: number;
  availableTco2e: number;
  dueDiligenceScore: { passed: number; total: number; complete: boolean };
}

export type RemovalType = 'nature' | 'technological';
export interface RemovalRow {
  id: string;
  projectName: string;
  removalType: RemovalType;
  method: string;
  location: string | null;
  reportingYear: number;
  removedTco2e: string;
  reversalsTco2e: string;
  storageYears: number | null;
  reversalRiskPct: string | null;
  monitoringPlan: string | null;
  inValueChain: boolean;
  notes: string | null;
}

export type TzRegistrationStatus = 'concept' | 'submitted' | 'under_review' | 'approved' | 'registered' | 'rejected';
export type Article6Status = 'not_applicable' | 'requested' | 'authorized' | 'refused';
export interface TzProjectRow {
  id: string;
  name: string;
  projectType: string;
  isReddPlus: boolean;
  region: string | null;
  district: string | null;
  proponent: string | null;
  registrationStatus: TzRegistrationStatus;
  registrationNumber: string | null;
  ndcAlignment: string | null;
  communitySharePct: string | null;
  localGovernmentSharePct: string | null;
  nationalSharePct: string | null;
  otherSharePct: string | null;
  benefitSharingNote: string | null;
  article6Status: Article6Status;
  expectedAnnualCredits: string | null;
  standard: CreditRegistry | null;
  notes: string | null;
  warnings: string[];
}

export interface ClaimAttestation {
  limitedAssurance: boolean;
  assuranceProvider: string | null;
  inventoryPublished: boolean;
  publicDisclosureUrl: string | null;
  advocacyParisAligned: boolean;
  governanceInPlace: boolean;
}

export interface ClaimCheck {
  claimYear: number;
  grossEmissionsTco2e: number;
  credits: {
    eligibleRetiredTco2e: number;
    ineligibleRetiredTco2e: number;
    coveragePct: number;
    items: {
      retirementId: string;
      projectName: string;
      registry: CreditRegistry;
      vintageYear: number;
      quantityTco2e: number;
      retirementReference: string;
      eligible: boolean;
      basis: string;
      warnings: string[];
    }[];
  };
  removals: { removedTco2e: number; reversalsTco2e: number; netRemovalsTco2e: number };
  prerequisites: { key: string; label: string; met: boolean; source: 'platform' | 'attested'; note?: string }[];
  attestation: ClaimAttestation | null;
  tier: 'silver' | 'gold' | 'platinum' | null;
  claimPossible: boolean;
  summary: string;
  reminders: string[];
}

export interface Attachment {
  id: string;
  activityDataId: string;
  fileName: string;
  fileUrl: string;
  fileType: string | null;
  fileSizeBytes: number | null;
  uploadedBy: string;
  uploadedAt: string;
}
