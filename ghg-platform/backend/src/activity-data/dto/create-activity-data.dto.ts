import { IsIn, IsInt, IsNumber, IsOptional, IsPositive, IsString, IsUUID } from 'class-validator';

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
}
