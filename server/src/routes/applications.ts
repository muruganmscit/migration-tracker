import { Router } from "express";
import { MigrationStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { Request, Response } from "express";
import { setManualMigrationStatus, resetToAuto, startCleanup, endCleanup, archiveApplication, markInactive, recomputeMigrationStatus, WorkflowError } from "../lib/migrationStatus";
import { currentEvent, sendEventEmail } from "../lib/emailTemplates";
import { resolveWaveId, parseDate } from "../lib/wave";
import { applicationProgressPercent } from "../lib/progress";
import { computeHealth } from "../lib/health";
import { activeRepos, canArchive, computeWarnings, targetDatesError } from "../lib/workflow";

export const applicationsRouter = Router();

function withComputed<
  T extends {
    repos: { status: any }[];
    status: string;
    migrationStatus: MigrationStatus;
    targetStartDate: Date | null;
    targetDate: Date | null;
    cleanupStartedAt: Date | null;
    cleanupEndedAt: Date | null;
    wave?: { targetStartDate: Date | null; targetDate: Date | null };
  },
>(app: T) {
  const progressPercent = applicationProgressPercent(app.repos);
  return {
    ...app,
    repoCount: activeRepos(app.repos).length,
    archivedRepoCount: app.repos.length - activeRepos(app.repos).length,
    progressPercent,
    warnings: computeWarnings(app, app.repos),
    canArchive: canArchive(app, app.repos),
    health: computeHealth({
      archived: app.status === "ARCHIVED",
      complete: app.migrationStatus === "COMPLETE",
      progressPercent,
      targetStartDate: app.targetStartDate,
      targetDate: app.targetDate,
      cleanupStarted: !!app.cleanupStartedAt,
    }),
  };
}

// Runs a workflow action, reporting broken rules as a 400 with a readable message.
function action(run: (id: number, req: Request) => Promise<void>) {
  return async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    try {
      await run(id, req);
      const application = await prisma.application.findUnique({ where: { id } });
      res.json(application);
    } catch (err) {
      if (err instanceof WorkflowError) return res.status(400).json({ error: err.message });
      console.error(err);
      res.status(500).json({ error: "Something went wrong" });
    }
  };
}

applicationsRouter.get("/", async (req, res) => {
  const { status, migrationStatus, wave, search, page, pageSize } = req.query as Record<string, string | undefined>;

  const where = {
    // Archived applications have no current phase, so a phase filter leaves them out.
    status: status ? (status as any) : migrationStatus ? { not: "ARCHIVED" as const } : undefined,
    migrationStatus: migrationStatus ? (migrationStatus as any) : undefined,
    wave: wave ? { number: Number(wave) } : undefined,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { appId: { contains: search, mode: "insensitive" as const } },
            { owner: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const pageNum = Math.max(1, Number(page) || 1);
  const pageSizeNum = Math.min(100, Math.max(1, Number(pageSize) || 20));

  const [applications, total] = await Promise.all([
    prisma.application.findMany({
      where,
      include: { repos: { select: { id: true, status: true } }, wave: true },
      orderBy: { name: "asc" },
      skip: (pageNum - 1) * pageSizeNum,
      take: pageSizeNum,
    }),
    prisma.application.count({ where }),
  ]);

  res.json({
    data: applications.map((app) => ({ ...withComputed(app), repos: undefined })),
    total,
    page: pageNum,
    pageSize: pageSizeNum,
  });
});

applicationsRouter.post("/", async (req, res) => {
  const { appId, name, owner, teamContact, status, wave, targetStartDate, targetDate, proposedTargetDate } = req.body;
  if (status && status !== "ACTIVE") return res.status(400).json({ error: "A new application starts as Active" });
  if (!appId || !name || !owner || !teamContact) {
    return res.status(400).json({ error: "appId, name, owner, teamContact, wave are required" });
  }
  try {
    const parsedStart = parseDate(targetStartDate);
    const parsedEnd = parseDate(targetDate);
    const datesError = targetDatesError(parsedStart, parsedEnd);
    if (datesError) return res.status(400).json({ error: datesError });
    if (await prisma.application.findUnique({ where: { appId } })) {
      return res.status(400).json({ error: `An application with App ID "${appId}" already exists` });
    }
    const waveId = await resolveWaveId(wave);
    if (waveId === undefined) return res.status(400).json({ error: "wave is required" });
    const application = await prisma.application.create({
      data: {
        appId,
        name,
        owner,
        teamContact,
        status: status || undefined,
        waveId,
        targetStartDate: parsedStart,
        targetDate: parsedEnd,
        proposedTargetDate: parseDate(proposedTargetDate),
      },
    });
    res.status(201).json(application);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

applicationsRouter.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const application = await prisma.application.findUnique({
    where: { id },
    include: {
      repos: { select: { status: true } },
      recipients: true,
      emailLogs: { orderBy: { sentAt: "desc" } },
      wave: true,
    },
  });
  if (!application) return res.status(404).json({ error: "Application not found" });
  res.json({ ...withComputed(application), repos: undefined });
});

applicationsRouter.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { name, owner, teamContact, status, wave, targetStartDate, targetDate, proposedTargetDate } = req.body;
  try {
    if (status !== undefined) {
      const existing = await prisma.application.findUniqueOrThrow({ where: { id } });
      if (status === "ARCHIVED" && existing.status !== "ARCHIVED") throw new WorkflowError("An application can only be archived during Cleanup");
      if (status === "INACTIVE") throw new WorkflowError("Use mark-inactive, which archives the application and its repos");
      if (existing.status === "ARCHIVED" && status !== "ARCHIVED") throw new WorkflowError("An archived application can't be reactivated");
    }
    const waveId = await resolveWaveId(wave);
    const application = await prisma.application.update({
      where: { id },
      data: {
        name,
        owner,
        teamContact,
        status,
        waveId,
        targetStartDate: parseDate(targetStartDate),
        targetDate: parseDate(targetDate),
        proposedTargetDate: parseDate(proposedTargetDate),
      },
    });
    res.json(application);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Applies one action to many applications. Each stands alone, so one refusal doesn't stop the rest.
applicationsRouter.post("/bulk", async (req, res) => {
  const { action: bulkAction, ids, reason } = req.body as { action?: string; ids?: unknown; reason?: string };
  if (bulkAction !== "startCleanup" && bulkAction !== "archive") return res.status(400).json({ error: "action must be startCleanup or archive" });
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 200 || !ids.every(Number.isInteger)) {
    return res.status(400).json({ error: "ids must list between 1 and 200 applications" });
  }
  if (bulkAction === "archive" && !reason?.trim()) return res.status(400).json({ error: "A reason is required to archive an application" });

  const results: { id: number; ok: boolean; error?: string }[] = [];
  for (const id of new Set(ids as number[])) {
    try {
      if (bulkAction === "startCleanup") await startCleanup(id);
      else await archiveApplication(id, reason!);
      results.push({ id, ok: true });
    } catch (err) {
      if (!(err instanceof WorkflowError)) console.error(err);
      results.push({ id, ok: false, error: err instanceof WorkflowError ? err.message : "Something went wrong" });
    }
  }
  res.json({ results });
});

applicationsRouter.post("/:id/cleanup/start", action((id) => startCleanup(id)));
applicationsRouter.post("/:id/cleanup/end", action((id) => endCleanup(id)));
applicationsRouter.post("/:id/mark-inactive", action((id, req) => markInactive(id, req.body?.reason)));
applicationsRouter.post("/:id/archive", action((id, req) => archiveApplication(id, req.body?.reason)));

applicationsRouter.patch(
  "/:id/migration-status",
  action(async (id, req) => {
    const { stage, reason } = req.body as { stage?: MigrationStatus; reason: string };
    if (!stage || !Object.values(MigrationStatus).includes(stage)) throw new WorkflowError("A valid phase is required");
    await setManualMigrationStatus(id, stage, reason);
  })
);
applicationsRouter.post("/:id/migration-status/reset-auto", action((id) => resetToAuto(id)));

applicationsRouter.post(
  "/:id/send-email",
  action(async (id) => {
    const application = await prisma.application.findUnique({ where: { id } });
    if (!application) throw new WorkflowError("Application not found");
    const event = currentEvent(application);
    if (!event) throw new WorkflowError("There is no notice for this phase. The final notice goes out when the application completes");
    await sendEventEmail(id, event, "MANUAL", { stage: application.migrationStatus });
  })
);

applicationsRouter.get("/:id/recipients", async (req, res) => {
  const applicationId = Number(req.params.id);
  const recipients = await prisma.recipient.findMany({ where: { applicationId } });
  res.json(recipients);
});

applicationsRouter.post("/:id/recipients", async (req, res) => {
  const applicationId = Number(req.params.id);
  const { email, name } = req.body;
  if (!email) return res.status(400).json({ error: "email is required" });
  const recipient = await prisma.recipient.create({ data: { applicationId, email, name } });
  res.status(201).json(recipient);
});

applicationsRouter.delete("/:id/recipients/:recipientId", async (req, res) => {
  const recipientId = Number(req.params.recipientId);
  await prisma.recipient.delete({ where: { id: recipientId } });
  res.status(204).end();
});

applicationsRouter.get("/:id/email-logs", async (req, res) => {
  const applicationId = Number(req.params.id);
  const logs = await prisma.emailLog.findMany({
    where: { applicationId },
    orderBy: { sentAt: "desc" },
  });
  res.json(logs);
});

applicationsRouter.get("/:id/repos", async (req, res) => {
  const applicationId = Number(req.params.id);
  const { page, pageSize, status, technology, pipelineType, search } = req.query as Record<string, string | undefined>;
  const pageNum = Math.max(1, Number(page) || 1);
  const pageSizeNum = Math.min(100, Math.max(1, Number(pageSize) || 20));

  const where = {
    applicationId,
    status: status ? (status as any) : undefined,
    technology: technology ? (technology as any) : undefined,
    pipelineType: pipelineType ? (pipelineType as any) : undefined,
    ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
  };

  const [repos, total] = await Promise.all([
    prisma.repo.findMany({
      where,
      include: { issues: true },
      orderBy: { name: "asc" },
      skip: (pageNum - 1) * pageSizeNum,
      take: pageSizeNum,
    }),
    prisma.repo.count({ where }),
  ]);
  res.json({ data: repos, total, page: pageNum, pageSize: pageSizeNum });
});

applicationsRouter.post("/:id/repos", async (req, res) => {
  const applicationId = Number(req.params.id);
  const { name, sourceUrl, targetProject, technology, technologyVersion, pipelineType, notes } = req.body;
  if (!name || !sourceUrl) {
    return res.status(400).json({ error: "name and sourceUrl are required" });
  }
  const application = await prisma.application.findUnique({ where: { id: applicationId } });
  if (!application) return res.status(404).json({ error: "Application not found" });
  if (application.status === "ARCHIVED") return res.status(400).json({ error: "This application is archived" });
  if (await prisma.repo.findUnique({ where: { applicationId_name: { applicationId, name } } })) {
    return res.status(400).json({ error: `A repo named "${name}" already exists in this application` });
  }
  const repo = await prisma.repo.create({
    data: { applicationId, name, sourceUrl, targetProject, technology, technologyVersion, pipelineType, notes },
  });
  await prisma.statusHistory.create({
    data: { repoId: repo.id, status: repo.status },
  });
  // A new repo that is behind a finished phase reopens it.
  await recomputeMigrationStatus(applicationId);
  res.status(201).json(repo);
});
