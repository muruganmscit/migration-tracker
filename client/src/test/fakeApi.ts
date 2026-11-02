// A fake backend for the axios instance, so tests run without a server, database or email.
import MockAdapter from "axios-mock-adapter";
import { api } from "../api/client";

const iso = (d: number) => new Date(Date.now() + d * 86400000).toISOString();
const wave = (number: number) => ({ id: number, number, targetStartDate: number < 4 ? iso(-30) : null, targetDate: number < 4 ? iso(30) : null, proposedTargetDate: null });

export function makeApp(id: number, o: Record<string, unknown> = {}) {
  return {
    id, appId: `APP-${id}`, name: `App ${id}`, owner: "Pat", teamContact: "t@example.com", status: "ACTIVE", wave: wave(2),
    targetStartDate: iso(-5), targetDate: iso(40), proposedTargetDate: null, progressPercent: 40, health: "ON_TRACK",
    migrationStatus: "MIGRATION", migrationStatusManualOverride: false, overrideReason: null,
    cleanupStartedAt: iso(-20), cleanupEndedAt: iso(-15), migrationStartedAt: iso(-10), migrationEndedAt: null,
    validationStartedAt: null, validationEndedAt: null, adoptionStartedAt: null, adoptionEndedAt: null,
    archivedAt: null, archiveReason: null, warnings: [], canArchive: false, repoCount: 2, archivedRepoCount: 0, ...o,
  };
}

const repo = (id: number, o: Record<string, unknown> = {}) => ({
  id, applicationId: 1, name: `repo-${id}`, sourceUrl: `https://g/${id}`, targetProject: null, technology: "GO", technologyVersion: "1.22",
  pipelineType: "DEFAULT_GO", status: "MIGRATING", startedAt: null, completedAt: null, notes: null, cleanupDecision: null, cleanupReason: null,
  issues: [{ id: 1, repoId: id, title: "Flaky", description: null, isResolved: false, createdAt: iso(-1), resolvedAt: null }], ...o,
});

export const apps: Record<number, ReturnType<typeof makeApp>> = {
  1: makeApp(1, { name: "Cleanup App", migrationStatus: "CLEANUP", cleanupEndedAt: null, canArchive: true, warnings: ["CLEANUP_NOT_FINISHED", "DATES_OUTSIDE_WAVE"] }),
  2: makeApp(2, { name: "Done App", migrationStatus: "COMPLETE", health: "COMPLETE", progressPercent: 100, adoptionEndedAt: iso(-1) }),
  3: makeApp(3, { name: "Archived App", status: "ARCHIVED", health: "ARCHIVED", migrationStatus: "CLEANUP", cleanupEndedAt: null, archivedAt: iso(-2), archiveReason: "Gone", repoCount: 0 }),
  4: makeApp(4, { name: "Override App", migrationStatus: "VALIDATION", migrationStatusManualOverride: true, overrideReason: "Signed off", cleanupStartedAt: null, cleanupEndedAt: null, warnings: ["NO_ACTIVE_REPOS"] }),
};

export let mock: MockAdapter;
// Makes the next matching request fail with this message, then succeed again.
const failures = new Map<string, string>();
export const failOnce = (method: string, url: string, error: string) => failures.set(`${method} ${url}`, error);
export const calls: { method: string; url: string; data: any }[] = [];

export function installFakeApi(opts: { empty?: boolean } = {}) {
  mock = new MockAdapter(api, { delayResponse: 0 });
  calls.length = 0;
  const record = (config: any) => calls.push({ method: config.method, url: config.url, data: config.data ? safe(config.data) : undefined });
  failures.clear();
  const ok = (body: unknown = {}) => (config: any): [number, unknown] => {
    record(config);
    const key = `${config.method} ${config.url}`;
    const error = failures.get(key);
    if (error) {
      failures.delete(key);
      return [400, { error }];
    }
    return [200, body];
  };
  const list = Object.values(apps);

  mock.onGet("/reports/summary").reply(200, opts.empty
    ? { byAppMigrationStatus: [], perApplication: [], archived: { applications: 0, repos: 0 } }
    : {
        byAppMigrationStatus: [{ migrationStatus: "MIGRATION", count: 2 }, { migrationStatus: "COMPLETE", count: 1 }],
        perApplication: list.map((a) => ({ appId: a.appId, name: a.name, wave: 2, migrationStatus: a.migrationStatus, repoCount: 2, repoCounts: { ADOPTED: 1, MIGRATING: 1 }, progressPercent: a.progressPercent, health: a.health === "COMPLETE" ? "COMPLETE" : "AT_RISK" })),
        archived: { applications: 1, repos: 2 },
      });
  mock.onGet("/reports/weekly-progress").reply(200, opts.empty ? [] : [
    { week: "2026-10-19", applicationsDone: 0, applicationsTotal: 3, applicationsPercent: 0, pipelinesMigrated: 2, pipelinesMigratedPercent: 33, pipelinesDone: 1, pipelinesTotal: 6, pipelinesPercent: 17 },
    { week: "2026-10-26", applicationsDone: 1, applicationsTotal: 3, applicationsPercent: 33, pipelinesMigrated: 4, pipelinesMigratedPercent: 67, pipelinesDone: 3, pipelinesTotal: 6, pipelinesPercent: 50 },
  ]);
  mock.onGet("/waves").reply(200, [1, 2, 3, 4].map((n) => ({ ...wave(n), applicationCount: 2, archivedApplicationCount: n === 2 ? 1 : 0, avgProgressPercent: 50, health: n === 4 ? "UNSCHEDULED" : "ON_TRACK" })));
  mock.onPatch(/\/waves\/\d+/).reply(ok());

  mock.onGet("/applications").reply((config) => {
    record(config);
    const p = config.params ?? {};
    if (opts.empty || p.search === "zzz") return [200, { data: [], total: 0, page: 1, pageSize: 20 }];
    return [200, { data: list, total: 25, page: p.page ?? 1, pageSize: 20 }];
  });
  mock.onPost("/applications").reply((config) => {
    record(config);
    return JSON.parse(config.data).appId === "DUP" ? [400, { error: 'App ID "DUP" already exists' }] : [201, { id: 1 }];
  });
  mock.onPost("/applications/bulk").reply((config) => {
    record(config);
    const { ids } = JSON.parse(config.data);
    const { action } = JSON.parse(config.data);
    // Start Cleanup succeeds; archiving reports a refusal, so both result paths are exercised.
    return [200, { results: ids.map((id: number) => (action === "startCleanup" ? { id, ok: true } : { id, ok: false, error: "Cleanup has already started" })) }];
  });
  mock.onPost("/import").reply(ok({
    applications: { created: 1, updated: 1, errors: [{ row: 3, error: "wave is required" }] },
    repos: { created: 2, updated: 0, errors: [] },
    warnings: [{ appId: "APP-9", warning: "DATES_OUTSIDE_WAVE" }],
  }));

  mock.onGet(/\/applications\/\d+$/).reply((config) => [200, apps[Number(config.url!.split("/").pop())]]);
  mock.onGet(/\/applications\/\d+\/recipients/).reply((config) => [200, config.url!.includes("/4/") ? [] : [{ id: 7, applicationId: 1, email: "r@example.com", name: "R" }]]);
  mock.onGet(/\/applications\/\d+\/email-logs/).reply((config) => [200, config.url!.includes("/4/") ? [] : [{ id: 1, applicationId: 1, event: "CLEANUP_STARTED", recipients: "r@example.com", triggeredBy: "AUTO", status: "FAILED", errorMessage: "boom", sentAt: iso(-1) }]]);
  mock.onGet(/\/applications\/\d+\/repos/).reply((config) => {
    const empty = config.url!.includes("/4/") || config.params?.search === "zzz";
    const repos = [repo(11, { cleanupDecision: "KEEP" }), repo(12), repo(13, { status: "ARCHIVED" }), repo(14, { status: "ADOPTED", technology: null, technologyVersion: null, pipelineType: null, issues: [] })];
    return [200, { data: empty ? [] : repos, total: empty ? 0 : 25, page: config.params?.page ?? 1, pageSize: 20 }];
  });
  mock.onPost(/\/applications\/\d+\/send-email/).reply((config) => (record(config), config.url!.includes("/2/") ? [400, { error: "There is no notice for this phase" }] : [200, {}]));
  mock.onPost(/\/applications\/\d+\/repos/).reply((config) => (record(config), JSON.parse(config.data).name === "dup" ? [400, { error: "already exists" }] : [201, {}]));
  mock.onPost(/\/applications\/\d+\/(cleanup|archive|mark-inactive|migration-status|recipients)/).reply(ok());
  mock.onPatch(/\/applications\/\d+\/migration-status/).reply(ok());
  mock.onPatch(/\/applications\/\d+$/).reply(ok());
  mock.onDelete(/\/applications\/\d+\/recipients\/\d+/).reply(ok());

  mock.onPost("/repos/bulk-status").reply((config) => {
    record(config);
    const { ids } = JSON.parse(config.data);
    return [200, { results: ids.map((id: number, i: number) => ({ id, outcome: i === 0 ? "updated" : i === 1 ? "unchanged" : "failed", error: "This application is archived" })) }];
  });
  mock.onPatch(/\/repos\/\d+\/cleanup-decision/).reply(ok());
  mock.onPatch(/\/repos\/\d+\/issues\/\d+/).reply(ok());
  mock.onPost(/\/repos\/\d+\/issues/).reply(ok());
  mock.onPatch(/\/repos\/\d+$/).reply((config) => (record(config), JSON.parse(config.data).name === "bad" ? [400, { error: "A reason is required" }] : [200, {}]));

  mock.onGet("/email-templates").reply(200, [
    { id: 1, event: "CLEANUP_STARTED", subject: "Cleanup", bodyHtml: "<p>x</p>" },
    { id: 2, event: "ADOPTION_COMPLETED", subject: "Done", bodyHtml: "<p>y</p>" },
  ]);
  mock.onPatch(/\/email-templates\/\w+/).reply(ok());
}

function safe(data: unknown) {
  try {
    return typeof data === "string" ? JSON.parse(data) : data;
  } catch {
    return data;
  }
}
export const lastCall = (method: string, url: string | RegExp) =>
  [...calls].reverse().find((c) => c.method === method && (typeof url === "string" ? c.url === url : url.test(c.url)));
