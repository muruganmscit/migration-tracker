-- CreateEnum
CREATE TYPE "Technology" AS ENUM ('JAVA', 'NODEJS', 'PYTHON', 'DOTNET', 'GO', 'OTHERS');
CREATE TYPE "PipelineType" AS ENUM ('DEFAULT_NODE', 'DEFAULT_JAVA', 'DEFAULT_PYTHON', 'DEFAULT_DOTNET', 'DEFAULT_GO', 'CUSTOM');

-- AlterTable: free-text technology/pipelineType become enum-typed columns
ALTER TABLE "Repo" DROP COLUMN "technology";
ALTER TABLE "Repo" DROP COLUMN "pipelineType";
ALTER TABLE "Repo" ADD COLUMN "technology" "Technology";
ALTER TABLE "Repo" ADD COLUMN "pipelineType" "PipelineType";
