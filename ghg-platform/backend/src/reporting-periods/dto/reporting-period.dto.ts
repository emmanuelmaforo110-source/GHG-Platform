import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

const BOUNDARIES = ['operational_control', 'financial_control', 'equity_share'] as const;
const GWP_SETS = ['AR5', 'AR6'] as const;

export class CreateReportingPeriodDto {
  @IsInt()
  @Min(1990)
  @Max(2100)
  year: number;

  @IsOptional()
  @IsBoolean()
  isBaseYear?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  staffFte?: number;

  // GHG Protocol organisational boundary approach
  @IsOptional()
  @IsIn(BOUNDARIES)
  boundaryApproach?: (typeof BOUNDARIES)[number];

  // IPCC Assessment Report used for Global Warming Potentials (AR6 is current GHG Protocol guidance)
  @IsOptional()
  @IsIn(GWP_SETS)
  gwpSet?: (typeof GWP_SETS)[number];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  recalculationThresholdPct?: number;
}

/** Settings that can be changed while a period is still a draft. */
export class UpdateReportingPeriodDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  staffFte?: number;

  @IsOptional()
  @IsIn(BOUNDARIES)
  boundaryApproach?: (typeof BOUNDARIES)[number];

  @IsOptional()
  @IsIn(GWP_SETS)
  gwpSet?: (typeof GWP_SETS)[number];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  recalculationThresholdPct?: number;
}

/** One Scope 3 category's relevance decision (GHG Protocol Scope 3 Standard, Table 6.1 criteria). */
export class Scope3ScreenDto {
  @IsInt()
  categoryId: number;

  @IsBoolean()
  isIncluded: boolean;

  // Why it is included or excluded: size, influence, risk, stakeholders, outsourcing, sector guidance
  @IsString()
  @MinLength(10, { message: 'Explain the decision in at least a short sentence (10 characters or more).' })
  relevanceAssessment: string;
}

export class ReturnToDraftDto {
  // What needs correcting, shown to the person who submitted the period
  @IsString()
  @MinLength(5)
  reason: string;
}
