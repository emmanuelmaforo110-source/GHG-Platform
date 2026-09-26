-- Phase 2 (Reduce): reduction targets and reduction initiatives

CREATE TYPE "TargetCoverage" AS ENUM ('scope_1_2', 'scope_3', 'all_scopes');
CREATE TYPE "TargetType" AS ENUM ('absolute', 'intensity');
CREATE TYPE "InitiativeStatus" AS ENUM ('idea', 'planned', 'in_progress', 'completed', 'cancelled');

CREATE TABLE "reduction_targets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "coverage" "TargetCoverage" NOT NULL,
    "target_type" "TargetType" NOT NULL DEFAULT 'absolute',
    "base_year" INTEGER NOT NULL,
    "base_year_value" DECIMAL(16,6) NOT NULL,
    "target_year" INTEGER NOT NULL,
    "reduction_pct" DECIMAL(5,2) NOT NULL,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reduction_targets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "reduction_targets_years_check" CHECK ("target_year" > "base_year"),
    CONSTRAINT "reduction_targets_pct_check" CHECK ("reduction_pct" > 0 AND "reduction_pct" <= 100)
);
CREATE INDEX "reduction_targets_organization_id_idx" ON "reduction_targets"("organization_id");
ALTER TABLE "reduction_targets" ADD CONSTRAINT "reduction_targets_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "reduction_initiatives" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scope" "GhgScope" NOT NULL,
    "category_id" INTEGER,
    "status" "InitiativeStatus" NOT NULL DEFAULT 'idea',
    "start_year" INTEGER NOT NULL,
    "lifetime_years" INTEGER NOT NULL,
    "annual_reduction_tco2e" DECIMAL(14,4) NOT NULL,
    "capex" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "annual_opex_change" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "discount_rate_pct" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "owner" TEXT,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reduction_initiatives_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "reduction_initiatives_lifetime_check" CHECK ("lifetime_years" > 0),
    CONSTRAINT "reduction_initiatives_reduction_check" CHECK ("annual_reduction_tco2e" > 0)
);
CREATE INDEX "reduction_initiatives_organization_id_idx" ON "reduction_initiatives"("organization_id");
ALTER TABLE "reduction_initiatives" ADD CONSTRAINT "reduction_initiatives_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reduction_initiatives" ADD CONSTRAINT "reduction_initiatives_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "ghg_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
