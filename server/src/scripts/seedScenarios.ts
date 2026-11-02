// Replaces all application data with a small, deterministic data set that exercises every state the
// portal can show. Dates are relative to "now", so re-run it to refresh them (health is date-driven).
// Sends no email: email history is written directly. Email templates are left untouched.
//
//   docker compose exec server npm run seed:scenarios
import { EmailEvent, MigrationStatus, PipelineType, RepoStatus, Technology } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { applicationProgressPercent } from "../lib/progress";
import { computeHealth, HealthStatus } from "../lib/health";
import { ACTIVE_EMAIL_EVENTS, PhaseDates, REPO_STATUS_ORDER, computeWarnings, planTransition, WorkflowWarning } from "../lib/workflow";

const DAY = 24 * 60 * 60 * 1000;
const days = (n: number) => new Date(Date.now() + n * DAY);

type Mix = Partial<Record<RepoStatus, number>>;
interface Scenario {
  name: string;
  owner: string;
  team: string;
  tech: Technology;
  wave: number;
  targetStart?: number; // days from now
  target?: number;
  proposed?: number;
  cleanup: "none" | "open" | "done";
  /** While Cleanup is open: how many repos already have a decision (the last may be Archive). */
  decided?: "some" | "all";
  archiveReason?: string;
  repos: Mix;
  override?: { stage: MigrationStatus; reason: string };
  reopened?: string;
  noRecipients?: boolean;
  smtpFailure?: boolean;
  issues?: { open?: number; resolved?: number };
  expect: { phase: MigrationStatus; health: HealthStatus; warnings?: WorkflowWarning[] };
}

const N = "NOT_STARTED", G = "MIGRATING", M = "MIGRATED", V = "VALIDATING", D = "VALIDATED", A = "ADOPTED", X = "ARCHIVED";

const SCENARIOS: Scenario[] = [
  // Wave 1: finished
  { name: "Payments Gateway", owner: "Maria Gonzalez", team: "payments", tech: "JAVA", wave: 1, targetStart: -89, target: -24, proposed: -30, cleanup: "done", repos: { [A]: 8 }, issues: { resolved: 2 }, expect: { phase: "COMPLETE", health: "COMPLETE" } },
  { name: "Customer Portal", owner: "Ravi Patel", team: "growth", tech: "NODEJS", wave: 1, targetStart: -85, target: -22, cleanup: "done", repos: { [A]: 6, [X]: 2 }, expect: { phase: "COMPLETE", health: "COMPLETE" } },
  // Cleanup concluded the application isn't needed.
  { name: "Legacy Billing Batch", owner: "Tom Walsh", team: "payments", tech: "OTHERS", wave: 1, target: -35, cleanup: "open", archiveReason: "Replaced by Payments Gateway; batch job retired.", repos: { [N]: 4 }, expect: { phase: "CLEANUP", health: "ARCHIVED" } },
  // Wave 2: deadline close, well behind
  { name: "Order Management", owner: "Priya Sharma", team: "core", tech: "JAVA", wave: 2, targetStart: -40, target: 9, proposed: 24, cleanup: "done", repos: { [V]: 5, [A]: 3 }, expect: { phase: "VALIDATION", health: "AT_RISK" } },
  { name: "Inventory Sync", owner: "James Okafor", team: "core", tech: "GO", wave: 2, targetStart: -40, target: 7, proposed: 21, cleanup: "done", repos: { [M]: 4, [D]: 2, [A]: 2 }, issues: { open: 3, resolved: 1 }, smtpFailure: true, expect: { phase: "VALIDATION", health: "AT_RISK" } },
  { name: "Search Indexer", owner: "Lena Fischer", team: "data", tech: "PYTHON", wave: 2, targetStart: -45, target: -6, proposed: 14, cleanup: "done", repos: { [G]: 3, [M]: 2, [A]: 1 }, issues: { open: 2 }, expect: { phase: "MIGRATION", health: "OVERDUE" } },
  // One repo holds the application in Migration even though it is 90% done.
  { name: "Notification Hub", owner: "Noah Kim", team: "platform", tech: "NODEJS", wave: 2, targetStart: -30, target: 12, cleanup: "done", repos: { [N]: 1, [A]: 9 }, expect: { phase: "MIGRATION", health: "ON_TRACK" } },
  // Overdue, stuck in Cleanup with decisions partly made, and nobody to notify.
  { name: "Reporting API", owner: "Sofia Rossi", team: "data", tech: "DOTNET", wave: 2, targetStart: -49, target: -15, cleanup: "open", decided: "some", repos: { [N]: 5 }, noRecipients: true, expect: { phase: "CLEANUP", health: "OVERDUE" } },
  // Phase set by hand, ahead of what the repos say.
  { name: "Fraud Detection", owner: "David Okoye", team: "identity", tech: "PYTHON", wave: 2, targetStart: -30, target: 5, cleanup: "done", repos: { [M]: 3, [G]: 2 }, override: { stage: "VALIDATION", reason: "Regulator review already validated the remaining repos." }, issues: { open: 1 }, expect: { phase: "VALIDATION", health: "AT_RISK" } },
  // Wave 3: comfortably on track
  // Repos started migrating before Cleanup finished, so the application is flagged.
  { name: "Mobile BFF", owner: "Grace Liu", team: "mobile", tech: "NODEJS", wave: 3, targetStart: -8, target: 60, cleanup: "open", repos: { [G]: 2, [N]: 3 }, expect: { phase: "CLEANUP", health: "ON_TRACK", warnings: ["CLEANUP_NOT_FINISHED"] } },
  { name: "Data Pipeline Orchestrator", owner: "Hector Diaz", team: "data", tech: "PYTHON", wave: 3, targetStart: -9, target: 75, proposed: 60, cleanup: "done", repos: { [M]: 6, [A]: 2 }, expect: { phase: "VALIDATION", health: "ON_TRACK" } },
  { name: "Analytics Warehouse", owner: "Emily Chen", team: "data", tech: "JAVA", wave: 3, targetStart: -9, target: 45, cleanup: "done", repos: { [D]: 3, [A]: 4, [X]: 1 }, expect: { phase: "ADOPTION", health: "ON_TRACK" } },
  // Large enough to page through the repo table (page size 20), with every repo status.
  { name: "Platform Core Services", owner: "Alice Smith", team: "platform", tech: "GO", wave: 3, targetStart: -9, target: 85, cleanup: "done", repos: { [N]: 8, [G]: 8, [M]: 8, [V]: 6, [D]: 6, [A]: 6, [X]: 3 }, issues: { open: 4, resolved: 3 }, expect: { phase: "MIGRATION", health: "ON_TRACK" } },
  { name: "Shipping Rates", owner: "Carol Lee", team: "core", tech: "DOTNET", wave: 3, targetStart: -9, target: 50, cleanup: "done", repos: { [V]: 2, [A]: 3 }, override: { stage: "COMPLETE", reason: "Remaining repos are covered by the vendor's own sign-off." }, expect: { phase: "COMPLETE", health: "COMPLETE" } },
  // Target end falls after the wave's end date.
  { name: "Partner Integrations & Third-Party Webhook Delivery Platform", owner: "Bartholomew Montgomery-Ellis", team: "partner-integrations", tech: "JAVA", wave: 3, targetStart: -9, target: 100, proposed: 110, cleanup: "done", repos: { [G]: 2, [N]: 3 }, expect: { phase: "MIGRATION", health: "ON_TRACK", warnings: ["DATES_OUTSIDE_WAVE"] } },
  // Cleanup finished, but no repos have been added yet.
  { name: "Docs Site", owner: "Dana Kim", team: "platform", tech: "OTHERS", wave: 3, targetStart: -9, target: 30, cleanup: "done", repos: {}, expect: { phase: "MIGRATION", health: "ON_TRACK", warnings: ["NO_ACTIVE_REPOS"] } },
  // Should have started by now, but Cleanup hasn't begun.
  { name: "Zip Code Lookup", owner: "Hector Diaz", team: "core", tech: "GO", wave: 3, targetStart: -3, target: 70, cleanup: "none", repos: { [N]: 3 }, expect: { phase: "NOT_STARTED", health: "AT_RISK" } },
  // Failed validation sent a repo back, so Migration reopened.
  { name: "Tax Calculator", owner: "Sofia Rossi", team: "payments", tech: "JAVA", wave: 3, targetStart: -9, target: 65, cleanup: "done", repos: { [G]: 1, [V]: 2 }, reopened: "Validation failed: rounding differs from the legacy pipeline.", expect: { phase: "MIGRATION", health: "ON_TRACK" } },
  { name: "Vendor Sandbox", owner: "Bob Jones", team: "infra", tech: "OTHERS", wave: 3, cleanup: "open", archiveReason: "Vendor contract ended; no longer in use.", repos: { [N]: 2 }, expect: { phase: "CLEANUP", health: "ARCHIVED" } },
  // Wave 4: not scheduled yet
  { name: "Recommendation Engine", owner: "Priya Sharma", team: "growth", tech: "PYTHON", wave: 4, cleanup: "none", repos: { [N]: 6 }, expect: { phase: "NOT_STARTED", health: "UNSCHEDULED" } },
  // Every repo has a decision, so Cleanup is ready to be ended.
  { name: "Loyalty Rewards", owner: "Bob Jones", team: "growth", tech: "NODEJS", wave: 4, cleanup: "open", decided: "all", repos: { [N]: 4 }, expect: { phase: "CLEANUP", health: "UNSCHEDULED" } },
  { name: "Email Preferences", owner: "Ravi Patel", team: "growth", tech: "NODEJS", wave: 4, proposed: 120, cleanup: "open", repos: { [N]: 3 }, expect: { phase: "CLEANUP", health: "UNSCHEDULED" } },
  { name: "Feature Flags Service", owner: "Noah Kim", team: "platform", tech: "GO", wave: 4, cleanup: "done", repos: { [A]: 3 }, expect: { phase: "COMPLETE", health: "COMPLETE" } },
  { name: "Warehouse Scanner", owner: "Tom Walsh", team: "infra", tech: "DOTNET", wave: 4, cleanup: "none", archiveReason: "Marked inactive", repos: { [N]: 4 }, expect: { phase: "NOT_STARTED", health: "ARCHIVED" } },
  // Every repo was archived after Cleanup: the portal asks what should happen next.
  { name: "HR Self Service", owner: "Sofia Rossi", team: "infra", tech: "JAVA", wave: 4, cleanup: "done", repos: { [X]: 3 }, expect: { phase: "MIGRATION", health: "UNSCHEDULED", warnings: ["NO_ACTIVE_REPOS"] } },
  // Later additions
  { name: "Internal Wiki", owner: "Dana Kim", team: "infra", tech: "OTHERS", wave: 4, cleanup: "done", repos: { [G]: 1, [V]: 2 }, expect: { phase: "MIGRATION", health: "UNSCHEDULED" } },
  { name: "Vendor Portal", owner: "Carol Lee", team: "core", tech: "JAVA", wave: 2, target: -2, cleanup: "done", archiveReason: "Marked inactive", repos: { [M]: 2, [G]: 1 }, expect: { phase: "MIGRATION", health: "ARCHIVED" } },
  { name: "Experimentation Service", owner: "Grace Liu", team: "growth", tech: "PYTHON", wave: 2, target: 13, cleanup: "done", repos: { [V]: 3 }, noRecipients: true, expect: { phase: "VALIDATION", health: "AT_RISK" } },
];

// When each recorded phase date falls, for a believable timeline.
const DATE_OFFSETS = {
  cleanupStartedAt: -38, cleanupEndedAt: -30, migrationStartedAt: -28, migrationEndedAt: -18,
  validationStartedAt: -16, validationEndedAt: -9, adoptionStartedAt: -8, adoptionEndedAt: -2,
} as const;
const DATE_EVENTS: Record<keyof typeof DATE_OFFSETS, EmailEvent> = {
  cleanupStartedAt: "CLEANUP_STARTED", cleanupEndedAt: "CLEANUP_COMPLETED", migrationStartedAt: "MIGRATION_STARTED", migrationEndedAt: "MIGRATION_COMPLETED",
  validationStartedAt: "VALIDATION_STARTED", validationEndedAt: "VALIDATION_COMPLETED", adoptionStartedAt: "ADOPTION_STARTED", adoptionEndedAt: "ADOPTION_COMPLETED",
};

const VERSIONS: Record<Technology, string | null> = { JAVA: "17", NODEJS: "20", PYTHON: "3.12", DOTNET: "8.0", GO: "1.22", OTHERS: null };
const PIPELINES: Record<Technology, PipelineType> = {
  JAVA: "DEFAULT_JAVA", NODEJS: "DEFAULT_NODE", PYTHON: "DEFAULT_PYTHON", DOTNET: "DEFAULT_DOTNET", GO: "DEFAULT_GO", OTHERS: "CUSTOM",
};
const REPO_SUFFIXES = ["api", "worker", "web", "gateway", "jobs", "client", "infra", "docs"];
const OPEN_ISSUES = ["Build agent lacks required JDK", "Secrets not yet moved to Harness", "Flaky integration tests in new pipeline", "Service account missing deploy permission"];
const RESOLVED_ISSUES = ["Docker registry connector misconfigured", "Pipeline trigger not firing on tags", "Artifact path differs from legacy job"];
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

function decision(s: Scenario, index: number, status: RepoStatus) {
  if (status === "ARCHIVED") return { cleanupDecision: "ARCHIVE" as const, cleanupReason: s.archiveReason ?? "Decommissioned, will not be migrated." };
  if (s.cleanup === "done") return { cleanupDecision: "KEEP" as const };
  if (s.decided === "all") return { cleanupDecision: "KEEP" as const };
  if (s.decided === "some" && index === 0) return { cleanupDecision: "KEEP" as const };
  if (s.decided === "some" && index === 1) return { cleanupDecision: "ARCHIVE" as const, cleanupReason: "No traffic in 12 months." };
  return {};
}

async function main() {
  if (!process.argv.includes("--reset")) {
    throw new Error("This deletes ALL applications, repos, issues, recipients and email logs. Re-run with --reset.");
  }

  // Cascades to Repo, Recipient, EmailLog, StatusHistory and Issue. Wave and EmailTemplate survive.
  await prisma.$executeRawUnsafe('TRUNCATE "Application" RESTART IDENTITY CASCADE');

  const waveDates: Record<number, { targetStartDate: Date | null; targetDate: Date | null; proposedTargetDate: Date | null }> = {
    1: { targetStartDate: days(-90), targetDate: days(-21), proposedTargetDate: days(-28) }, // complete
    2: { targetStartDate: days(-50), targetDate: days(14), proposedTargetDate: days(24) }, // at risk, proposed date slipped later
    3: { targetStartDate: days(-10), targetDate: days(90), proposedTargetDate: null }, // on track
    4: { targetStartDate: null, targetDate: null, proposedTargetDate: null }, // unscheduled
  };
  for (const number of [1, 2, 3, 4]) {
    await prisma.wave.upsert({ where: { number }, update: waveDates[number], create: { number, ...waveDates[number] } });
  }
  const waves = await prisma.wave.findMany();
  const waveId = (n: number) => waves.find((w) => w.number === n)!.id;

  let seq = 0;
  for (const [i, s] of SCENARIOS.entries()) {
    const statuses = (Object.entries(s.repos) as [RepoStatus, number][]).flatMap(([st, n]) => Array<RepoStatus>(n).fill(st));
    const archived = !!s.archiveReason;

    // The phase and dates come from the real workflow rules, so the seed can't drift from them.
    const base: PhaseDates = {
      cleanupStartedAt: s.cleanup === "none" ? null : days(DATE_OFFSETS.cleanupStartedAt),
      cleanupEndedAt: s.cleanup === "done" ? days(DATE_OFFSETS.cleanupEndedAt) : null,
      migrationStartedAt: null, migrationEndedAt: null, validationStartedAt: null, validationEndedAt: null, adoptionStartedAt: null, adoptionEndedAt: null,
    };
    const plan = planTransition(
      { ...base, migrationStatus: s.override?.stage ?? "NOT_STARTED", migrationStatusManualOverride: !!s.override },
      statuses.map((status) => ({ status })),
      new Date()
    );
    const dates: PhaseDates = { ...base };
    for (const key of Object.keys(plan.dates) as (keyof PhaseDates)[]) {
      if (plan.dates[key]) dates[key] = days(DATE_OFFSETS[key]);
    }
    if (s.reopened) dates.validationStartedAt = days(DATE_OFFSETS.validationStartedAt);

    const app = await prisma.application.create({
      data: {
        appId: `APP-${1001 + i}`,
        name: s.name,
        owner: s.owner,
        teamContact: `${s.team}-team@example.com`,
        status: archived ? "ARCHIVED" : "ACTIVE",
        waveId: waveId(s.wave),
        targetStartDate: s.targetStart === undefined ? null : days(s.targetStart),
        targetDate: s.target === undefined ? null : days(s.target),
        proposedTargetDate: s.proposed === undefined ? null : days(s.proposed),
        migrationStatus: plan.phase,
        migrationStatusManualOverride: !!s.override,
        overrideReason: s.override?.reason,
        archivedAt: archived ? days(-33) : null,
        archiveReason: s.archiveReason,
        ...dates,
      },
    });

    const repoIds: number[] = [];
    for (const [j, status] of statuses.entries()) {
      seq++;
      const effective: RepoStatus = archived ? "ARCHIVED" : status;
      const steps: RepoStatus[] = effective === "ARCHIVED" ? ["NOT_STARTED", "ARCHIVED"] : REPO_STATUS_ORDER.slice(0, REPO_STATUS_ORDER.indexOf(effective) + 1);
      // Walk backwards from a recent last change to give the timeline a realistic spread.
      const lastChange = -(seq * 7) % 12;
      const dateOf = (k: number) => days(lastChange - (steps.length - 1 - k) * 5 - 1);
      const tech: Technology | null = j % 7 === 6 ? null : j % 5 === 4 ? "OTHERS" : s.tech;
      const suffix = REPO_SUFFIXES[j % REPO_SUFFIXES.length];
      const round = Math.floor(j / REPO_SUFFIXES.length);
      const repoName = `${slug(s.name).slice(0, 24)}-${suffix}${round ? `-${round + 1}` : ""}`;
      const repo = await prisma.repo.create({
        data: {
          applicationId: app.id,
          name: repoName,
          sourceUrl: `https://github.com/example/${repoName}`,
          targetProject: effective === "NOT_STARTED" ? null : `harness-${s.team}`,
          technology: tech,
          technologyVersion: tech ? VERSIONS[tech] : null,
          pipelineType: tech ? (j % 6 === 5 ? "CUSTOM" : PIPELINES[tech]) : null,
          status: effective,
          startedAt: effective === "NOT_STARTED" ? null : dateOf(Math.min(1, steps.length - 1)),
          completedAt: effective === "ADOPTED" || effective === "ARCHIVED" ? dateOf(steps.length - 1) : null,
          notes: effective === "ARCHIVED" ? "Decommissioned, will not be migrated." : null,
          ...decision(s, j, effective),
        },
      });
      repoIds.push(repo.id);
      await prisma.statusHistory.createMany({
        data: steps.map((st, k) => ({
          repoId: repo.id,
          status: st,
          changedAt: dateOf(k),
          note: st === "ARCHIVED" ? (s.archiveReason ?? "Decommissioned, will not be migrated.") : null,
        })),
      });
      if (s.reopened && effective === "MIGRATING") {
        await prisma.statusHistory.createMany({
          data: [
            { repoId: repo.id, status: "VALIDATING", changedAt: days(-6) },
            { repoId: repo.id, status: "MIGRATING", changedAt: days(-3), note: s.reopened },
          ],
        });
      }
    }

    const pickRepo = (k: number) => repoIds[k % repoIds.length];
    for (let k = 0; k < (s.issues?.open ?? 0); k++) {
      await prisma.issue.create({ data: { repoId: pickRepo(k), title: OPEN_ISSUES[k % OPEN_ISSUES.length], createdAt: days(-4 - k) } });
    }
    for (let k = 0; k < (s.issues?.resolved ?? 0); k++) {
      await prisma.issue.create({
        data: { repoId: pickRepo(k + 1), title: RESOLVED_ISSUES[k % RESOLVED_ISSUES.length], isResolved: true, createdAt: days(-20 - k), resolvedAt: days(-10 - k) },
      });
    }

    // example.com is a reserved domain, so these addresses can never reach a real person.
    const recipients = s.noRecipients
      ? []
      : [
          { email: `${slug(s.owner).replace(/-/g, ".")}@example.com`, name: s.owner },
          { email: `${slug(s.team)}-team@example.com`, name: `${s.team} team` },
          ...(i === 0 ? [{ email: "release-managers@example.com", name: "Release managers" }] : []),
        ];
    await prisma.recipient.createMany({ data: recipients.map((r) => ({ ...r, applicationId: app.id })) });

    const list = recipients.map((r) => r.email).join(", ");
    const logEmail = (event: string, sentAt: Date, triggeredBy: "AUTO" | "MANUAL" = "AUTO", errorMessage?: string) =>
      prisma.emailLog.create({
        data: s.noRecipients
          ? { applicationId: app.id, event, recipients: "", triggeredBy, status: "FAILED", errorMessage: "No recipients configured for this application", sentAt }
          : { applicationId: app.id, event, recipients: list, triggeredBy, status: errorMessage ? "FAILED" : "SENT", errorMessage, sentAt },
      });
    for (const key of Object.keys(DATE_OFFSETS) as (keyof typeof DATE_OFFSETS)[]) {
      if (dates[key] && ACTIVE_EMAIL_EVENTS.includes(DATE_EVENTS[key])) await logEmail(DATE_EVENTS[key], dates[key]!);
    }
    if (s.override) await logEmail("PHASE_OVERRIDDEN", days(-1), "MANUAL");
    if (archived) await logEmail("APPLICATION_ARCHIVED", days(-33));
    if (s.smtpFailure) {
      await logEmail("VALIDATION_STARTED", days(-2), "AUTO", "connect ECONNREFUSED smtp:587");
      await logEmail("VALIDATION_STARTED", days(-2), "MANUAL");
    }

    // Fail loudly if a scenario no longer shows what it claims to.
    const finalRepos = statuses.map((status) => ({ status: (archived ? "ARCHIVED" : status) as RepoStatus }));
    const health = computeHealth({
      archived,
      complete: plan.phase === "COMPLETE",
      progressPercent: applicationProgressPercent(finalRepos),
      targetStartDate: app.targetStartDate,
      targetDate: app.targetDate,
      cleanupStarted: !!app.cleanupStartedAt,
    });
    const warnings = computeWarnings({ ...app, wave: waves.find((w) => w.number === s.wave) }, finalRepos);
    const expected = s.expect.warnings ?? [];
    if (plan.phase !== s.expect.phase || health !== s.expect.health || warnings.join() !== expected.join()) {
      throw new Error(`${s.name}: expected ${s.expect.phase}/${s.expect.health}/[${expected}], got ${plan.phase}/${health}/[${warnings}]`);
    }
  }

  const repoCount = await prisma.repo.count();
  console.log(`Seeded ${SCENARIOS.length} applications and ${repoCount} repos. All scenario expectations held.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
