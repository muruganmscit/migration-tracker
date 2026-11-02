// API tests: every route against a real test database, with mail going to the local Mailpit only.
import { clientDist, days, resetDb } from "../test/helpers";
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../lib/prisma";

const api = request(app);
const csv = (rows: string[]) => Buffer.from(rows.join("\n") + "\n");

async function createApp(appId: string, extra: Record<string, unknown> = {}) {
  const res = await api.post("/api/applications").send({ appId, name: appId, owner: "Pat", teamContact: "t@example.com", wave: 2, ...extra });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.id as number;
}
async function addRepo(appId: number, name: string) {
  const res = await api.post(`/api/applications/${appId}/repos`).send({ name, sourceUrl: `https://g/${name}` });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.id as number;
}
const get = async (id: number) => (await api.get(`/api/applications/${id}`)).body;
const events = async (id: number) => (await api.get(`/api/applications/${id}/email-logs`)).body.map((l: any) => l.event).reverse();
async function finishCleanup(id: number) {
  await api.post(`/api/applications/${id}/cleanup/start`).expect(200);
  for (const r of (await api.get(`/api/applications/${id}/repos`)).body.data) {
    await api.patch(`/api/repos/${r.id}/cleanup-decision`).send({ decision: "KEEP" }).expect(200);
  }
  await api.post(`/api/applications/${id}/cleanup/end`).expect(200);
}

before(resetDb);
after(() => prisma.$disconnect());

test("waves list and date updates", async () => {
  await api.patch("/api/waves/2").send({ targetStartDate: days(-10), targetDate: days(30), proposedTargetDate: null }).expect(200);
  const waves = (await api.get("/api/waves").expect(200)).body;
  assert.equal(waves.length, 4);
  assert.equal(waves[1].targetDate.slice(0, 10), days(30));
  assert.equal(waves[3].health, "UNSCHEDULED");
});

test("creating applications validates input", async () => {
  await api.post("/api/applications").send({ appId: "X" }).expect(400);
  await api.post("/api/applications").send({ appId: "X", name: "x", owner: "x", teamContact: "x" }).expect(400);
  await api.post("/api/applications").send({ appId: "X", name: "x", owner: "x", teamContact: "x", wave: 2, status: "INACTIVE" }).expect(400);
  await api.post("/api/applications").send({ appId: "X", name: "x", owner: "x", teamContact: "x", wave: 9 }).expect(400);
  await api.post("/api/applications").send({ appId: "X", name: "x", owner: "x", teamContact: "x", wave: 2, targetStartDate: days(5), targetDate: days(1) }).expect(400);
  await createApp("APP-1", { targetStartDate: days(-1), targetDate: days(60) });
  const dup = await api.post("/api/applications").send({ appId: "APP-1", name: "x", owner: "x", teamContact: "x", wave: 1 }).expect(400);
  assert.match(dup.body.error, /already exists/);
});

test("listing, reading and editing applications", async () => {
  const id = (await api.get("/api/applications?search=APP-1&status=ACTIVE&wave=2").expect(200)).body.data[0].id;
  const list = await api.get("/api/applications?migrationStatus=NOT_STARTED&page=1&pageSize=5").expect(200);
  assert.ok(list.body.total >= 1);
  await api.get("/api/applications/999999").expect(404);
  await api.patch(`/api/applications/${id}`).send({ name: "Renamed", wave: 3, targetDate: days(40) }).expect(200);
  assert.equal((await get(id)).name, "Renamed");
  await api.patch(`/api/applications/${id}`).send({ wave: null }).expect(400);
  await api.patch(`/api/applications/${id}`).send({ status: "INACTIVE" }).expect(400);
  await api.patch(`/api/applications/${id}`).send({ status: "ARCHIVED" }).expect(400);
});

test("recipients", async () => {
  const id = await createApp("APP-R");
  await api.post(`/api/applications/${id}/recipients`).send({}).expect(400);
  const r = (await api.post(`/api/applications/${id}/recipients`).send({ email: "a@example.com", name: "A" }).expect(201)).body;
  assert.equal((await api.get(`/api/applications/${id}/recipients`)).body.length, 1);
  await api.delete(`/api/applications/${id}/recipients/${r.id}`).expect(204);
});

test("repos: create, list, edit and issues", async () => {
  const id = await createApp("APP-REPO");
  await api.post(`/api/applications/${id}/repos`).send({ name: "x" }).expect(400);
  await api.post("/api/applications/999999/repos").send({ name: "x", sourceUrl: "u" }).expect(404);
  const repo = await addRepo(id, "api");
  await api.post(`/api/applications/${id}/repos`).send({ name: "api", sourceUrl: "u" }).expect(400);
  const listed = await api.get(`/api/applications/${id}/repos?search=api&status=NOT_STARTED&page=1&pageSize=10`).expect(200);
  assert.equal(listed.body.total, 1);
  assert.equal((await api.get(`/api/repos/${repo}`).expect(200)).body.name, "api");
  await api.get("/api/repos/999999").expect(404);
  await api.patch("/api/repos/999999").send({ notes: "x" }).expect(404);
  await api.patch(`/api/repos/${repo}`).send({ sourceUrl: " " }).expect(400);
  await api.patch(`/api/repos/${repo}`).send({ notes: "updated", technology: "GO" }).expect(200);
  await api.post(`/api/repos/${repo}/issues`).send({}).expect(400);
  const issue = (await api.post(`/api/repos/${repo}/issues`).send({ title: "Flaky test" }).expect(201)).body;
  assert.ok((await api.patch(`/api/repos/${repo}/issues/${issue.id}`).send({ isResolved: true }).expect(200)).body.resolvedAt);
  assert.equal((await api.patch(`/api/repos/${repo}/issues/${issue.id}`).send({ isResolved: false }).expect(200)).body.resolvedAt, null);
});

test("the full workflow, with the four phase emails", async () => {
  const id = await createApp("APP-FLOW");
  await api.post(`/api/applications/${id}/recipients`).send({ email: "flow@example.com" }).expect(201);
  const [r1, r2] = [await addRepo(id, "r1"), await addRepo(id, "r2")];
  const r3 = await addRepo(id, "r3");
  await api.post(`/api/applications/${id}/send-email`).expect(400); // nothing to send before Cleanup

  await api.post(`/api/applications/${id}/cleanup/end`).expect(400);
  await api.post(`/api/applications/${id}/cleanup/start`).expect(200);
  await api.post(`/api/applications/${id}/cleanup/start`).expect(400);
  await api.patch(`/api/repos/${r1}/cleanup-decision`).send({ decision: "MAYBE" }).expect(400);
  await api.patch(`/api/repos/${r3}/cleanup-decision`).send({ decision: "ARCHIVE" }).expect(400);
  await api.patch("/api/repos/999999/cleanup-decision").send({ decision: "KEEP" }).expect(404);
  await api.patch(`/api/repos/${r1}/cleanup-decision`).send({ decision: "KEEP" }).expect(200);
  assert.match((await api.post(`/api/applications/${id}/cleanup/end`).expect(400)).body.error, /2 repos still need/);
  await api.patch(`/api/repos/${r2}/cleanup-decision`).send({ decision: "KEEP" }).expect(200);
  await api.patch(`/api/repos/${r3}/cleanup-decision`).send({ decision: "ARCHIVE", reason: "Unused" }).expect(200);
  await api.patch(`/api/repos/${r3}/cleanup-decision`).send({ decision: null }).expect(200);
  await api.patch(`/api/repos/${r3}/cleanup-decision`).send({ decision: "ARCHIVE", reason: "Unused" }).expect(200);
  await api.post(`/api/applications/${id}/cleanup/end`).expect(200);
  await api.post(`/api/applications/${id}/cleanup/end`).expect(400);
  await api.patch(`/api/repos/${r1}/cleanup-decision`).send({ decision: "KEEP" }).expect(400); // Cleanup is over
  assert.equal((await api.get(`/api/repos/${r3}`)).body.status, "ARCHIVED");

  await api.patch(`/api/repos/${r1}`).send({ status: "MIGRATING" }).expect(200);
  assert.equal((await get(id)).migrationStatus, "MIGRATION");
  await api.post(`/api/applications/${id}/send-email`).expect(200);
  await api.patch(`/api/repos/${r1}`).send({ status: "NOT_STARTED" }).expect(400); // backward needs a reason
  await api.patch(`/api/repos/${r1}`).send({ status: "NOT_STARTED", statusReason: "Redo" }).expect(200);

  const bulk = await api.post("/api/repos/bulk-status").send({ ids: [r1, r2, r3, 999999], status: "VALIDATING" }).expect(200);
  assert.deepEqual(bulk.body.results.map((x: any) => x.outcome), ["updated", "updated", "failed", "failed"]);
  await api.post("/api/repos/bulk-status").send({ ids: [r1], status: "NOPE" }).expect(400);
  await api.post("/api/repos/bulk-status").send({ ids: [], status: "ADOPTED" }).expect(400);
  await api.post("/api/repos/bulk-status").send({ ids: [r1, r2], status: "ADOPTED" }).expect(200);
  const unchanged = await api.post("/api/repos/bulk-status").send({ ids: [r1], status: "ADOPTED" }).expect(200);
  assert.equal(unchanged.body.results[0].outcome, "unchanged");

  const done = await get(id);
  assert.equal(done.migrationStatus, "COMPLETE");
  assert.equal(done.health, "COMPLETE");
  await api.post(`/api/applications/${id}/send-email`).expect(200);
  assert.deepEqual((await events(id)).slice(0, 4), ["CLEANUP_STARTED", "MIGRATION_STARTED", "MIGRATION_STARTED", "VALIDATION_STARTED"]);
  assert.ok((await events(id)).includes("ADOPTION_COMPLETED"));
  const logs = (await api.get(`/api/applications/${id}/email-logs`)).body;
  assert.ok(logs.every((l: any) => l.status === "SENT"), JSON.stringify(logs.map((l: any) => l.errorMessage)));

  await api.post(`/api/applications/${id}/mark-inactive`).send({ reason: "x" }).expect(400); // Complete
  await addRepo(id, "late"); // reopens
  assert.equal((await get(id)).migrationStatus, "MIGRATION");
});

test("overrides", async () => {
  const id = await createApp("APP-OVR");
  await api.patch(`/api/applications/${id}/migration-status`).send({ stage: "BOGUS", reason: "x" }).expect(400);
  await api.patch(`/api/applications/${id}/migration-status`).send({ stage: "VALIDATION" }).expect(400);
  await api.patch(`/api/applications/${id}/migration-status`).send({ stage: "VALIDATION", reason: "Signed off" }).expect(200);
  assert.equal((await get(id)).migrationStatusManualOverride, true);
  await api.post(`/api/applications/${id}/migration-status/reset-auto`).expect(200);
  assert.equal((await get(id)).migrationStatus, "NOT_STARTED");
  await api.patch("/api/applications/999999/migration-status").send({ stage: "VALIDATION", reason: "x" }).expect(400);
});

test("archiving and marking inactive", async () => {
  const empty = await createApp("APP-EMPTY");
  await api.post(`/api/applications/${empty}/archive`).send({}).expect(400);
  await api.post(`/api/applications/${empty}/archive`).send({ reason: "Duplicate" }).expect(200);
  await api.post(`/api/applications/${empty}/archive`).send({ reason: "again" }).expect(400);
  await api.post(`/api/applications/${empty}/send-email`).expect(200); // archived notice
  await api.patch(`/api/applications/${empty}`).send({ status: "ACTIVE" }).expect(400);
  await api.post(`/api/applications/${empty}/repos`).send({ name: "x", sourceUrl: "u" }).expect(400);
  await api.post(`/api/applications/${empty}/cleanup/start`).expect(400);
  await api.patch(`/api/applications/${empty}/migration-status`).send({ stage: "CLEANUP", reason: "x" }).expect(400);

  const busy = await createApp("APP-BUSY");
  const repo = await addRepo(busy, "a");
  await api.post(`/api/applications/${busy}/archive`).send({ reason: "x" }).expect(400); // has repos, not in Cleanup
  await api.post(`/api/applications/${busy}/mark-inactive`).send({}).expect(400);
  await api.post(`/api/applications/${busy}/mark-inactive`).send({ reason: "Decommissioned" }).expect(200);
  assert.equal((await api.get(`/api/repos/${repo}`)).body.status, "ARCHIVED");
  await api.patch(`/api/repos/${repo}`).send({ status: "MIGRATING" }).expect(400);
  await api.post("/api/repos/bulk-status").send({ ids: [repo], status: "MIGRATING" }).expect(200);
  await api.patch(`/api/repos/${repo}/cleanup-decision`).send({ decision: "KEEP" }).expect(400);
  await api.post(`/api/applications/${busy}/cleanup/end`).expect(400);
  await api.post(`/api/applications/${busy}/mark-inactive`).send({ reason: "x" }).expect(400);
  await api.post("/api/applications/999999/cleanup/start").expect(400);

  const all = await createApp("APP-ALL");
  const only = await addRepo(all, "only");
  await api.post(`/api/applications/${all}/cleanup/start`).expect(200);
  await api.patch(`/api/repos/${only}/cleanup-decision`).send({ decision: "ARCHIVE", reason: "Gone" }).expect(200);
  assert.match((await api.post(`/api/applications/${all}/cleanup/end`).expect(400)).body.error, /Archive the application/);
});

test("bulk application actions", async () => {
  const a = await createApp("APP-B1");
  const b = await createApp("APP-B2");
  await api.post("/api/applications/bulk").send({ action: "delete", ids: [a] }).expect(400);
  await api.post("/api/applications/bulk").send({ action: "startCleanup", ids: "x" }).expect(400);
  await api.post("/api/applications/bulk").send({ action: "archive", ids: [a] }).expect(400);
  const started = await api.post("/api/applications/bulk").send({ action: "startCleanup", ids: [a, b, a] }).expect(200);
  assert.equal(started.body.results.length, 2);
  const again = await api.post("/api/applications/bulk").send({ action: "startCleanup", ids: [a, 999999] }).expect(200);
  assert.ok(again.body.results.every((r: any) => !r.ok));
  const archived = await api.post("/api/applications/bulk").send({ action: "archive", ids: [b], reason: "Bulk" }).expect(200);
  assert.ok(archived.body.results[0].ok);
});

test("emails: missing template, missing recipients and the test redirect", async () => {
  const id = await createApp("APP-MAIL");
  await prisma.emailTemplate.delete({ where: { event: "CLEANUP_STARTED" } });
  await api.post(`/api/applications/${id}/cleanup/start`).expect(200);
  const [log] = (await api.get(`/api/applications/${id}/email-logs`)).body;
  assert.match(log.errorMessage, /No email template/);
  await resetTemplates();

  const other = await createApp("APP-MAIL2");
  await api.post(`/api/applications/${other}/cleanup/start`).expect(200);
  assert.match((await api.get(`/api/applications/${other}/email-logs`)).body[0].errorMessage, /No recipients/);

  process.env.EMAIL_REDIRECT_TO = "redirect@example.com";
  try {
    await api.post(`/api/applications/${other}/recipients`).send({ email: "real@example.com" }).expect(201);
    await api.post(`/api/applications/${other}/send-email`).expect(200);
    assert.equal((await api.get(`/api/applications/${other}/email-logs`)).body[0].status, "SENT");
  } finally {
    delete process.env.EMAIL_REDIRECT_TO;
  }
});

async function resetTemplates() {
  await prisma.emailTemplate.upsert({ where: { event: "CLEANUP_STARTED" }, update: {}, create: { event: "CLEANUP_STARTED", subject: "s", bodyHtml: "b" } });
}

test("email templates", async () => {
  const list = (await api.get("/api/email-templates").expect(200)).body;
  assert.deepEqual(list.map((t: any) => t.event), ["CLEANUP_STARTED", "MIGRATION_STARTED", "VALIDATION_STARTED", "ADOPTION_COMPLETED", "APPLICATION_ARCHIVED", "PHASE_OVERRIDDEN"]);
  await api.patch("/api/email-templates/NOPE").send({ subject: "x" }).expect(404);
  const saved = await api.patch("/api/email-templates/MIGRATION_STARTED").send({ subject: "New", bodyHtml: "b" }).expect(200);
  assert.equal(saved.body.subject, "New");
});

test("CSV import", async () => {
  await api.post("/api/import").expect(400);
  await api.post("/api/import").attach("files", Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]), "broken.xlsx").expect(400);
  const res = await api
    .post("/api/import")
    .attach("files", csv([
      "appId,name,owner,teamContact,status,wave,targetStartDate,targetDate,proposedTargetDate,cleanupStartedAt,cleanupEndedAt",
      `IMP-1,Imported,Pat,t@example.com,ACTIVE,2,${days(-5)},${days(20)},,${days(-4)},${days(-3)}`,
      `IMP-2,Open,Pat,t@example.com,,3,,,,${days(-2)},`,
      "IMP-3,No Wave,Pat,t@example.com,ACTIVE,,,,,,",
      "IMP-4,Bad,Pat,t@example.com,NOPE,1,,,,,",
      "IMP-5,Inactive,Pat,t@example.com,INACTIVE,1,,,,,",
      "IMP-6,Archived,Pat,t@example.com,ARCHIVED,1,,,,,",
      `IMP-7,Dates,Pat,t@example.com,ACTIVE,1,${days(9)},${days(1)},,,`,
      "IMP-8,BadDate,Pat,t@example.com,ACTIVE,1,never,,,,",
      `IMP-9,EndOnly,Pat,t@example.com,ACTIVE,1,,,,,${days(-1)}`,
      ",Missing,Pat,t@example.com,ACTIVE,1,,,,,",
    ]), "applications.csv")
    .attach("files", csv([
      "appId,repoName,sourceUrl,status,reason,cleanupDecision,technology,pipelineType,startedAt",
      `IMP-1,a,https://g/a,IN_PROGRESS,,,GO,DEFAULT_GO,${days(-2)}`,
      "IMP-1,b,https://g/b,ADOPTED,,,,,",
      "IMP-1,c,https://g/c,ARCHIVED,,,,,",
      "IMP-1,d,https://g/d,ARCHIVED,Unused,,,,",
      "IMP-2,o,https://g/o,NOT_STARTED,,KEEP,,,",
      "IMP-2,p,https://g/p,NOT_STARTED,,ARCHIVE,,,",
      "IMP-2,q,https://g/q,NOT_STARTED,Gone,ARCHIVE,,,",
      "IMP-1,e,https://g/e,NOT_STARTED,,KEEP,,,",
      "IMP-1,f,https://g/f,WRONG,,,,,",
      "IMP-1,g,https://g/g,,,,RUBY,,",
      "IMP-1,h,https://g/h,,,,,ROCKET,",
      "IMP-1,i,https://g/i,,,MAYBE,,,",
      "NOPE-1,x,https://g/x,,,,,,",
      "IMP-1,,https://g/y,,,,,,",
    ]), "repos.csv")
    .expect(200);
  assert.equal(res.body.applications.created, 2);
  assert.equal(res.body.applications.errors.length, 8);
  assert.equal(res.body.repos.created, 5);
  assert.equal(res.body.repos.errors.length, 9);
  assert.ok(Array.isArray(res.body.warnings));

  const imported = (await api.get("/api/applications?search=IMP-1")).body.data[0];
  assert.equal(imported.migrationStatus, "MIGRATION");
  assert.equal((await events(imported.id)).length, 0); // new applications send no email

  // Updating an existing application: a blank wave keeps it, and repos can be updated.
  const update = await api
    .post("/api/import")
    .attach("files", csv(["appId,name,owner,teamContact,status,wave", "IMP-1,Imported Again,Pat,t@example.com,ACTIVE,"]), "applications.csv")
    .attach("files", csv(["appId,repoName,sourceUrl,status", "IMP-1,a,https://g/a,MIGRATED", "IMP-1,b,https://g/b,ADOPTED"]), "repos.csv")
    .expect(200);
  assert.equal(update.body.applications.updated, 1);
  assert.equal(update.body.repos.updated, 2);
  assert.equal((await get(imported.id)).wave.number, 2);

  // Sheets are recognised by header too; an archived application rejects changes.
  const archived = await createApp("IMP-ARCH");
  await api.post(`/api/applications/${archived}/archive`).send({ reason: "x" }).expect(200);
  const odd = await api
    .post("/api/import")
    .attach("files", csv(["appId,repoName,sourceUrl", "IMP-ARCH,z,https://g/z"]), "sheet.csv")
    .attach("files", csv(["appId,name,owner,teamContact,status", "IMP-ARCH,x,x,x,ACTIVE"]), "list.csv")
    .attach("files", csv(["something,else", "1,2"]), "other.csv")
    .expect(200);
  assert.equal(odd.body.repos.errors.length, 1);
  assert.equal(odd.body.applications.errors.length, 1);
});

test("reports and exports", async () => {
  const summary = (await api.get("/api/reports/summary").expect(200)).body;
  assert.ok(summary.perApplication.length > 0);
  assert.ok(summary.archived.applications > 0);
  const weekly = (await api.get("/api/reports/weekly-progress").expect(200)).body;
  assert.ok(weekly.length > 0);
  assert.ok((await api.get("/api/reports/issues").expect(200)).body.length > 0);
  assert.ok((await api.get("/api/reports/emails").expect(200)).body.length > 0);
  const xlsx = await api.get("/api/reports/export?format=xlsx&search=APP&wave=2&status=ACTIVE&migrationStatus=NOT_STARTED").expect(200);
  assert.match(xlsx.headers["content-type"], /spreadsheetml/);
  const pdf = await api.get("/api/reports/export?format=pdf").expect(200);
  assert.match(pdf.headers["content-type"], /pdf/);
  await api.get("/api/reports/export").expect(200);
});

test("serves the client and deep links, but not missing files or unknown API routes", async () => {
  assert.match((await api.get("/").expect(200)).text, /portal/);
  assert.match((await api.get("/applications/12").expect(200)).text, /portal/);
  await api.get("/assets/missing.js").expect(404);
  await api.get("/api/nope").expect(404);
  assert.ok(clientDist);
});

test("unexpected errors return a 500", async () => {
  const res = await api.post("/api/applications").set("content-type", "application/json").send("{bad json");
  assert.ok(res.status === 400 || res.status === 500);
  const crash = await api.patch("/api/repos/1/issues/999999").send({ title: "x" });
  assert.equal(crash.status, 500);
});
