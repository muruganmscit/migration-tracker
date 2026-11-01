-- Repo statuses
ALTER TYPE "RepoStatus" RENAME VALUE 'IN_PROGRESS' TO 'MIGRATING';
ALTER TYPE "RepoStatus" RENAME VALUE 'VALIDATION' TO 'VALIDATING';
ALTER TYPE "RepoStatus" ADD VALUE 'VALIDATED' BEFORE 'ADOPTED';

-- Application phases. The old values meant "reached", the new ones mean "currently in", so
-- each old value maps to the phase that follows it. Renamed last-first to avoid name clashes.
ALTER TYPE "MigrationStatus" RENAME VALUE 'ADOPTED' TO 'COMPLETE';
ALTER TYPE "MigrationStatus" RENAME VALUE 'VALIDATED' TO 'ADOPTION';
ALTER TYPE "MigrationStatus" RENAME VALUE 'MIGRATED' TO 'VALIDATION';
ALTER TYPE "MigrationStatus" ADD VALUE 'MIGRATION' BEFORE 'VALIDATION';

CREATE TYPE "EmailEvent" AS ENUM ('CLEANUP_STARTED', 'CLEANUP_COMPLETED', 'MIGRATION_STARTED', 'MIGRATION_COMPLETED', 'VALIDATION_STARTED', 'VALIDATION_COMPLETED', 'ADOPTION_STARTED', 'ADOPTION_COMPLETED', 'PHASE_REOPENED', 'APPLICATION_ARCHIVED', 'PHASE_OVERRIDDEN');
CREATE TYPE "CleanupDecision" AS ENUM ('KEEP', 'ARCHIVE');

ALTER TABLE "Wave" ADD COLUMN "targetStartDate" TIMESTAMP(3);

ALTER TABLE "Application"
  ADD COLUMN "targetStartDate" TIMESTAMP(3),
  ADD COLUMN "overrideReason" TEXT,
  ADD COLUMN "cleanupStartedAt" TIMESTAMP(3),
  ADD COLUMN "cleanupEndedAt" TIMESTAMP(3),
  ADD COLUMN "migrationStartedAt" TIMESTAMP(3),
  ADD COLUMN "migrationEndedAt" TIMESTAMP(3),
  ADD COLUMN "validationStartedAt" TIMESTAMP(3),
  ADD COLUMN "validationEndedAt" TIMESTAMP(3),
  ADD COLUMN "adoptionStartedAt" TIMESTAMP(3),
  ADD COLUMN "adoptionEndedAt" TIMESTAMP(3),
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "archiveReason" TEXT;

-- Applications already past Cleanup are treated as having finished it, so they don't fall back.
UPDATE "Application"
SET "cleanupStartedAt" = "updatedAt", "cleanupEndedAt" = "updatedAt"
WHERE "migrationStatus"::text IN ('VALIDATION', 'ADOPTION', 'COMPLETE');
UPDATE "Application" SET "cleanupStartedAt" = "updatedAt" WHERE "migrationStatus"::text = 'CLEANUP';
UPDATE "Application" SET "archivedAt" = "updatedAt" WHERE "status" = 'ARCHIVED';

ALTER TABLE "Repo" ADD COLUMN "cleanupDecision" "CleanupDecision", ADD COLUMN "cleanupReason" TEXT;

-- Templates become per-event, keeping any custom wording. "Tracking started" has no event any more.
ALTER TABLE "EmailTemplate" ADD COLUMN "event" "EmailEvent";
UPDATE "EmailTemplate" SET "event" = CASE "stage"::text
  WHEN 'CLEANUP' THEN 'CLEANUP_STARTED'
  WHEN 'VALIDATION' THEN 'MIGRATION_COMPLETED'
  WHEN 'ADOPTION' THEN 'VALIDATION_COMPLETED'
  WHEN 'COMPLETE' THEN 'ADOPTION_COMPLETED'
END::"EmailEvent";
DELETE FROM "EmailTemplate" WHERE "event" IS NULL;
ALTER TABLE "EmailTemplate" ALTER COLUMN "event" SET NOT NULL;
DROP INDEX "EmailTemplate_stage_key";
ALTER TABLE "EmailTemplate" DROP COLUMN "stage";
CREATE UNIQUE INDEX "EmailTemplate_event_key" ON "EmailTemplate"("event");

-- Email history keeps every row, recording the old stage as the matching event name.
ALTER TABLE "EmailLog" ALTER COLUMN "stage" TYPE TEXT USING "stage"::text;
ALTER TABLE "EmailLog" RENAME COLUMN "stage" TO "event";
UPDATE "EmailLog" SET "event" = CASE "event"
  WHEN 'NOT_STARTED' THEN 'TRACKING_STARTED'
  WHEN 'CLEANUP' THEN 'CLEANUP_STARTED'
  WHEN 'VALIDATION' THEN 'MIGRATION_COMPLETED'
  WHEN 'ADOPTION' THEN 'VALIDATION_COMPLETED'
  WHEN 'COMPLETE' THEN 'ADOPTION_COMPLETED'
  ELSE "event"
END;
