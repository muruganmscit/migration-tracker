import { Router } from "express";
import { CleanupDecision, PipelineType, RepoStatus, Technology } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { recomputeMigrationStatus } from "../lib/migrationStatus";
import { statusChangeNeedsReason } from "../lib/workflow";

export const reposRouter = Router();

const REPO_STATUSES = Object.values(RepoStatus);

// A repo's own dates when its status changes.
function statusDates(existing: { startedAt: Date | null }, status: RepoStatus) {
  return {
    startedAt: status !== "NOT_STARTED" && !existing.startedAt ? new Date() : undefined,
    completedAt: status === "ADOPTED" || status === "ARCHIVED" ? new Date() : null,
  };
}

// Sets one status on many repos. Each stands alone, so one refusal doesn't stop the rest. Applications
// are recomputed once at the end, so a batch sends at most one email per application.
reposRouter.post("/bulk-status", async (req, res) => {
  const { ids, status, reason } = req.body as { ids?: unknown; status?: RepoStatus; reason?: string };
  if (!status || !REPO_STATUSES.includes(status)) return res.status(400).json({ error: "A valid status is required" });
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 200 || !ids.every(Number.isInteger)) {
    return res.status(400).json({ error: "ids must list between 1 and 200 repos" });
  }

  const results: { id: number; outcome: "updated" | "unchanged" | "failed"; error?: string }[] = [];
  const touched = new Set<number>();
  for (const id of new Set(ids as number[])) {
    const existing = await prisma.repo.findUnique({ where: { id }, include: { application: { select: { status: true } } } });
    if (!existing) {
      results.push({ id, outcome: "failed", error: "Repo not found" });
    } else if (existing.application.status === "ARCHIVED") {
      results.push({ id, outcome: "failed", error: "This application is archived" });
    } else if (existing.status === status) {
      results.push({ id, outcome: "unchanged" });
    } else if (statusChangeNeedsReason(existing.status, status) && !reason?.trim()) {
      results.push({ id, outcome: "failed", error: "A reason is required for this status change" });
    } else {
      await prisma.repo.update({ where: { id }, data: { status, ...statusDates(existing, status) } });
      await prisma.statusHistory.create({ data: { repoId: id, status, note: reason?.trim() || null } });
      touched.add(existing.applicationId);
      results.push({ id, outcome: "updated" });
    }
  }
  for (const applicationId of touched) await recomputeMigrationStatus(applicationId);
  res.json({ results });
});

reposRouter.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const repo = await prisma.repo.findUnique({
    where: { id },
    include: { statusHistory: { orderBy: { changedAt: "desc" } }, issues: true },
  });
  if (!repo) return res.status(404).json({ error: "Repo not found" });
  res.json(repo);
});

reposRouter.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { name, sourceUrl, targetProject, technology, technologyVersion, pipelineType, notes, status, statusReason } = req.body as {
    name?: string;
    sourceUrl?: string;
    targetProject?: string;
    technology?: Technology;
    technologyVersion?: string;
    pipelineType?: PipelineType;
    notes?: string;
    status?: RepoStatus;
    statusReason?: string;
  };

  if (sourceUrl !== undefined && !sourceUrl.trim()) {
    return res.status(400).json({ error: "sourceUrl cannot be empty" });
  }

  const existing = await prisma.repo.findUnique({ where: { id }, include: { application: { select: { status: true } } } });
  if (!existing) return res.status(404).json({ error: "Repo not found" });
  const statusChanged = status !== undefined && status !== existing.status;
  if (statusChanged) {
    if (existing.application.status === "ARCHIVED") return res.status(400).json({ error: "This application is archived" });
    if (statusChangeNeedsReason(existing.status, status!) && !statusReason?.trim()) {
      return res.status(400).json({ error: "A reason is required for this status change" });
    }
  }

  const repo = await prisma.repo.update({
    where: { id },
    data: {
      name,
      sourceUrl,
      targetProject,
      technology,
      technologyVersion,
      pipelineType,
      notes,
      status,
      ...(statusChanged ? statusDates(existing, status!) : {}),
    },
  });

  if (statusChanged) {
    await prisma.statusHistory.create({ data: { repoId: id, status: repo.status, note: statusReason?.trim() || null } });
    await recomputeMigrationStatus(repo.applicationId);
  }

  res.json(repo);
});

// A Cleanup decision. Archive decisions take effect when Cleanup ends, so they can be revised until then.
reposRouter.patch("/:id/cleanup-decision", async (req, res) => {
  const id = Number(req.params.id);
  const { decision, reason } = req.body as { decision?: CleanupDecision | null; reason?: string };
  if (decision !== null && decision !== "KEEP" && decision !== "ARCHIVE") return res.status(400).json({ error: "decision must be KEEP or ARCHIVE" });
  if (decision === "ARCHIVE" && !reason?.trim()) return res.status(400).json({ error: "A reason is required to archive a repo" });

  const existing = await prisma.repo.findUnique({ where: { id }, include: { application: true } });
  if (!existing) return res.status(404).json({ error: "Repo not found" });
  const { cleanupStartedAt, cleanupEndedAt, status } = existing.application;
  if (status === "ARCHIVED" || !cleanupStartedAt || cleanupEndedAt) return res.status(400).json({ error: "Decisions can only be made during Cleanup" });

  const repo = await prisma.repo.update({
    where: { id },
    data: { cleanupDecision: decision, cleanupReason: decision === "ARCHIVE" ? reason!.trim() : null },
  });
  res.json(repo);
});

reposRouter.post("/:id/issues", async (req, res) => {
  const repoId = Number(req.params.id);
  const { title, description } = req.body;
  if (!title) return res.status(400).json({ error: "title is required" });
  const issue = await prisma.issue.create({ data: { repoId, title, description } });
  res.status(201).json(issue);
});

reposRouter.patch("/:id/issues/:issueId", async (req, res) => {
  const issueId = Number(req.params.issueId);
  const { isResolved, title, description } = req.body;
  const issue = await prisma.issue.update({
    where: { id: issueId },
    data: {
      title,
      description,
      isResolved,
      resolvedAt: isResolved ? new Date() : isResolved === false ? null : undefined,
    },
  });
  res.json(issue);
});
