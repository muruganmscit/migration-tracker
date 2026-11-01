// Applies the workflow rules (workflow.ts) to stored applications and sends the resulting emails.
import { MigrationStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { sendEventEmail } from "./emailTemplates";
import { canArchive, catchUpNotice, inactiveBlocker, cleanupBlocker, noticePhase, planTransition } from "./workflow";

/** A rule of the workflow was not met; the message is safe to show to the user. */
export class WorkflowError extends Error {}

async function loadApp(applicationId: number) {
  const app = await prisma.application.findUnique({ where: { id: applicationId }, include: { repos: true } });
  if (!app) throw new WorkflowError("Application not found");
  return app;
}

export async function recomputeMigrationStatus(applicationId: number, options: { silent?: boolean } = {}) {
  const app = await loadApp(applicationId);
  if (app.status === "ARCHIVED") return;

  const previousStage = app.migrationStatus;
  const plan = planTransition(app, app.repos, new Date());
  await prisma.application.update({ where: { id: applicationId }, data: { migrationStatus: plan.phase, ...plan.dates } });

  if (plan.event && !options.silent) {
    await sendEventEmail(applicationId, plan.event, "AUTO", { stage: noticePhase(plan.event), previousStage });
  }
}

export async function startCleanup(applicationId: number) {
  const app = await loadApp(applicationId);
  if (app.status === "ARCHIVED") throw new WorkflowError("This application is archived");
  if (app.cleanupStartedAt) throw new WorkflowError("Cleanup has already started");
  await prisma.application.update({ where: { id: applicationId }, data: { cleanupStartedAt: new Date() } });
  await recomputeMigrationStatus(applicationId, { silent: true });
  await sendEventEmail(applicationId, "CLEANUP_STARTED", "AUTO", { stage: "CLEANUP", previousStage: app.migrationStatus });
}

export async function endCleanup(applicationId: number) {
  const app = await loadApp(applicationId);
  if (app.status === "ARCHIVED") throw new WorkflowError("This application is archived");
  if (!app.cleanupStartedAt) throw new WorkflowError("Cleanup has not started");
  if (app.cleanupEndedAt) throw new WorkflowError("Cleanup has already ended");
  const blocker = cleanupBlocker(app.repos);
  if (blocker) throw new WorkflowError(blocker);

  const now = new Date();
  for (const repo of app.repos) {
    if (repo.cleanupDecision === "ARCHIVE" && repo.status !== "ARCHIVED") {
      await archiveRepo(repo.id, repo.cleanupReason ?? "Cleanup decision", now);
    }
  }
  await prisma.application.update({ where: { id: applicationId }, data: { cleanupEndedAt: now } });
  await recomputeMigrationStatus(applicationId, { silent: true });

  const updated = await loadApp(applicationId);
  const notice = updated.migrationStatusManualOverride ? null : catchUpNotice(updated);
  if (notice) await sendEventEmail(applicationId, notice, "AUTO", { stage: noticePhase(notice), previousStage: "CLEANUP" });
}

async function archiveRepo(repoId: number, reason: string, now: Date) {
  await prisma.repo.update({ where: { id: repoId }, data: { status: "ARCHIVED", completedAt: now } });
  await prisma.statusHistory.create({ data: { repoId, status: "ARCHIVED", note: reason, changedAt: now } });
}

async function archiveWithRepos(app: Awaited<ReturnType<typeof loadApp>>, reason: string) {
  const now = new Date();
  for (const repo of app.repos) {
    if (repo.status !== "ARCHIVED") await archiveRepo(repo.id, reason, now);
  }
  await prisma.application.update({ where: { id: app.id }, data: { status: "ARCHIVED", archivedAt: now, archiveReason: reason } });
  await sendEventEmail(app.id, "APPLICATION_ARCHIVED", "AUTO", { stage: app.migrationStatus, previousStage: app.migrationStatus, reason });
}

// See canArchive for when this is allowed.
export async function archiveApplication(applicationId: number, reason: string) {
  if (!reason?.trim()) throw new WorkflowError("A reason is required to archive an application");
  const app = await loadApp(applicationId);
  if (app.status === "ARCHIVED") throw new WorkflowError("This application is already archived");
  if (!canArchive(app, app.repos)) throw new WorkflowError("An application with repos can only be archived during Cleanup");
  await archiveWithRepos(app, reason.trim());
}

export async function markInactive(applicationId: number, reason: string) {
  if (!reason?.trim()) throw new WorkflowError("A reason is required to mark an application inactive");
  const app = await loadApp(applicationId);
  const blocker = inactiveBlocker(app);
  if (blocker) throw new WorkflowError(blocker);
  await archiveWithRepos(app, reason.trim());
}

export async function setManualMigrationStatus(applicationId: number, stage: MigrationStatus, reason: string) {
  if (!reason?.trim()) throw new WorkflowError("A reason is required to override the phase");
  const app = await loadApp(applicationId);
  if (app.status === "ARCHIVED") throw new WorkflowError("This application is archived");
  await prisma.application.update({
    where: { id: applicationId },
    data: { migrationStatus: stage, migrationStatusManualOverride: true, overrideReason: reason.trim() },
  });
  await sendEventEmail(applicationId, "PHASE_OVERRIDDEN", "MANUAL", { stage, previousStage: app.migrationStatus, reason: reason.trim() });
}

export async function resetToAuto(applicationId: number) {
  await prisma.application.update({ where: { id: applicationId }, data: { migrationStatusManualOverride: false, overrideReason: null } });
  await recomputeMigrationStatus(applicationId);
}
