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
}

export type ReportingStatus = 'draft' | 'submitted' | 'approved' | 'locked';

export interface ReportingPeriod {
  id: string;
  organizationId: string;
  year: number;
  isBaseYear: boolean;
  status: ReportingStatus;
  staffFte: string | null;
  recalculationThresholdPct: string;
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
  emissionFactorValueUsed: string;
  emissionFactorUnitUsed: string;
  emissionFactorSourceUsed: string;
  emissionsKgco2e: string;
  emissionsTco2e: string;
  notes: string | null;
  status: ReportingStatus;
  enteredAt: string;
  attachments?: { id: string; fileName: string; fileUrl: string }[];
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
