-- Every application now belongs to a wave. Any without one go to Wave 4, the unscheduled wave.
UPDATE "Application"
SET "waveId" = (SELECT "id" FROM "Wave" WHERE "number" = 4), "updatedAt" = CURRENT_TIMESTAMP
WHERE "waveId" IS NULL;

ALTER TABLE "Application" DROP CONSTRAINT "Application_waveId_fkey";
ALTER TABLE "Application" ALTER COLUMN "waveId" SET NOT NULL;
ALTER TABLE "Application" ADD CONSTRAINT "Application_waveId_fkey" FOREIGN KEY ("waveId") REFERENCES "Wave"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
