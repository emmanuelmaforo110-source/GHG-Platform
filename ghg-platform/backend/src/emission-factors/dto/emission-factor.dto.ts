import { IsInt, IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

/**
 * An organisation-specific emission factor: either a reviewed override of a global default (same
 * name, category and year) or a new factor (e.g. a supplier-specific or spend-based factor).
 */
export class EmissionFactorDto {
  @IsInt()
  categoryId: number;

  @IsString()
  @MinLength(2)
  factorName: string;

  // kg CO2e per unit
  @IsNumber()
  @Min(0)
  value: number;

  // "kg CO2e / <unit>", e.g. "kg CO2e / litre", "kg CO2e / kWh", "kg CO2e / USD" (spend-based)
  @IsString()
  @MinLength(3)
  unit: string;

  @IsInt()
  @Min(1990)
  @Max(2100)
  validYear: number;

  @IsString()
  @MinLength(3)
  source: string;

  @IsOptional()
  @IsString()
  notes?: string;

  // Optional split by gas, in kg of each gas per unit. Give all three or none.
  @IsOptional()
  @IsNumber()
  @Min(0)
  co2PerUnit?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  ch4PerUnit?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  n2oPerUnit?: number;
}
