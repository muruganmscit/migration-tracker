// Rebuilds weekly progress from recorded history. Each point is the position at the end of that week,
// and the latest point uses current data, so it always matches the Dashboard cards.
type RepoInput = { status: string; history: { status: string; changedAt: Date }[] };
type AppInput = {
  status: string;
  migrationStatus: string;
  createdAt: Date;
  updatedAt: Date;
  cleanupStartedAt: Date | null;
  adoptionEndedAt: Date | null;
  archivedAt: Date | null;
  firstRepoActivity: Date | null;
};

export interface WeekPoint {
  week: string;
  applicationsDone: number;
  applicationsTotal: number;
  applicationsPercent: number;
  pipelinesMigrated: number;
  pipelinesMigratedPercent: number;
  pipelinesDone: number;
  pipelinesTotal: number;
  pipelinesPercent: number;
}

// Migrated or beyond, so adopted pipelines also count as migrated.
const MIGRATED_OR_BEYOND = new Set(["MIGRATED", "VALIDATING", "VALIDATED", "ADOPTED"]);

const DAY = 24 * 60 * 60 * 1000;
const percent = (done: number, total: number) => (total ? Math.round((done / total) * 100) : 0);

function mondayOf(date: Date): Date {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  return new Date(day.getTime() - ((day.getUTCDay() + 6) % 7) * DAY);
}

// An application can be dated before it was created when its history was imported.
function appStart(app: AppInput): Date {
  const dates = [app.createdAt, app.cleanupStartedAt, app.firstRepoActivity].filter(Boolean) as Date[];
  return new Date(Math.min(...dates.map((d) => d.getTime())));
}

// Only currently Complete applications count. An override to Complete records no date, so its
// last update stands in.
const completedAt = (app: AppInput) => (app.migrationStatus === "COMPLETE" ? (app.adoptionEndedAt ?? app.updatedAt) : null);

export function weeklyProgress(apps: AppInput[], repos: RepoInput[], now: Date): WeekPoint[] {
  const starts = [...apps.map(appStart), ...repos.flatMap((r) => r.history.map((h) => h.changedAt))];
  if (starts.length === 0) return [];

  const firstWeek = mondayOf(new Date(Math.min(...starts.map((d) => d.getTime()))));
  const thisWeek = mondayOf(now);
  const points: WeekPoint[] = [];

  for (let monday = firstWeek; monday <= thisWeek; monday = new Date(monday.getTime() + 7 * DAY)) {
    const isCurrent = monday.getTime() === thisWeek.getTime();
    const end = isCurrent ? now : new Date(monday.getTime() + 7 * DAY - 1);

    const activeApps = apps.filter((a) => appStart(a) <= end && !(a.status === "ARCHIVED" && a.archivedAt && a.archivedAt <= end));
    const applicationsDone = activeApps.filter((a) => {
      const done = completedAt(a);
      return done && done <= end;
    }).length;

    let pipelinesTotal = 0;
    let pipelinesDone = 0;
    let pipelinesMigrated = 0;
    for (const repo of repos) {
      let status: string | null = isCurrent ? repo.status : null;
      if (!isCurrent) {
        for (const h of repo.history) {
          if (h.changedAt <= end) status = h.status; // history is oldest first
        }
      }
      if (!status || status === "ARCHIVED") continue;
      pipelinesTotal++;
      if (status === "ADOPTED") pipelinesDone++;
      if (MIGRATED_OR_BEYOND.has(status)) pipelinesMigrated++;
    }

    points.push({
      week: monday.toISOString().slice(0, 10),
      applicationsDone,
      applicationsTotal: activeApps.length,
      applicationsPercent: percent(applicationsDone, activeApps.length),
      pipelinesMigrated,
      pipelinesMigratedPercent: percent(pipelinesMigrated, pipelinesTotal),
      pipelinesDone,
      pipelinesTotal,
      pipelinesPercent: percent(pipelinesDone, pipelinesTotal),
    });
  }
  return points;
}
