-- Phase 0: automatic (derived) WTT / T&D rows
-- 1. Remove orphaned derived rows left behind by earlier deletes (their source row no longer exists).
DELETE FROM "activity_data"
WHERE "derivation_note" IS NOT NULL
  AND "source_activity_data_id" IS NULL;

-- 2. Remove duplicate derived rows, keeping the most recently updated one per source + category.
DELETE FROM "activity_data" a
USING "activity_data" b
WHERE a."source_activity_data_id" IS NOT NULL
  AND a."source_activity_data_id" = b."source_activity_data_id"
  AND a."category_id" = b."category_id"
  AND (a."updated_at", a."id") < (b."updated_at", b."id");

-- 3. Deleting a source row now deletes its derived row too.
ALTER TABLE "activity_data" DROP CONSTRAINT "activity_data_source_activity_data_id_fkey";
ALTER TABLE "activity_data" ADD CONSTRAINT "activity_data_source_activity_data_id_fkey"
  FOREIGN KEY ("source_activity_data_id") REFERENCES "activity_data"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. At most one derived row per source row and category.
CREATE UNIQUE INDEX "activity_data_source_activity_data_id_category_id_key"
  ON "activity_data"("source_activity_data_id", "category_id");
