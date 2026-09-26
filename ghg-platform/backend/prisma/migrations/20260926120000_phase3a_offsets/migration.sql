-- Phase 3a (Offset): carbon credits and retirements, removals, Tanzanian carbon projects, claim attestations

CREATE TYPE "CreditRegistry" AS ENUM ('verra', 'gold_standard', 'plan_vivo', 'acr', 'car', 'article_6_4', 'tanzania_national', 'other');
CREATE TYPE "CreditKind" AS ENUM ('avoidance_reduction', 'removal_nature', 'removal_technological');
CREATE TYPE "RemovalType" AS ENUM ('nature', 'technological');
CREATE TYPE "TzRegistrationStatus" AS ENUM ('concept', 'submitted', 'under_review', 'approved', 'registered', 'rejected');
CREATE TYPE "Article6Status" AS ENUM ('not_applicable', 'requested', 'authorized', 'refused');

CREATE TABLE "tz_carbon_projects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "project_type" TEXT NOT NULL,
    "is_redd_plus" BOOLEAN NOT NULL DEFAULT false,
    "region" TEXT,
    "district" TEXT,
    "proponent" TEXT,
    "registration_status" "TzRegistrationStatus" NOT NULL DEFAULT 'concept',
    "registration_number" TEXT,
    "ndc_alignment" TEXT,
    "community_share_pct" DECIMAL(5,2),
    "local_government_share_pct" DECIMAL(5,2),
    "national_share_pct" DECIMAL(5,2),
    "other_share_pct" DECIMAL(5,2),
    "benefit_sharing_note" TEXT,
    "article6_status" "Article6Status" NOT NULL DEFAULT 'not_applicable',
    "expected_annual_credits" DECIMAL(14,2),
    "standard" "CreditRegistry",
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tz_carbon_projects_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "tz_carbon_projects_organization_id_idx" ON "tz_carbon_projects"("organization_id");
ALTER TABLE "tz_carbon_projects" ADD CONSTRAINT "tz_carbon_projects_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "credit_lots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_name" TEXT NOT NULL,
    "registry" "CreditRegistry" NOT NULL,
    "registry_project_id" TEXT,
    "methodology" TEXT,
    "kind" "CreditKind" NOT NULL DEFAULT 'avoidance_reduction',
    "country" TEXT,
    "vintage_year" INTEGER NOT NULL,
    "serial_range" TEXT,
    "quantity_tco2e" DECIMAL(14,4) NOT NULL,
    "ccp_labelled" BOOLEAN NOT NULL DEFAULT false,
    "article6_authorized" BOOLEAN NOT NULL DEFAULT false,
    "corresponding_adjustment" BOOLEAN NOT NULL DEFAULT false,
    "due_diligence" JSONB,
    "purchase_date" TIMESTAMP(3),
    "price_per_tonne" DECIMAL(14,2),
    "currency" TEXT,
    "tz_project_id" UUID,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "credit_lots_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "credit_lots_quantity_check" CHECK ("quantity_tco2e" > 0)
);
CREATE INDEX "credit_lots_organization_id_idx" ON "credit_lots"("organization_id");
ALTER TABLE "credit_lots" ADD CONSTRAINT "credit_lots_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "credit_lots" ADD CONSTRAINT "credit_lots_tz_project_id_fkey"
  FOREIGN KEY ("tz_project_id") REFERENCES "tz_carbon_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "credit_retirements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "quantity_tco2e" DECIMAL(14,4) NOT NULL,
    "retired_on" TIMESTAMP(3) NOT NULL,
    "claim_year" INTEGER NOT NULL,
    "beneficiary" TEXT,
    "retirement_reference" TEXT NOT NULL,
    "evidence_url" TEXT,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "credit_retirements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "credit_retirements_quantity_check" CHECK ("quantity_tco2e" > 0)
);
CREATE INDEX "credit_retirements_organization_id_claim_year_idx" ON "credit_retirements"("organization_id", "claim_year");
ALTER TABLE "credit_retirements" ADD CONSTRAINT "credit_retirements_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "credit_retirements" ADD CONSTRAINT "credit_retirements_lot_id_fkey"
  FOREIGN KEY ("lot_id") REFERENCES "credit_lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "removal_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_name" TEXT NOT NULL,
    "removal_type" "RemovalType" NOT NULL,
    "method" TEXT NOT NULL,
    "location" TEXT,
    "reporting_year" INTEGER NOT NULL,
    "removed_tco2e" DECIMAL(14,4) NOT NULL,
    "reversals_tco2e" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "storage_years" INTEGER,
    "reversal_risk_pct" DECIMAL(5,2),
    "monitoring_plan" TEXT,
    "last_monitored_on" TIMESTAMP(3),
    "in_value_chain" BOOLEAN NOT NULL DEFAULT true,
    "evidence_url" TEXT,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "removal_records_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "removal_records_organization_id_reporting_year_idx" ON "removal_records"("organization_id", "reporting_year");
ALTER TABLE "removal_records" ADD CONSTRAINT "removal_records_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "claim_attestations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "claim_year" INTEGER NOT NULL,
    "limited_assurance" BOOLEAN NOT NULL DEFAULT false,
    "assurance_provider" TEXT,
    "inventory_published" BOOLEAN NOT NULL DEFAULT false,
    "public_disclosure_url" TEXT,
    "advocacy_paris_aligned" BOOLEAN NOT NULL DEFAULT false,
    "governance_in_place" BOOLEAN NOT NULL DEFAULT false,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "claim_attestations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "claim_attestations_organization_id_claim_year_key" ON "claim_attestations"("organization_id", "claim_year");
ALTER TABLE "claim_attestations" ADD CONSTRAINT "claim_attestations_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
