import { EmailEvent, MigrationStatus, TriggerType } from "@prisma/client";
import { prisma } from "./prisma";
import { sendMail } from "./mailer";
import { REPO_STATUS_ORDER, activeRepos } from "./workflow";

function renderTemplate(text: string, context: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_match, key) => context[key] ?? "");
}

const phaseLabel = (phase: MigrationStatus | null | undefined) =>
  phase ? phase.charAt(0) + phase.slice(1).toLowerCase().replace(/_/g, " ") : "";

// Lowest repo status that counts as having reached a phase.
const PHASE_MIN_STATUS: Partial<Record<MigrationStatus, (typeof REPO_STATUS_ORDER)[number]>> = {
  MIGRATION: "MIGRATING",
  VALIDATION: "VALIDATING",
  ADOPTION: "ADOPTED",
  COMPLETE: "ADOPTED",
};

async function buildContext(applicationId: number, stage: MigrationStatus, previousStage: MigrationStatus | null, reason: string | null) {
  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    include: { repos: true },
  });
  const active = activeRepos(application.repos);
  const minStatus = PHASE_MIN_STATUS[stage];
  const reposAtStage = minStatus
    ? active.filter((repo) => REPO_STATUS_ORDER.indexOf(repo.status) >= REPO_STATUS_ORDER.indexOf(minStatus)).length
    : active.length;

  return {
    appId: application.appId,
    appName: application.name,
    owner: application.owner,
    teamContact: application.teamContact,
    stage: phaseLabel(stage),
    previousStage: phaseLabel(previousStage),
    repoCount: String(active.length),
    reposAtStage: String(reposAtStage),
    reason: reason ?? "",
    changeDate: new Date().toISOString(),
    portalLink: `${process.env.APP_BASE_URL ?? ""}/applications/${application.id}`,
  } as Record<string, string>;
}

export async function sendEventEmail(
  applicationId: number,
  event: EmailEvent,
  triggeredBy: TriggerType,
  details: { stage: MigrationStatus; previousStage?: MigrationStatus | null; reason?: string }
) {
  const [template, recipients] = await Promise.all([
    prisma.emailTemplate.findUnique({ where: { event } }),
    prisma.recipient.findMany({ where: { applicationId } }),
  ]);
  const recipientEmails = recipients.map((r) => r.email).join(", ");
  const log = (status: "SENT" | "FAILED", errorMessage?: string) =>
    prisma.emailLog.create({ data: { applicationId, event, recipients: recipientEmails, triggeredBy, status, errorMessage } });

  if (!template) {
    await log("FAILED", `No email template configured for ${event}`);
    return;
  }

  const context = await buildContext(applicationId, details.stage, details.previousStage ?? null, details.reason ?? null);
  try {
    await sendMail(recipients.map((r) => r.email), renderTemplate(template.subject, context), renderTemplate(template.bodyHtml, context));
    await log("SENT");
  } catch (err) {
    await log("FAILED", err instanceof Error ? err.message : String(err));
  }
}

// The event that describes where an application is right now, for "Send email now".
export function currentEvent(app: { status: string; migrationStatus: MigrationStatus }): EmailEvent | null {
  if (app.status === "ARCHIVED") return "APPLICATION_ARCHIVED";
  const map: Record<MigrationStatus, EmailEvent | null> = {
    NOT_STARTED: null,
    CLEANUP: "CLEANUP_STARTED",
    MIGRATION: "MIGRATION_STARTED",
    VALIDATION: "VALIDATION_STARTED",
    ADOPTION: null,
    COMPLETE: "ADOPTION_COMPLETED",
  };
  return map[app.migrationStatus];
}
