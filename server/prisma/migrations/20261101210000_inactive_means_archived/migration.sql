-- Inactive now means Archived, along with every repo. No email: this is a data cleanup.
-- Complete applications are exempt from the rule, so they return to Active.
UPDATE "Application" SET "status" = 'ACTIVE', "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'INACTIVE' AND "migrationStatus" = 'COMPLETE';

INSERT INTO "StatusHistory" ("repoId", "status", "note")
SELECT r."id", 'ARCHIVED', 'Marked inactive'
FROM "Repo" r JOIN "Application" a ON a."id" = r."applicationId"
WHERE a."status" = 'INACTIVE' AND r."status" <> 'ARCHIVED';

UPDATE "Repo" r SET "status" = 'ARCHIVED', "completedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
FROM "Application" a
WHERE a."id" = r."applicationId" AND a."status" = 'INACTIVE' AND r."status" <> 'ARCHIVED';

UPDATE "Application"
SET "status" = 'ARCHIVED', "archivedAt" = CURRENT_TIMESTAMP, "archiveReason" = 'Marked inactive', "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'INACTIVE';
