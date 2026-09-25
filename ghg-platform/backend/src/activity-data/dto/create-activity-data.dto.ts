import { IsIn, IsInt, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Max, Min } from 'class-validator';

export class CreateActivityDataDto {
  @IsUUID()
  facilityId: string;

  @IsUUID()
  reportingPeriodId: string;

  @IsInt()
  categoryId: number; // FK to ghg_categories — determines scope + which factor pool to resolve against

  @IsOptional()
  @IsIn(['location_based', 'market_based'])
  scope2Method?: 'location_based' | 'market_based';

  @IsString()
  sourceName: string; // e.g. "Backup generator", "Office electricity"

  @IsOptional()
  @IsString()
  detail?: string;

  @IsOptional()
  @IsString()
  fuelOrMaterialType?: string; // e.g. "Diesel", "R-410A" — used to disambiguate which factor to pick

  @IsNumber()
  @IsPositive()
  quantity: number;

  @IsString()
  unit: string;

  // Optional explicit override: if the caller already knows which emission_factors row to use
  // (e.g. selected from a dropdown in the UI), pass it directly. Otherwise the service resolves
  // one automatically by categoryId + fuelOrMaterialType + reporting period's year.
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
