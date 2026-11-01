import test from "node:test";
import assert from "node:assert/strict";
import { weeklyProgress } from "./progressTimeline";

const d = (s: string) => new Date(`${s}T12:00:00Z`);
const now = d("2026-11-04"); // a Wednesday; its week starts Monday Nov 2
const app = (o = {}) => ({
  status: "ACTIVE", migrationStatus: "MIGRATION", createdAt: d("2026-10-20"), updatedAt: d("2026-10-20"),
  cleanupStartedAt: null, adoptionEndedAt: null, archivedAt: null, firstRepoActivity: null, ...o,
});
const repo = (status: string, ...history: [string, string][]) => ({ status, history: history.map(([s, at]) => ({ status: s, changedAt: d(at) })) });

test("nothing to show without data", () => assert.deepEqual(weeklyProgress([], [], now), []));

test("one point per Monday-start week, with no gaps", () => {
  const points = weeklyProgress([app({ createdAt: d("2026-10-14") })], [], now);
  assert.deepEqual(points.map((p) => p.week), ["2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02"]);
});

test("a pipeline counts from its first history, as adopted from when it was", () => {
  const points = weeklyProgress([], [repo("ADOPTED", ["NOT_STARTED", "2026-10-20"], ["ADOPTED", "2026-10-28"]), repo("MIGRATING", ["NOT_STARTED", "2026-10-29"], ["MIGRATING", "2026-10-30"])], now);
  assert.deepEqual(points.map((p) => [p.pipelinesDone, p.pipelinesTotal, p.pipelinesPercent]), [[0, 1, 0], [1, 2, 50], [1, 2, 50]]);
});

test("migrated counts everything from Migrated onward, including adopted", () => {
  const points = weeklyProgress(
    [],
    [
      repo("ADOPTED", ["MIGRATED", "2026-10-20"], ["ADOPTED", "2026-10-28"]),
      repo("VALIDATING", ["MIGRATING", "2026-10-20"], ["VALIDATING", "2026-10-28"]),
      repo("MIGRATING", ["MIGRATING", "2026-10-20"]),
      repo("ARCHIVED", ["MIGRATED", "2026-10-20"], ["ARCHIVED", "2026-10-28"]),
    ],
    now
  );
  assert.deepEqual(points.map((p) => [p.pipelinesMigrated, p.pipelinesDone, p.pipelinesTotal]), [[2, 0, 4], [2, 1, 3], [2, 1, 3]]);
  assert.equal(points[2].pipelinesMigratedPercent, 67);
});

test("archived pipelines leave the total from that week", () => {
  const points = weeklyProgress([], [repo("ARCHIVED", ["NOT_STARTED", "2026-10-20"], ["ARCHIVED", "2026-10-28"]), repo("ADOPTED", ["ADOPTED", "2026-10-20"])], now);
  assert.deepEqual(points.map((p) => [p.pipelinesDone, p.pipelinesTotal]), [[1, 2], [1, 1], [1, 1]]);
});

test("going backward lowers progress in that week", () => {
  const points = weeklyProgress([], [repo("MIGRATING", ["ADOPTED", "2026-10-20"], ["MIGRATING", "2026-10-28"])], now);
  assert.deepEqual(points.map((p) => p.pipelinesPercent), [100, 0, 0]);
});

test("the latest point uses current status", () => {
  const points = weeklyProgress([], [repo("ADOPTED", ["NOT_STARTED", "2026-10-20"])], now);
  assert.deepEqual(points.map((p) => p.pipelinesPercent), [0, 0, 100]);
});

test("applications count as complete from their completion date", () => {
  const points = weeklyProgress([app({ migrationStatus: "COMPLETE", adoptionEndedAt: d("2026-10-28") }), app()], [], now);
  assert.deepEqual(points.map((p) => [p.applicationsDone, p.applicationsTotal, p.applicationsPercent]), [[0, 2, 0], [1, 2, 50], [1, 2, 50]]);
});

test("an override to Complete uses its last update", () => {
  const points = weeklyProgress([app({ migrationStatus: "COMPLETE", updatedAt: d("2026-11-03") })], [], now);
  assert.deepEqual(points.map((p) => p.applicationsDone), [0, 0, 1]);
});

test("archived applications count until archived", () => {
  const points = weeklyProgress([app({ status: "ARCHIVED", archivedAt: d("2026-10-28") }), app()], [], now);
  assert.deepEqual(points.map((p) => p.applicationsTotal), [2, 1, 1]);
});

test("imported history can start before the application was created", () => {
  const points = weeklyProgress([app({ createdAt: d("2026-11-03"), firstRepoActivity: d("2026-10-20") })], [], now);
  assert.equal(points[0].week, "2026-10-19");
  assert.equal(points[0].applicationsTotal, 1);
});
