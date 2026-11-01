import { Router } from "express";
import { prisma } from "../lib/prisma";
import { applicationProgressPercent } from "../lib/progress";
import { computeHealth } from "../lib/health";

export const wavesRouter = Router();

wavesRouter.get("/", async (_req, res) => {
  const waves = await prisma.wave.findMany({
    orderBy: { number: "asc" },
    include: { applications: { include: { repos: { select: { status: true } } } } },
  });

  res.json(
    waves.map((wave) => {
      const active = wave.applications.filter((app) => app.status !== "ARCHIVED");
      const appProgress = active.map((app) => applicationProgressPercent(app.repos));
      const avgProgressPercent = appProgress.length
        ? Math.round(appProgress.reduce((sum, p) => sum + p, 0) / appProgress.length)
        : 0;

      return {
        id: wave.id,
        number: wave.number,
        targetStartDate: wave.targetStartDate,
        targetDate: wave.targetDate,
        proposedTargetDate: wave.proposedTargetDate,
        applicationCount: active.length,
        archivedApplicationCount: wave.applications.length - active.length,
        avgProgressPercent,
        health: computeHealth({
          complete: active.length > 0 && active.every((app) => app.migrationStatus === "COMPLETE"),
          progressPercent: avgProgressPercent,
          targetStartDate: wave.targetStartDate,
          targetDate: wave.targetDate,
          cleanupStarted: active.some((app) => !!app.cleanupStartedAt),
        }),
      };
    })
  );
});

wavesRouter.patch("/:number", async (req, res) => {
  const number = Number(req.params.number);
  const { targetStartDate, targetDate, proposedTargetDate } = req.body as {
    targetStartDate?: string | null;
    targetDate?: string | null;
    proposedTargetDate?: string | null;
  };

  const wave = await prisma.wave.update({
    where: { number },
    data: {
      targetStartDate: targetStartDate === undefined ? undefined : targetStartDate ? new Date(targetStartDate) : null,
      targetDate: targetDate === undefined ? undefined : targetDate ? new Date(targetDate) : null,
      proposedTargetDate: proposedTargetDate === undefined ? undefined : proposedTargetDate ? new Date(proposedTargetDate) : null,
    },
  });
  res.json(wave);
});
