import { IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class ReductionTargetDto {
  @IsString()
  @MinLength(3)
  name: string;

  // scope_1_2 = Scope 1 + 2 (location-based); scope_3; all_scopes
  @IsIn(['scope_1_2', 'scope_3', 'all_scopes'])
  coverage: 'scope_1_2' | 'scope_3' | 'all_scopes';

  // absolute = total tCO2e; intensity = tCO2e per employee (FTE)
  @IsOptional()
  @IsIn(['absolute', 'intensity'])
  targetType?: 'absolute' | 'intensity';

  @IsInt()
  @Min(1990)
  @Max(2100)
  baseYear: number;

  // Leave out to take the value from the base-year reporting period in the platform.
  @IsOptional()
  @IsNumber()
  @Min(0)
  baseYearValue?: number;

  @IsInt()
  @Min(1990)
  @Max(2100)
  targetYear: number;

  @IsNumber()
  @Min(0.1)
  @Max(100)
  reductionPct: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

const STATUSES = ['idea', 'planned', 'in_progress', 'completed', 'cancelled'] as const;

export class ReductionInitiativeDto {
  @IsString()
  @MinLength(3)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsIn(['scope_1', 'scope_2', 'scope_3'])
  scope: 'scope_1' | 'scope_2' | 'scope_3';

  @IsOptional()
  @IsInt()
  categoryId?: number;

  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];

  @IsInt()
  @Min(1990)
  @Max(2100)
  startYear: number;

  @IsInt()
  @Min(1)
  @Max(50)
  lifetimeYears: number;

  // tCO2e avoided per year once running
  @IsNumber()
  @Min(0.0001)
  annualReductionTco2e: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  capex?: number;

  // negative = yearly savings (e.g. lower fuel or electricity bills)
  @IsOptional()
  @IsNumber()
  annualOpexChange?: number;

  @IsOptional()
  @IsString()
  @MinLength(3)
  currency?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(50)
  discountRatePct?: number;

  @IsOptional()
  @IsString()
  owner?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

/** For edits every field is optional. */
export class UpdateReductionInitiativeDto {
  @IsOptional() @IsString() @MinLength(3) name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsIn(['scope_1', 'scope_2', 'scope_3']) scope?: 'scope_1' | 'scope_2' | 'scope_3';
  @IsOptional() @IsInt() categoryId?: number;
  @IsOptional() @IsIn(STATUSES) status?: (typeof STATUSES)[number];
  @IsOptional() @IsInt() @Min(1990) @Max(2100) startYear?: number;
  @IsOptional() @IsInt() @Min(1) @Max(50) lifetimeYears?: number;
  @IsOptional() @IsNumber() @Min(0.0001) annualReductionTco2e?: number;
  @IsOptional() @IsNumber() @Min(0) capex?: number;
  @IsOptional() @IsNumber() annualOpexChange?: number;
  @IsOptional() @IsString() @MinLength(3) currency?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(50) discountRatePct?: number;
  @IsOptional() @IsString() owner?: string;
  @IsOptional() @IsString() notes?: string;
}
