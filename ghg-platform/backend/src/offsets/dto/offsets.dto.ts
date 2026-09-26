import { IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, IsUUID, Max, Min, MinLength } from 'class-validator';

const REGISTRIES = ['verra', 'gold_standard', 'plan_vivo', 'acr', 'car', 'article_6_4', 'tanzania_national', 'other'] as const;
const KINDS = ['avoidance_reduction', 'removal_nature', 'removal_technological'] as const;

export class CreditLotDto {
  @IsString() @MinLength(2) projectName: string;
  @IsIn(REGISTRIES) registry: (typeof REGISTRIES)[number];
  @IsOptional() @IsString() registryProjectId?: string;
  @IsOptional() @IsString() methodology?: string;
  @IsOptional() @IsIn(KINDS) kind?: (typeof KINDS)[number];
  @IsOptional() @IsString() country?: string;
  @IsInt() @Min(2000) @Max(2100) vintageYear: number;
  @IsOptional() @IsString() serialRange?: string;
  @IsNumber() @Min(0.0001) quantityTco2e: number;
  @IsOptional() @IsBoolean() ccpLabelled?: boolean;
  @IsOptional() @IsBoolean() article6Authorized?: boolean;
  @IsOptional() @IsBoolean() correspondingAdjustment?: boolean;
  // { governance: true, tracking: true, ... } — see CCP_PRINCIPLES
  @IsOptional() @IsObject() dueDiligence?: Record<string, boolean | null>;
  @IsOptional() @IsDateString() purchaseDate?: string;
  @IsOptional() @IsNumber() @Min(0) pricePerTonne?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsUUID() tzProjectId?: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateCreditLotDto {
  @IsOptional() @IsString() @MinLength(2) projectName?: string;
  @IsOptional() @IsIn(REGISTRIES) registry?: (typeof REGISTRIES)[number];
  @IsOptional() @IsString() registryProjectId?: string;
  @IsOptional() @IsString() methodology?: string;
  @IsOptional() @IsIn(KINDS) kind?: (typeof KINDS)[number];
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsInt() @Min(2000) @Max(2100) vintageYear?: number;
  @IsOptional() @IsString() serialRange?: string;
  @IsOptional() @IsNumber() @Min(0.0001) quantityTco2e?: number;
  @IsOptional() @IsBoolean() ccpLabelled?: boolean;
  @IsOptional() @IsBoolean() article6Authorized?: boolean;
  @IsOptional() @IsBoolean() correspondingAdjustment?: boolean;
  @IsOptional() @IsObject() dueDiligence?: Record<string, boolean | null>;
  @IsOptional() @IsDateString() purchaseDate?: string;
  @IsOptional() @IsNumber() @Min(0) pricePerTonne?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsUUID() tzProjectId?: string;
  @IsOptional() @IsString() notes?: string;
}

export class RetireCreditsDto {
  @IsNumber() @Min(0.0001) quantityTco2e: number;
  @IsDateString() retiredOn: string;
  // The reporting year whose claim these credits support
  @IsInt() @Min(2000) @Max(2100) claimYear: number;
  @IsOptional() @IsString() beneficiary?: string;
  // Registry retirement reference or the serial numbers retired
  @IsString() @MinLength(3) retirementReference: string;
  @IsOptional() @IsString() evidenceUrl?: string;
  @IsOptional() @IsString() notes?: string;
}

export class RemovalRecordDto {
  @IsString() @MinLength(2) projectName: string;
  @IsIn(['nature', 'technological']) removalType: 'nature' | 'technological';
  @IsString() @MinLength(2) method: string;
  @IsOptional() @IsString() location?: string;
  @IsInt() @Min(2000) @Max(2100) reportingYear: number;
  @IsNumber() @Min(0) removedTco2e: number;
  @IsOptional() @IsNumber() @Min(0) reversalsTco2e?: number;
  @IsOptional() @IsInt() @Min(0) storageYears?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) reversalRiskPct?: number;
  @IsOptional() @IsString() monitoringPlan?: string;
  @IsOptional() @IsDateString() lastMonitoredOn?: string;
  @IsOptional() @IsBoolean() inValueChain?: boolean;
  @IsOptional() @IsString() evidenceUrl?: string;
  @IsOptional() @IsString() notes?: string;
}

export class TzCarbonProjectDto {
  @IsString() @MinLength(2) name: string;
  @IsString() @MinLength(2) projectType: string;
  @IsOptional() @IsBoolean() isReddPlus?: boolean;
  @IsOptional() @IsString() region?: string;
  @IsOptional() @IsString() district?: string;
  @IsOptional() @IsString() proponent?: string;
  @IsOptional() @IsIn(['concept', 'submitted', 'under_review', 'approved', 'registered', 'rejected'])
  registrationStatus?: 'concept' | 'submitted' | 'under_review' | 'approved' | 'registered' | 'rejected';
  @IsOptional() @IsString() registrationNumber?: string;
  @IsOptional() @IsString() ndcAlignment?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) communitySharePct?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) localGovernmentSharePct?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) nationalSharePct?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) otherSharePct?: number;
  @IsOptional() @IsString() benefitSharingNote?: string;
  @IsOptional() @IsIn(['not_applicable', 'requested', 'authorized', 'refused'])
  article6Status?: 'not_applicable' | 'requested' | 'authorized' | 'refused';
  @IsOptional() @IsNumber() @Min(0) expectedAnnualCredits?: number;
  @IsOptional() @IsIn(REGISTRIES) standard?: (typeof REGISTRIES)[number];
  @IsOptional() @IsString() notes?: string;
}

export class ClaimAttestationDto {
  @IsOptional() @IsBoolean() limitedAssurance?: boolean;
  @IsOptional() @IsString() assuranceProvider?: string;
  @IsOptional() @IsBoolean() inventoryPublished?: boolean;
  @IsOptional() @IsString() publicDisclosureUrl?: string;
  @IsOptional() @IsBoolean() advocacyParisAligned?: boolean;
  @IsOptional() @IsBoolean() governanceInPlace?: boolean;
}
