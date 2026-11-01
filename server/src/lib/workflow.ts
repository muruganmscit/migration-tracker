// Pure workflow rules: how repo statuses drive an application's phases. No database access here.
import type { EmailEvent, MigrationStatus, RepoStatus } from "@prisma/client";

export const REPO_STATUS_ORDER: RepoStatus[] = ["NOT_STARTED", "MIGRATING", "MIGRATED", "VALIDATING", "VALIDATED", "ADOPTED"];
const rank = (status: RepoStatus) => REPO_STATUS_ORDER.indexOf(status);

type RepoLike = { status: RepoStatus };
export const activeRepos = <T extends RepoLike>(repos: T[]) => repos.filter((repo) => repo.status !== "ARCHIVED");

// Backward moves, archiving and un-archiving all change what the numbers mean, so they need a reason.
export function statusChangeNeedsReason(from: RepoStatus, to: RepoStatus): boolean {
  if (from === to) return false;
  if (from === "ARCHIVED" || to === "ARCHIVED") return true;
  return rank(to) < rank(from);
}

const REPO_PHASES = [
  { phase: "MIGRATION", key: "migration", startsAt: "MIGRATING", endsAt: "MIGRATED", started: "MIGRATION_STARTED", ended: "MIGRATION_COMPLETED" },
  { phase: "VALIDATION", key: "validation", startsAt: "VALIDATING", endsAt: "VALIDATED", started: "VALIDATION_STARTED", ended: "VALIDATION_COMPLETED" },
  { phase: "ADOPTION", key: "adoption", startsAt: "ADOPTED", endsAt: "ADOPTED", started: "ADOPTION_STARTED", ended: "ADOPTION_COMPLETED" },
] as const;

const phaseStarted = (active: RepoLike[], p: (typeof REPO_PHASES)[number]) => active.some((r) => rank(r.status) >= rank(p.startsAt));
const phaseEnded = (active: RepoLike[], p: (typeof REPO_PHASES)[number]) => active.length > 0 && active.every((r) => rank(r.status) >= rank(p.endsAt));

export interface PhaseDates {
  cleanupStartedAt: Date | null;
  cleanupEndedAt: Date | null;
  migrationStartedAt: Date | null;
  migrationEndedAt: Date | null;
  validationStartedAt: Date | null;
  validationEndedAt: Date | null;
  adoptionStartedAt: Date | null;
  adoptionEndedAt: Date | null;
}

// Current phase = the earliest phase that hasn't ended, so one late repo can't flatter the application.
export function derivePhase(app: Pick<PhaseDates, "cleanupStartedAt" | "cleanupEndedAt">, repos: RepoLike[], current?: MigrationStatus): MigrationStatus {
  if (!app.cleanupStartedAt) return "NOT_STARTED";
  if (!app.cleanupEndedAt) return "CLEANUP";
  const active = activeRepos(repos);
  // Nothing left to measure (no repos, or all archived): hold position rather than guess.
  if (active.length === 0) return current === "VALIDATION" || current === "ADOPTION" || current === "COMPLETE" ? current : "MIGRATION";
  for (const p of REPO_PHASES) if (!phaseEnded(active, p)) return p.phase;
  return "COMPLETE";
}

// The only emails the portal sends. Recipients hear when each phase begins, get one final notice,
// and are told about the two exceptions. Other events stay recorded as dates in the portal.
export const PHASE_NOTICES: EmailEvent[] = ["MIGRATION_STARTED", "VALIDATION_STARTED", "ADOPTION_COMPLETED"];
export const ACTIVE_EMAIL_EVENTS: EmailEvent[] = ["CLEANUP_STARTED", ...PHASE_NOTICES, "APPLICATION_ARCHIVED", "PHASE_OVERRIDDEN"];

const NOTICE_PHASE: Record<string, MigrationStatus> = {
  MIGRATION_STARTED: "MIGRATION",
  VALIDATION_STARTED: "VALIDATION",
  ADOPTION_COMPLETED: "COMPLETE",
};
export const noticePhase = (event: EmailEvent) => NOTICE_PHASE[event] ?? "NOT_STARTED";

// Notices are held while Cleanup is open, so ending it sends the one for wherever repos have reached.
export function catchUpNotice(app: Pick<PhaseDates, "migrationStartedAt" | "validationStartedAt" | "adoptionEndedAt">): EmailEvent | null {
  if (app.adoptionEndedAt) return "ADOPTION_COMPLETED";
  if (app.validationStartedAt) return "VALIDATION_STARTED";
  if (app.migrationStartedAt) return "MIGRATION_STARTED";
  return null;
}

export interface Transition {
  phase: MigrationStatus;
  dates: Partial<PhaseDates>;
  /** The one email to send for this change, or null. */
  event: EmailEvent | null;
}

export function planTransition(
  app: PhaseDates & { migrationStatus: MigrationStatus; migrationStatusManualOverride: boolean },
  repos: RepoLike[],
  now: Date
): Transition {
  const active = activeRepos(repos);
  const derived = derivePhase(app, repos, app.migrationStatus);
  const phase = app.migrationStatusManualOverride ? app.migrationStatus : derived;
  const dates: Partial<PhaseDates> = {};
  const events: EmailEvent[] = [];

  // With no active repos there is nothing to measure, so recorded dates are left as they are.
  if (active.length > 0) {
    for (const p of REPO_PHASES) {
      const startKey = `${p.key}StartedAt` as const;
      const endKey = `${p.key}EndedAt` as const;
      // A start date is never cleared: going backward keeps when the phase first began.
      if (phaseStarted(active, p) && !app[startKey]) {
        dates[startKey] = now;
        events.push(p.started);
      }
      if (phaseEnded(active, p)) {
        if (!app[endKey]) {
          dates[endKey] = now;
          events.push(p.ended);
        }
      } else if (app[endKey]) {
        dates[endKey] = null;
      }
    }
  }

  // No notices while Cleanup is open or a phase is held by an override. One update can jump several
  // phases, so it sends only the notice for the furthest point reached.
  const notices = events.filter((e) => PHASE_NOTICES.includes(e));
  const quiet = !app.cleanupEndedAt || app.migrationStatusManualOverride;
  return { phase, dates, event: quiet || notices.length === 0 ? null : notices[notices.length - 1] };
}

export function cleanupBlocker(repos: (RepoLike & { cleanupDecision: "KEEP" | "ARCHIVE" | null })[]): string | null {
  const open = activeRepos(repos);
  const undecided = open.filter((r) => !r.cleanupDecision).length;
  if (undecided > 0) return `${undecided} ${undecided === 1 ? "repo still needs" : "repos still need"} a Keep or Archive decision`;
  if (open.length > 0 && open.every((r) => r.cleanupDecision === "ARCHIVE")) {
    return "Every repo is marked Archive. Archive the application instead";
  }
  return null;
}

// Archiving is a Cleanup conclusion, or a tidy-up when an application has nothing left to migrate.
export function canArchive(app: Pick<PhaseDates, "cleanupStartedAt" | "cleanupEndedAt"> & { status: string }, repos: RepoLike[]): boolean {
  if (app.status === "ARCHIVED") return false;
  const cleanupOpen = !!app.cleanupStartedAt && !app.cleanupEndedAt;
  return cleanupOpen || activeRepos(repos).length === 0;
}

// Inactive means Archived. Unlike a Cleanup archive it applies from any phase, but a finished
// migration stays finished.
export function inactiveBlocker(app: { status: string; migrationStatus: MigrationStatus }): string | null {
  if (app.status === "ARCHIVED") return "This application is already archived";
  if (app.migrationStatus === "COMPLETE") return "A Complete application can't be marked inactive";
  return null;
}

export function targetDatesError(start: Date | null | undefined, end: Date | null | undefined): string | null {
  return start && end && start > end ? "Target start must be on or before target end" : null;
}

export type WorkflowWarning = "CLEANUP_NOT_FINISHED" | "DATES_OUTSIDE_WAVE" | "NO_ACTIVE_REPOS";

export function computeWarnings(
  app: Pick<PhaseDates, "cleanupEndedAt"> & { status: string; targetStartDate: Date | null; targetDate: Date | null; wave?: { targetStartDate: Date | null; targetDate: Date | null } | null },
  repos: RepoLike[]
): WorkflowWarning[] {
  if (app.status === "ARCHIVED") return [];
  const warnings: WorkflowWarning[] = [];
  const active = activeRepos(repos);
  if (!app.cleanupEndedAt && active.some((r) => r.status !== "NOT_STARTED")) warnings.push("CLEANUP_NOT_FINISHED");
  if (app.cleanupEndedAt && active.length === 0) warnings.push("NO_ACTIVE_REPOS");
  const w = app.wave;
  if (w) {
    const startsEarly = app.targetStartDate && w.targetStartDate && app.targetStartDate < w.targetStartDate;
    const endsLate = app.targetDate && w.targetDate && app.targetDate > w.targetDate;
    if (startsEarly || endsLate) warnings.push("DATES_OUTSIDE_WAVE");
  }
  return warnings;
}
