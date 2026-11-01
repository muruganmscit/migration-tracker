import { PrismaClient, EmailEvent } from "@prisma/client";

const prisma = new PrismaClient();

const link = '<p><a href="{{portalLink}}">View in the migration portal</a></p>';
const hi = "<p>Hi {{owner}},</p>";

const defaults: Record<EmailEvent, { subject: string; bodyHtml: string }> = {
  CLEANUP_STARTED: {
    subject: "[{{appName}}] Cleanup started",
    bodyHtml: `${hi}<p>Cleanup has started for <b>{{appName}}</b> ({{appId}}) as of {{changeDate}}. Each repo will be reviewed and marked Keep or Archive.</p>${link}`,
  },
  CLEANUP_COMPLETED: {
    subject: "[{{appName}}] Cleanup complete",
    bodyHtml: `${hi}<p>Cleanup for <b>{{appName}}</b> finished on {{changeDate}}, with {{repoCount}} repos continuing to migration.</p>${link}`,
  },
  MIGRATION_STARTED: {
    subject: "[{{appName}}] Migration started",
    bodyHtml: `${hi}<p>Migration to Harness has started for <b>{{appName}}</b> as of {{changeDate}}. {{reposAtStage}} of {{repoCount}} repos have begun.</p>${link}`,
  },
  MIGRATION_COMPLETED: {
    subject: "[{{appName}}] Migration complete",
    bodyHtml: `${hi}<p>All {{repoCount}} repos of <b>{{appName}}</b> are migrated as of {{changeDate}}. Please coordinate validation with {{teamContact}}.</p>${link}`,
  },
  VALIDATION_STARTED: {
    subject: "[{{appName}}] Validation started",
    bodyHtml: `${hi}<p>Validation has started for <b>{{appName}}</b> as of {{changeDate}}. {{reposAtStage}} of {{repoCount}} repos are in validation or beyond.</p>${link}`,
  },
  VALIDATION_COMPLETED: {
    subject: "[{{appName}}] Validation complete",
    bodyHtml: `${hi}<p>All {{repoCount}} repos of <b>{{appName}}</b> are validated as of {{changeDate}}.</p>${link}`,
  },
  ADOPTION_STARTED: {
    subject: "[{{appName}}] Adoption started",
    bodyHtml: `${hi}<p>Adoption has started for <b>{{appName}}</b> as of {{changeDate}}. {{reposAtStage}} of {{repoCount}} repos are adopted.</p>${link}`,
  },
  ADOPTION_COMPLETED: {
    subject: "[{{appName}}] Fully adopted on Harness",
    bodyHtml: `${hi}<p><b>{{appName}}</b> is complete as of {{changeDate}}. All {{repoCount}} repos are fully onboarded.</p>${link}`,
  },
  PHASE_REOPENED: {
    subject: "[{{appName}}] {{stage}} reopened",
    bodyHtml: `${hi}<p>The {{stage}} phase of <b>{{appName}}</b> reopened on {{changeDate}} because a repo is no longer at the required status.</p>${link}`,
  },
  APPLICATION_ARCHIVED: {
    subject: "[{{appName}}] Application archived",
    bodyHtml: `${hi}<p><b>{{appName}}</b> and its repos were archived on {{changeDate}} and will not be migrated.</p><p>Reason: {{reason}}</p>${link}`,
  },
  PHASE_OVERRIDDEN: {
    subject: "[{{appName}}] Phase set to {{stage}}",
    bodyHtml: `${hi}<p>The phase of <b>{{appName}}</b> was manually changed from {{previousStage}} to <b>{{stage}}</b> on {{changeDate}}.</p><p>Reason: {{reason}}</p>${link}`,
  },
};

async function main() {
  for (const event of Object.keys(defaults) as EmailEvent[]) {
    await prisma.emailTemplate.upsert({
      where: { event },
      update: {},
      create: { event, ...defaults[event] },
    });
  }
  console.log("Seeded email templates for all events.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
