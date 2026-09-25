-- Phase 1 (part 1): verifier role, data-quality score, Scope 2 market-based results

-- New read-only role for external verifiers / auditors.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'verifier';

-- Data quality score per entry (1 = best, 5 = weakest).
ALTER TABLE "activity_data" ADD COLUMN "data_quality_score" INTEGER;
ALTER TABLE "activity_data" ADD CONSTRAINT "activity_data_data_quality_score_check"
  CHECK ("data_quality_score" IS NULL OR "data_quality_score" BETWEEN 1 AND 5);

-- Market-based Scope 2 result, stored next to the location-based result.
ALTER TABLE "activity_data" ADD COLUMN "market_emission_factor_id" UUID;
ALTER TABLE "activity_data" ADD COLUMN "market_factor_value_used" DECIMAL(14,6);
ALTER TABLE "activity_data" ADD COLUMN "market_factor_unit_used" TEXT;
ALTER TABLE "activity_data" ADD COLUMN "market_factor_source_used" TEXT;
ALTER TABLE "activity_data" ADD COLUMN "market_emissions_kgco2e" DECIMAL(16,4);
ALTER TABLE "activity_data" ADD COLUMN "market_emissions_tco2e" DECIMAL(16,6);
ALTER TABLE "activity_data" ADD COLUMN "market_basis_note" TEXT;

-- Existing Scope 2 rows: no contractual instrument was recorded, so the market-based result
-- equals the location-based one (grid average used as a proxy), and is flagged as such.
UPDATE "activity_data" a
SET "market_emission_factor_id" = a."emission_factor_id",
    "market_factor_value_used"  = a."emission_factor_value_used",
    "market_factor_unit_used"   = a."emission_factor_unit_used",
    "market_factor_source_used" = a."emission_factor_source_used",
    "market_emissions_kgco2e"   = a."emissions_kgco2e",
    "market_emissions_tco2e"    = a."emissions_tco2e",
    "market_basis_note"         = 'No contractual instrument recorded; grid average used as a proxy for the residual mix.'
FROM "ghg_categories" c
WHERE a."category_id" = c."id" AND c."scope" = 'scope_2';
