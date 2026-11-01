import test from "node:test";
import assert from "node:assert/strict";
import type { RepoStatus } from "@prisma/client";
import { inactiveBlocker, canArchive, catchUpNotice, targetDatesError, cleanupBlocker, computeWarnings, derivePhase, planTransition, statusChangeNeedsReason } from "./workflow";
import { applicationProgressPercent } from "./progress";
import { computeHealth } from "./health";

const now = new Date("2026-06-01T00:00:00Z");
const before = new Date("2026-05-01T00:00:00Z");
const repos = (...statuses: RepoStatus[]) => statuses.map((status) => ({ status }));
const blank = {
  cleanupStartedAt: null, cleanupEndedAt: null, migrationStartedAt: null, migrationEndedAt: null,
  validationStartedAt: null, validationEndedAt: null, adoptionStartedAt: null, adoptionEndedAt: null,
};
const afterCleanup = { ...blank, cleanupStartedAt: before, cleanupEndedAt: before, migrationStatus: "MIGRATION" as const, migrationStatusManualOverride: false };

test("phase is the earliest one not ended", () => {
  const done = { cleanupStartedAt: before, cleanupEndedAt: before };
  assert.equal(derivePhase(blank, repos("ADOPTED")), "NOT_STARTED");
  assert.equal(derivePhase({ ...blank, cleanupStartedAt: before }, repos("ADOPTED")), "CLEANUP");
  assert.equal(derivePhase(done, repos("NOT_STARTED", "ADOPTED")), "MIGRATION");
  assert.equal(derivePhase(done, repos("MIGRATED", "ADOPTED")), "VALIDATION");
  assert.equal(derivePhase(done, repos("VALIDATED", "ADOPTED")), "ADOPTION");
  assert.equal(derivePhase(done, repos("ADOPTED", "ADOPTED", "ARCHIVED")), "COMPLETE");
});

test("no active repos holds position", () => {
  const done = { cleanupStartedAt: before, cleanupEndedAt: before };
  assert.equal(derivePhase(done, []), "MIGRATION");
  assert.equal(derivePhase(done, repos("ARCHIVED"), "COMPLETE"), "COMPLETE");
  assert.deepEqual(planTransition({ ...afterCleanup, migrationEndedAt: before }, repos("ARCHIVED"), now).dates, {});
});

test("first repo starts a phase and sends its notice; finishing a phase records dates quietly", () => {
  const started = planTransition(afterCleanup, repos("MIGRATING", "NOT_STARTED"), now);
  assert.equal(started.dates.migrationStartedAt, now);
  assert.equal(started.dates.migrationEndedAt, undefined);
  assert.equal(started.event, "MIGRATION_STARTED");

  const ended = planTransition({ ...afterCleanup, migrationStartedAt: before }, repos("MIGRATED", "MIGRATED"), now);
  assert.equal(ended.dates.migrationEndedAt, now);
  assert.equal(ended.event, null);

  const validating = planTransition({ ...afterCleanup, migrationStartedAt: before }, repos("VALIDATING", "MIGRATING"), now);
  assert.equal(validating.event, "VALIDATION_STARTED");
});

test("the final notice goes out only when Adoption completes", () => {
  const app = { ...afterCleanup, migrationStartedAt: before, migrationEndedAt: before, validationStartedAt: before, validationEndedAt: before };
  const partly = planTransition(app, repos("ADOPTED", "VALIDATED"), now);
  assert.equal(partly.dates.adoptionStartedAt, now);
  assert.equal(partly.event, null);
  assert.equal(planTransition({ ...app, adoptionStartedAt: before }, repos("ADOPTED", "ADOPTED"), now).event, "ADOPTION_COMPLETED");
});

test("a big jump records every date but sends one notice, for the furthest point", () => {
  const plan = planTransition(afterCleanup, repos("ADOPTED"), now);
  assert.equal(plan.phase, "COMPLETE");
  assert.equal(plan.dates.validationEndedAt, now);
  assert.equal(plan.event, "ADOPTION_COMPLETED");
  assert.equal(planTransition(afterCleanup, repos("VALIDATED"), now).event, "VALIDATION_STARTED");
});

test("going backward reopens the phase quietly and keeps its start date", () => {
  const app = { ...afterCleanup, migrationStartedAt: before, migrationEndedAt: before, validationStartedAt: before, migrationStatus: "VALIDATION" as const };
  const plan = planTransition(app, repos("MIGRATING", "VALIDATING"), now);
  assert.equal(plan.dates.migrationEndedAt, null);
  assert.equal("migrationStartedAt" in plan.dates, false);
  assert.equal(plan.phase, "MIGRATION");
  assert.equal(plan.event, null);
});

test("a new repo reopens a complete application at its earliest phase, quietly", () => {
  const app = { ...afterCleanup, migrationStartedAt: before, migrationEndedAt: before, validationStartedAt: before, validationEndedAt: before, adoptionStartedAt: before, adoptionEndedAt: before, migrationStatus: "COMPLETE" as const };
  const plan = planTransition(app, repos("ADOPTED", "NOT_STARTED"), now);
  assert.equal(plan.phase, "MIGRATION");
  assert.equal(plan.dates.adoptionEndedAt, null);
  assert.equal(plan.event, null);
});

test("completing again after a reopen sends the final notice again", () => {
  const app = { ...afterCleanup, migrationStartedAt: before, migrationEndedAt: before, validationStartedAt: before, validationEndedAt: before, adoptionStartedAt: before, migrationStatus: "ADOPTION" as const };
  assert.equal(planTransition(app, repos("ADOPTED"), now).event, "ADOPTION_COMPLETED");
});

test("no notices while Cleanup is open, but dates are recorded", () => {
  const app = { ...blank, cleanupStartedAt: before, migrationStatus: "CLEANUP" as const, migrationStatusManualOverride: false };
  const plan = planTransition(app, repos("MIGRATING"), now);
  assert.equal(plan.phase, "CLEANUP");
  assert.equal(plan.dates.migrationStartedAt, now);
  assert.equal(plan.event, null);
});

test("ending Cleanup catches up on the held notice", () => {
  const d = { migrationStartedAt: null, validationStartedAt: null, adoptionEndedAt: null };
  assert.equal(catchUpNotice(d), null);
  assert.equal(catchUpNotice({ ...d, migrationStartedAt: before }), "MIGRATION_STARTED");
  assert.equal(catchUpNotice({ ...d, migrationStartedAt: before, validationStartedAt: before }), "VALIDATION_STARTED");
  assert.equal(catchUpNotice({ migrationStartedAt: before, validationStartedAt: before, adoptionEndedAt: before }), "ADOPTION_COMPLETED");
});

test("an override holds the phase and stays quiet while dates keep recording", () => {
  const plan = planTransition({ ...afterCleanup, migrationStatus: "ADOPTION", migrationStatusManualOverride: true }, repos("MIGRATING"), now);
  assert.equal(plan.phase, "ADOPTION");
  assert.equal(plan.event, null);
  assert.equal(plan.dates.migrationStartedAt, now);
});

test("which status changes need a reason", () => {
  assert.equal(statusChangeNeedsReason("MIGRATING", "MIGRATED"), false);
  assert.equal(statusChangeNeedsReason("NOT_STARTED", "ADOPTED"), false);
  assert.equal(statusChangeNeedsReason("VALIDATING", "MIGRATING"), true);
  assert.equal(statusChangeNeedsReason("MIGRATING", "ARCHIVED"), true);
  assert.equal(statusChangeNeedsReason("ARCHIVED", "NOT_STARTED"), true);
});

test("Cleanup can't end without a decision on every active repo", () => {
  const d = (status: RepoStatus, cleanupDecision: "KEEP" | "ARCHIVE" | null) => ({ status, cleanupDecision });
  assert.match(cleanupBlocker([d("NOT_STARTED", "KEEP"), d("NOT_STARTED", null)])!, /1 repo/);
  assert.match(cleanupBlocker([d("NOT_STARTED", "ARCHIVE")])!, /Archive the application/);
  assert.equal(cleanupBlocker([d("NOT_STARTED", "KEEP"), d("NOT_STARTED", "ARCHIVE"), d("ARCHIVED", null)]), null);
  assert.equal(cleanupBlocker([]), null);
});

test("archiving needs an open Cleanup, or no active repos", () => {
  const app = { status: "ACTIVE", cleanupStartedAt: null, cleanupEndedAt: null };
  const finished = { ...app, cleanupStartedAt: before, cleanupEndedAt: before };
  assert.equal(canArchive(app, []), true);
  assert.equal(canArchive(app, repos("NOT_STARTED")), false);
  assert.equal(canArchive({ ...app, cleanupStartedAt: before }, repos("MIGRATING")), true);
  assert.equal(canArchive(finished, repos("MIGRATING", "ARCHIVED")), false);
  assert.equal(canArchive(finished, repos("ARCHIVED")), true);
  assert.equal(canArchive(finished, []), true);
  assert.equal(canArchive({ ...app, status: "ARCHIVED" }, []), false);
});

test("target start can't be after target end", () => {
  assert.match(targetDatesError(now, before)!, /on or before/);
  assert.equal(targetDatesError(before, now), null);
  assert.equal(targetDatesError(now, now), null);
  assert.equal(targetDatesError(null, now), null);
});

test("inactive applies at any phase except Complete", () => {
  for (const migrationStatus of ["NOT_STARTED", "CLEANUP", "MIGRATION", "VALIDATION", "ADOPTION"] as const) {
    assert.equal(inactiveBlocker({ status: "ACTIVE", migrationStatus }), null);
  }
  assert.match(inactiveBlocker({ status: "ACTIVE", migrationStatus: "COMPLETE" })!, /Complete/);
  assert.match(inactiveBlocker({ status: "ARCHIVED", migrationStatus: "CLEANUP" })!, /already archived/);
});

test("weighted progress leaves out archived repos", () => {
  assert.equal(applicationProgressPercent(repos("NOT_STARTED", "ADOPTED")), 50);
  assert.equal(applicationProgressPercent(repos("MIGRATING", "MIGRATED", "VALIDATING", "VALIDATED")), 55);
  assert.equal(applicationProgressPercent(repos("ADOPTED", "ARCHIVED")), 100);
  assert.equal(applicationProgressPercent(repos("ARCHIVED")), 0);
});

test("warnings", () => {
  const base = { status: "ACTIVE", cleanupEndedAt: null, targetStartDate: null, targetDate: null };
  assert.deepEqual(computeWarnings(base, repos("MIGRATING")), ["CLEANUP_NOT_FINISHED"]);
  assert.deepEqual(computeWarnings(base, repos("NOT_STARTED")), []);
  assert.deepEqual(computeWarnings({ ...base, cleanupEndedAt: before }, repos("ARCHIVED")), ["NO_ACTIVE_REPOS"]);
  const wave = { targetStartDate: before, targetDate: now };
  assert.deepEqual(computeWarnings({ ...base, targetDate: new Date("2026-07-01"), wave }, []), ["DATES_OUTSIDE_WAVE"]);
  assert.deepEqual(computeWarnings({ ...base, targetDate: now, wave }, []), []);
  assert.deepEqual(computeWarnings({ ...base, status: "ARCHIVED" }, repos("MIGRATING")), []);
});

test("health rules, in order", () => {
  const day = 86400000;
  const inDays = (n: number) => new Date(Date.now() + n * day);
  const h = (o: Partial<Parameters<typeof computeHealth>[0]>) =>
    computeHealth({ complete: false, progressPercent: 0, targetStartDate: null, targetDate: inDays(60), cleanupStarted: true, ...o });
  assert.equal(h({ archived: true, complete: true }), "ARCHIVED");
  assert.equal(h({ complete: true, targetDate: null }), "COMPLETE");
  assert.equal(h({ targetDate: null }), "UNSCHEDULED");
  assert.equal(h({ targetDate: inDays(-1) }), "OVERDUE");
  assert.equal(h({ targetStartDate: inDays(-1), cleanupStarted: false }), "AT_RISK");
  assert.equal(h({ targetDate: inDays(10), progressPercent: 79 }), "AT_RISK");
  assert.equal(h({ targetDate: inDays(10), progressPercent: 80 }), "ON_TRACK");
  assert.equal(h({ targetStartDate: inDays(-1) }), "ON_TRACK");
});
