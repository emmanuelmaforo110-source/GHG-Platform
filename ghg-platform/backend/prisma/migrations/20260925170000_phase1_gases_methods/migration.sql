-- Phase 1 (part 2): results per gas with a choice of GWP set, and Scope 3 calculation methods

CREATE TYPE "GwpSet" AS ENUM ('AR5', 'AR6');
CREATE TYPE "CalculationMethod" AS ENUM ('activity_based', 'spend_based', 'supplier_specific');

-- Reporting period: which IPCC Assessment Report's GWP values are used (AR6 = current GHG Protocol guidance).
ALTER TABLE "reporting_periods" ADD COLUMN "gwp_set" "GwpSet" NOT NULL DEFAULT 'AR6';

-- Emission factors: optional split by gas (kg of each gas per unit).
ALTER TABLE "emission_factors" ADD COLUMN "co2_per_unit" DECIMAL(18,9);
ALTER TABLE "emission_factors" ADD COLUMN "ch4_per_unit" DECIMAL(18,9);
ALTER TABLE "emission_factors" ADD COLUMN "n2o_per_unit" DECIMAL(18,9);

-- Activity data: calculation method and the mass of each gas.
ALTER TABLE "activity_data" ADD COLUMN "calculation_method" "CalculationMethod" NOT NULL DEFAULT 'activity_based';
ALTER TABLE "activity_data" ADD COLUMN "co2_kg" DECIMAL(18,6);
ALTER TABLE "activity_data" ADD COLUMN "ch4_kg" DECIMAL(18,6);
ALTER TABLE "activity_data" ADD COLUMN "n2o_kg" DECIMAL(18,6);
ALTER TABLE "activity_data" ADD COLUMN "gwp_set_used" "GwpSet";
