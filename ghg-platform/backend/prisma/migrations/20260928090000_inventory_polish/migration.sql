-- Inventory polish (September 2026)

-- 1. An approver can send a submitted period back to draft, with a reason.
ALTER TABLE "reporting_periods"
  ADD COLUMN "return_reason" TEXT,
  ADD COLUMN "returned_by" UUID,
  ADD COLUMN "returned_at" TIMESTAMP(3);

ALTER TABLE "reporting_periods" ADD CONSTRAINT "reporting_periods_returned_by_fkey"
  FOREIGN KEY ("returned_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. The platform's default (global) emission factors have been reviewed by Pemandu (September 2026).
--    Organisation-specific factors are not touched.
UPDATE "emission_factors" SET "is_reviewed" = true WHERE "organization_id" IS NULL AND "is_default" = true;

UPDATE "emission_factors"
SET "source" = 'International grid-factor databases (IEA/Climatiq); confirmed against the UNFCCC GHG Emissions Calculator 2022 (IFI 2021 harmonised grid factor for Tanzania: 0.336 kg CO2e/kWh)'
WHERE "organization_id" IS NULL AND "factor_name" = 'Tanzania grid electricity';
