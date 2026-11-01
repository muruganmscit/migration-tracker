import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { AppStatus, CleanupDecision, PipelineType, RepoStatus, Technology } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { recomputeMigrationStatus } from "../lib/migrationStatus";
import { resolveWaveId, parseDate as parseAppDate } from "../lib/wave";
import { computeWarnings, statusChangeNeedsReason, targetDatesError } from "../lib/workflow";

export const importRouter = Router();
const upload = multer({ storage: multer.memoryStorage() });

const APP_STATUSES = new Set<AppStatus>(["ACTIVE", "INACTIVE", "ARCHIVED"]);
const REPO_STATUSES = new Set<RepoStatus>([
  "NOT_STARTED",
  "MIGRATING",
  "MIGRATED",
  "VALIDATING",
  "VALIDATED",
  "ADOPTED",
  "ARCHIVED",
]);
// Older spreadsheets may still use the previous status names.
const LEGACY_REPO_STATUSES: Record<string, RepoStatus> = { IN_PROGRESS: "MIGRATING", VALIDATION: "VALIDATING" };
const TECHNOLOGIES = new Set<Technology>(["JAVA", "NODEJS", "PYTHON", "DOTNET", "GO", "OTHERS"]);
const PIPELINE_TYPES = new Set<PipelineType>([
  "DEFAULT_NODE",
  "DEFAULT_JAVA",
  "DEFAULT_PYTHON",
  "DEFAULT_DOTNET",
  "DEFAULT_GO",
  "CUSTOM",
]);

type RowResult = { created: number; updated: number; errors: { row: number; error: string }[] };

function classifySheet(name: string, headers: string[]): "applications" | "repos" | null {
  if (/application/i.test(name)) return "applications";
  if (/repo/i.test(name)) return "repos";
  if (headers.includes("repoName")) return "repos";
  if (headers.includes("appId") && headers.includes("name")) return "applications";
  return null;
}

// A blank cell means "leave as it is"; a date that can't be read is reported rather than ignored.
const optionalDate = (value: unknown) => parseAppDate(value === "" ? undefined : value);
const CLEANUP_DECISIONS = new Set<CleanupDecision>(["KEEP", "ARCHIVE"]);

async function importApplications(rows: any[], touched: Set<number>, created: Set<number>): Promise<RowResult> {
  const result: RowResult = { created: 0, updated: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const { appId, name, owner, teamContact, status, wave, targetStartDate, targetDate, proposedTargetDate, cleanupStartedAt, cleanupEndedAt } = row;
      if (!appId || !name || !owner || !teamContact) {
        throw new Error("appId, name, owner, teamContact are required");
      }
      if (status && !APP_STATUSES.has(status)) {
        throw new Error(`invalid status "${status}"`);
      }
      const waveId = await resolveWaveId(wave === "" ? undefined : wave);
      const parsedTargetStartDate = optionalDate(targetStartDate);
      const parsedTargetDate = optionalDate(targetDate);
      const parsedProposedTargetDate = optionalDate(proposedTargetDate);
      const parsedCleanupStart = optionalDate(cleanupStartedAt);
      const parsedCleanupEnd = optionalDate(cleanupEndedAt);
      const datesError = targetDatesError(parsedTargetStartDate, parsedTargetDate);
      if (datesError) throw new Error(datesError);

      const existing = await prisma.application.findUnique({ where: { appId: String(appId) } });
      if (status === "INACTIVE") {
        throw new Error("INACTIVE archives an application and its repos, so it can only be set in the portal");
      }
      if (status === "ARCHIVED" && existing?.status !== "ARCHIVED") {
        throw new Error("an application can only be archived during Cleanup, in the portal");
      }
      if (existing?.status === "ARCHIVED" && status && status !== "ARCHIVED") {
        throw new Error("an archived application can't be reactivated");
      }
      if (parsedCleanupEnd && !parsedCleanupStart && !existing?.cleanupStartedAt) {
        throw new Error("cleanupEndedAt needs cleanupStartedAt");
      }
      const application = await prisma.application.upsert({
        where: { appId: String(appId) },
        create: {
          appId: String(appId),
          name,
          owner,
          teamContact,
          status: status || undefined,
          waveId,
          targetStartDate: parsedTargetStartDate,
          targetDate: parsedTargetDate,
          proposedTargetDate: parsedProposedTargetDate,
          cleanupStartedAt: parsedCleanupStart,
          cleanupEndedAt: parsedCleanupEnd,
        },
        update: {
          name,
          owner,
          teamContact,
          status: status || undefined,
          waveId,
          targetStartDate: parsedTargetStartDate,
          targetDate: parsedTargetDate,
          proposedTargetDate: parsedProposedTargetDate,
          cleanupStartedAt: parsedCleanupStart,
          cleanupEndedAt: parsedCleanupEnd,
        },
      });
      touched.add(application.id);
      if (!existing) created.add(application.id);
      existing ? result.updated++ : result.created++;
    } catch (err) {
      result.errors.push({ row: i + 2, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return result;
}

async function importRepos(rows: any[]): Promise<RowResult & { touchedApplicationIds: Set<number> }> {
  const result: RowResult & { touchedApplicationIds: Set<number> } = {
    created: 0,
    updated: 0,
    errors: [],
    touchedApplicationIds: new Set(),
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const { appId, repoName, sourceUrl, targetProject, technology, technologyVersion, pipelineType, startedAt, completedAt, notes, reason, cleanupDecision } = row;
      const status = LEGACY_REPO_STATUSES[row.status] ?? row.status;
      if (!appId || !repoName || !sourceUrl) {
        throw new Error("appId, repoName, sourceUrl are required");
      }
      if (status && !REPO_STATUSES.has(status)) {
        throw new Error(`invalid status "${status}"`);
      }
      if (cleanupDecision && !CLEANUP_DECISIONS.has(cleanupDecision)) {
        throw new Error(`invalid cleanupDecision "${cleanupDecision}"`);
      }
      if (cleanupDecision === "ARCHIVE" && !reason) {
        throw new Error("a reason is required for cleanupDecision ARCHIVE");
      }
      if (technology && !TECHNOLOGIES.has(technology)) {
        throw new Error(`invalid technology "${technology}"`);
      }
      if (pipelineType && !PIPELINE_TYPES.has(pipelineType)) {
        throw new Error(`invalid pipelineType "${pipelineType}"`);
      }

      const application = await prisma.application.findUnique({ where: { appId: String(appId) } });
      if (!application) {
        throw new Error(`no application found with appId "${appId}"`);
      }
      if (application.status === "ARCHIVED") {
        throw new Error(`application "${appId}" is archived`);
      }
      if (cleanupDecision && (!application.cleanupStartedAt || application.cleanupEndedAt)) {
        throw new Error("cleanupDecision can only be set while Cleanup is in progress");
      }

      const existing = await prisma.repo.findUnique({
        where: { applicationId_name: { applicationId: application.id, name: String(repoName) } },
      });

      if (status && statusChangeNeedsReason(existing?.status ?? "NOT_STARTED", status) && !reason) {
        throw new Error(`a reason is required to move this repo to ${status}`);
      }
      const parsedStartedAt = optionalDate(startedAt);
      const parsedCompletedAt = optionalDate(completedAt);
      const decision = cleanupDecision ? { cleanupDecision: cleanupDecision as CleanupDecision, cleanupReason: cleanupDecision === "ARCHIVE" ? String(reason) : null } : {};

      const repo = await prisma.repo.upsert({
        where: { applicationId_name: { applicationId: application.id, name: String(repoName) } },
        create: {
          applicationId: application.id,
          name: String(repoName),
          sourceUrl,
          targetProject: targetProject || undefined,
          technology: technology || undefined,
          technologyVersion: technologyVersion || undefined,
          pipelineType: pipelineType || undefined,
          status: status || undefined,
          startedAt: parsedStartedAt,
          completedAt: parsedCompletedAt,
          notes: notes || undefined,
          ...decision,
        },
        update: {
          sourceUrl,
          targetProject: targetProject || undefined,
          technology: technology || undefined,
          technologyVersion: technologyVersion || undefined,
          pipelineType: pipelineType || undefined,
          status: status || undefined,
          startedAt: parsedStartedAt,
          completedAt: parsedCompletedAt,
          notes: notes || undefined,
          ...decision,
        },
      });

      if (!existing || existing.status !== repo.status) {
        await prisma.statusHistory.create({ data: { repoId: repo.id, status: repo.status, note: reason || null } });
      }

      result.touchedApplicationIds.add(application.id);
      existing ? result.updated++ : result.created++;
    } catch (err) {
      result.errors.push({ row: i + 2, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return result;
}

importRouter.post("/", upload.array("files", 10), async (req, res) => {
  const files = (req.files as Express.Multer.File[]) || [];
  if (files.length === 0) return res.status(400).json({ error: "at least one file is required" });

  const summary = {
    applications: { created: 0, updated: 0, errors: [] as { row: number; error: string }[] },
    repos: { created: 0, updated: 0, errors: [] as { row: number; error: string }[] },
    warnings: [] as { appId: string; warning: string }[],
  };
  const touchedApplicationIds = new Set<number>();
  const createdApplicationIds = new Set<number>();

  const repoSheets: any[][] = [];

  for (const file of files) {
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(file.buffer, { type: "buffer" });
    } catch {
      return res.status(400).json({ error: `"${file.originalname}" could not be read as a CSV or Excel file` });
    }
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      // raw: false returns formatted display strings for every cell (e.g. "2027-03-01" instead of
      // an Excel serial date number), so our own date parsing always sees a plain string.
      const rows = XLSX.utils.sheet_to_json<any>(sheet, { defval: "", raw: false });
      if (rows.length === 0) continue;
      const headers = Object.keys(rows[0]);
      const kind = classifySheet(sheetName, headers);

      if (kind === "applications") {
        const result = await importApplications(rows, touchedApplicationIds, createdApplicationIds);
        summary.applications.created += result.created;
        summary.applications.updated += result.updated;
        summary.applications.errors.push(...result.errors);
      } else if (kind === "repos") {
        repoSheets.push(rows);
      }
    }
  }

  // Applications are fully committed before repos are processed, so repo rows can resolve appId.
  for (const rows of repoSheets) {
    const result = await importRepos(rows);
    summary.repos.created += result.created;
    summary.repos.updated += result.updated;
    summary.repos.errors.push(...result.errors);
    result.touchedApplicationIds.forEach((id) => touchedApplicationIds.add(id));
  }

  // A brand-new application is being set up, not changing state, so it sends no email.
  for (const applicationId of touchedApplicationIds) {
    await recomputeMigrationStatus(applicationId, { silent: createdApplicationIds.has(applicationId) });
    const application = await prisma.application.findUniqueOrThrow({ where: { id: applicationId }, include: { repos: true, wave: true } });
    for (const warning of computeWarnings(application, application.repos)) {
      summary.warnings.push({ appId: application.appId, warning });
    }
  }

  res.json(summary);
});
