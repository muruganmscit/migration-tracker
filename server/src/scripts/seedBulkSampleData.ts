import { PrismaClient, AppStatus, RepoStatus } from "@prisma/client";

const prisma = new PrismaClient();

const APP_COUNT = 100;
const REPOS_PER_APP = 100; // 100 x 100 = 10,000 repos

const OWNERS = [
  "Alice Smith", "Bob Jones", "Carol Lee", "Dana Kim", "Ravi Patel", "Emily Chen",
  "Tom Walsh", "Priya Sharma", "James Okafor", "Lena Fischer", "Noah Kim", "Sofia Rossi",
  "David Okoye", "Grace Liu", "Hector Diaz", "Maria Gonzalez",
];
const TEAMS = ["platform", "payments", "data", "identity", "growth", "core", "mobile", "infra"];
const APP_STATUSES: AppStatus[] = ["ACTIVE"];
const REPO_STATUSES: RepoStatus[] = ["NOT_STARTED", "MIGRATING", "MIGRATED", "VALIDATING", "VALIDATED", "ADOPTED", "ARCHIVED"];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomDate(daysFromNowMin: number, daysFromNowMax: number): Date {
  const days = daysFromNowMin + Math.random() * (daysFromNowMax - daysFromNowMin);
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

async function main() {
  console.log("Clearing existing application data (cascades to repos, issues, recipients, email logs)...");
  const deleted = await prisma.application.deleteMany({});
  console.log(`Deleted ${deleted.count} applications and all dependent rows.`);

  console.log("Resetting wave target dates...");
  await prisma.wave.updateMany({ data: { targetDate: null, proposedTargetDate: null } });

  console.log(`Creating ${APP_COUNT} applications...`);
  const waves = await prisma.wave.findMany({ orderBy: { number: "asc" } });
  const appIds: number[] = [];

  for (let i = 1; i <= APP_COUNT; i++) {
    const team = pick(TEAMS);
    const wave = waves[Math.floor((i - 1) / (APP_COUNT / waves.length))] ?? pick(waves);
    const app = await prisma.application.create({
      data: {
        appId: `APP-${1000 + i}`,
        name: `${team.charAt(0).toUpperCase()}${team.slice(1)} Service ${i}`,
        owner: pick(OWNERS),
        teamContact: `${team}-team@example.com`,
        status: pick(APP_STATUSES),
        waveId: wave.id,
        cleanupStartedAt: new Date(),
        cleanupEndedAt: new Date(),
        targetDate: Math.random() > 0.15 ? randomDate(-60, 240) : null,
        proposedTargetDate: Math.random() > 0.3 ? randomDate(-90, 200) : null,
      },
    });
    appIds.push(app.id);
    if (i % 20 === 0) console.log(`  ...${i}/${APP_COUNT} applications created`);
  }

  console.log(`Creating ${APP_COUNT * REPOS_PER_APP} repos in batches...`);
  let totalRepos = 0;
  for (const applicationId of appIds) {
    const batch = Array.from({ length: REPOS_PER_APP }, (_, j) => ({
      applicationId,
      name: `repo-${applicationId}-${j + 1}`,
      sourceUrl: `https://github.com/example/repo-${applicationId}-${j + 1}`,
      targetProject: `harness-proj-${applicationId}`,
      status: pick(REPO_STATUSES),
    }));
    await prisma.repo.createMany({ data: batch });
    totalRepos += batch.length;
  }
  console.log(`Created ${totalRepos} repos.`);

  console.log("Computing derived migrationStatus for all applications (no emails sent for bulk seed data)...");
  const { derivePhase } = await import("../lib/workflow");
  const now = new Date();
  let done = 0;
  for (const applicationId of appIds) {
    const repos = await prisma.repo.findMany({ where: { applicationId }, select: { status: true } });
    const migrationStatus = derivePhase({ cleanupStartedAt: now, cleanupEndedAt: now }, repos);
    await prisma.application.update({ where: { id: applicationId }, data: { migrationStatus } });
    done++;
    if (done % 20 === 0) console.log(`  ...${done}/${appIds.length} computed`);
  }

  console.log("Done.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
