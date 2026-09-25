import { IsIn, IsInt, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Max, Min } from 'class-validator';

/**
 * All fields optional: only the fields sent are changed. The old and new values are written to the
 * audit log, so every edit keeps a history of who changed what and when.
 */
export class UpdateActivityDataDto {
  @IsOptional()
  @IsUUID()
  facilityId?: string;

  @IsOptional()
  @IsUUID()
  reportingPeriodId?: string;

  @IsOptional()
  @IsInt()
  categoryId?: number;

  @IsOptional()
  @IsIn(['location_based', 'market_based'])
  scope2Method?: 'location_based' | 'market_based';

  @IsOptional()
  @IsString()
  sourceName?: string;

  @IsOptional()
  @IsString()
  detail?: string;

  @IsOptional()
  @IsString()
  fuelOrMaterialType?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  quantity?: number;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsUUID()
  emissionFactorId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  // Scope 2 only: the factor of a contractual instrument (supplier-specific rate, renewable
  // certificate, green tariff) for the market-based result. Leave empty to use the grid average.
  // Send null on an update to remove a previously recorded instrument.
  @IsOptional()
  @IsUUID()
  marketEmissionFactorId?: string | null;

  // 1 = metered or supplier-verified data ... 5 = rough estimate. Send null on an update to clear it.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  dataQualityScore?: number | null;

  // activity_based (default) or spend_based follow the chosen emission factor automatically;
  // supplier_specific = the supplier's reported emissions entered directly (unit "kg CO2e" or "t CO2e").
  @IsOptional()
  @IsIn(['activity_based', 'spend_based', 'supplier_specific'])
  calculationMethod?: 'activity_based' | 'spend_based' | 'supplier_specific';
}
