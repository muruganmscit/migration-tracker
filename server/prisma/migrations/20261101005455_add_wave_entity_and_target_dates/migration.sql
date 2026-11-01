-- CreateTable
CREATE TABLE "Wave" (
    "id" SERIAL NOT NULL,
    "number" INTEGER NOT NULL,
    "targetDate" TIMESTAMP(3),
    "proposedTargetDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wave_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Wave_number_key" ON "Wave"("number");

-- Seed the 4 planned waves
INSERT INTO "Wave" ("number", "updatedAt") VALUES (1, CURRENT_TIMESTAMP), (2, CURRENT_TIMESTAMP), (3, CURRENT_TIMESTAMP), (4, CURRENT_TIMESTAMP);

-- AlterTable: add new Application columns alongside the old "wave" int column
ALTER TABLE "Application" ADD COLUMN     "waveId" INTEGER;
ALTER TABLE "Application" ADD COLUMN     "targetDate" TIMESTAMP(3);
ALTER TABLE "Application" ADD COLUMN     "proposedTargetDate" TIMESTAMP(3);

-- Backfill waveId from the old wave number column before dropping it
UPDATE "Application" SET "waveId" = (SELECT "id" FROM "Wave" WHERE "Wave"."number" = "Application"."wave") WHERE "Application"."wave" IS NOT NULL;

-- AlterTable: drop the old scalar wave column now that it's been migrated to the relation
ALTER TABLE "Application" DROP COLUMN "wave";

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_waveId_fkey" FOREIGN KEY ("waveId") REFERENCES "Wave"("id") ON DELETE SET NULL ON UPDATE CASCADE;
