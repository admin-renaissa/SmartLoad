-- EP-X-01 Phase B: per-org suite cutover
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "renverse_suite_cutover_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "organizations_renverse_suite_cutover_idx"
  ON "organizations" ("renverse_suite_cutover_at")
  WHERE "renverse_suite_cutover_at" IS NOT NULL;
