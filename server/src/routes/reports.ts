import { Router } from "express";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { prisma } from "../lib/prisma";
import { applicationProgressPercent } from "../lib/progress";
import { computeHealth } from "../lib/health";
import { weeklyProgress } from "../lib/progressTimeline";

export const reportsRouter = Router();

reportsRouter.get("/summary", async (_req, res) => {
  const [byRepoStatus, byAppMigrationStatus, byAppStatus, applications, archivedRepos] = await Promise.all([
    prisma.repo.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.application.groupBy({ by: ["migrationStatus"], where: { status: { not: "ARCHIVED" } }, _count: { _all: true } }),
    prisma.application.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.application.findMany({
      select: {
        id: true,
        appId: true,
        name: true,
        status: true,
        migrationStatus: true,
        targetStartDate: true,
        targetDate: true,
        cleanupStartedAt: true,
        wave: { select: { number: true } },
        repos: { select: { status: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.repo.count({ where: { status: "ARCHIVED" } }),
  ]);

  const activeApplications = applications.filter((app) => app.status !== "ARCHIVED");
  const perApplication = activeApplications.map((app) => {
    const repoCounts: Record<string, number> = {};
    for (const repo of app.repos) {
      repoCounts[repo.status] = (repoCounts[repo.status] ?? 0) + 1;
    }
    const progressPercent = applicationProgressPercent(app.repos);
    return {
      appId: app.appId,
      name: app.name,
      wave: app.wave.number,
      migrationStatus: app.migrationStatus,
      repoCount: app.repos.filter((r) => r.status !== "ARCHIVED").length,
      repoCounts,
      progressPercent,
      health: computeHealth({
        complete: app.migrationStatus === "COMPLETE",
        progressPercent,
        targetStartDate: app.targetStartDate,
        targetDate: app.targetDate,
        cleanupStarted: !!app.cleanupStartedAt,
      }),
    };
  });

  res.json({
    byRepoStatus: byRepoStatus.map((r) => ({ status: r.status, count: r._count._all })),
    byAppMigrationStatus: byAppMigrationStatus.map((r) => ({ migrationStatus: r.migrationStatus, count: r._count._all })),
    byAppStatus: byAppStatus.map((r) => ({ status: r.status, count: r._count._all })),
    perApplication,
    archived: { applications: applications.length - activeApplications.length, repos: archivedRepos },
  });
});

reportsRouter.get("/weekly-progress", async (_req, res) => {
  const applications = await prisma.application.findMany({
    select: {
      status: true,
      migrationStatus: true,
      createdAt: true,
      updatedAt: true,
      cleanupStartedAt: true,
      adoptionEndedAt: true,
      archivedAt: true,
      repos: {
        select: {
          status: true,
          statusHistory: { select: { status: true, changedAt: true }, orderBy: { changedAt: "asc" } },
        },
      },
    },
  });

  const repos = applications.flatMap((app) => app.repos.map((repo) => ({ status: repo.status, history: repo.statusHistory })));
  const apps = applications.map(({ repos: appRepos, ...app }) => {
    const firsts = appRepos.flatMap((repo) => repo.statusHistory.slice(0, 1).map((h) => h.changedAt.getTime()));
    return { ...app, firstRepoActivity: firsts.length ? new Date(Math.min(...firsts)) : null };
  });
  res.json(weeklyProgress(apps, repos, new Date()));
});

reportsRouter.get("/issues", async (_req, res) => {
  const applications = await prisma.application.findMany({
    select: {
      appId: true,
      name: true,
      repos: { select: { issues: { select: { isResolved: true } } } },
    },
    orderBy: { name: "asc" },
  });

  const report = applications.map((app) => {
    let open = 0;
    let resolved = 0;
    for (const repo of app.repos) {
      for (const issue of repo.issues) {
        issue.isResolved ? resolved++ : open++;
      }
    }
    return { appId: app.appId, name: app.name, open, resolved };
  });

  res.json(report);
});

reportsRouter.get("/emails", async (_req, res) => {
  const grouped = await prisma.emailLog.groupBy({
    by: ["event", "status"],
    _count: { _all: true },
  });
  res.json(grouped.map((g) => ({ event: g.event, status: g.status, count: g._count._all })));
});

reportsRouter.get("/export", async (req, res) => {
  const { format, status, migrationStatus, wave, search } = req.query as Record<string, string | undefined>;

  const applications = await prisma.application.findMany({
    where: {
      status: status ? (status as any) : undefined,
      migrationStatus: migrationStatus ? (migrationStatus as any) : undefined,
      wave: wave ? { number: Number(wave) } : undefined,
      ...(search
        ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { appId: { contains: search, mode: "insensitive" } }] }
        : {}),
    },
    include: { repos: true, wave: true },
    orderBy: { name: "asc" },
  });

  if (format === "pdf") {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=migration-report.pdf");
    const doc = new PDFDocument({ margin: 40 });
    doc.pipe(res);
    doc.fontSize(16).text("Harness Migration Report", { underline: true });
    doc.moveDown();

    for (const app of applications) {
      doc.fontSize(13).text(`${app.name} (${app.appId}) — ${app.migrationStatus} — Wave ${app.wave.number}`);
      doc.fontSize(10).text(`Owner: ${app.owner}  Team contact: ${app.teamContact}  App status: ${app.status}`);
      doc.moveDown(0.3);
      for (const repo of app.repos) {
        doc.fontSize(10).text(`  - ${repo.name}: ${repo.status} (source: ${repo.sourceUrl})`);
      }
      doc.moveDown();
    }

    doc.end();
    return;
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Migration Report");
  sheet.columns = [
    { header: "App ID", key: "appId", width: 16 },
    { header: "Application", key: "appName", width: 24 },
    { header: "Owner", key: "owner", width: 18 },
    { header: "Team Contact", key: "teamContact", width: 24 },
    { header: "App Status", key: "appStatus", width: 12 },
    { header: "Wave", key: "wave", width: 8 },
    { header: "Target Start", key: "targetStartDate", width: 14 },
    { header: "Target End", key: "targetDate", width: 14 },
    { header: "Phase", key: "migrationStatus", width: 16 },
    { header: "Repo", key: "repoName", width: 24 },
    { header: "Repo Status", key: "repoStatus", width: 14 },
    { header: "Source URL", key: "sourceUrl", width: 32 },
    { header: "Started At", key: "startedAt", width: 16 },
    { header: "Completed At", key: "completedAt", width: 16 },
  ];

  for (const app of applications) {
    const base = {
      appId: app.appId,
      appName: app.name,
      owner: app.owner,
      teamContact: app.teamContact,
      appStatus: app.status,
      wave: app.wave.number,
      targetStartDate: app.targetStartDate?.toISOString().slice(0, 10) ?? "",
      targetDate: app.targetDate?.toISOString().slice(0, 10) ?? "",
      migrationStatus: app.migrationStatus,
    };
    if (app.repos.length === 0) {
      sheet.addRow(base);
      continue;
    }
    for (const repo of app.repos) {
      sheet.addRow({
        ...base,
        repoName: repo.name,
        repoStatus: repo.status,
        sourceUrl: repo.sourceUrl,
        startedAt: repo.startedAt?.toISOString().slice(0, 10) ?? "",
        completedAt: repo.completedAt?.toISOString().slice(0, 10) ?? "",
      });
    }
  }

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", "attachment; filename=migration-report.xlsx");
  await workbook.xlsx.write(res);
  res.end();
});
