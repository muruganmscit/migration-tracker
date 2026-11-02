import axios from "axios";

export const api = axios.create({ baseURL: "/api" });

export type AppStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";
export type MigrationStatus = "NOT_STARTED" | "CLEANUP" | "MIGRATION" | "VALIDATION" | "ADOPTION" | "COMPLETE";
export type EmailEvent =
  | "CLEANUP_STARTED"
  | "CLEANUP_COMPLETED"
  | "MIGRATION_STARTED"
  | "MIGRATION_COMPLETED"
  | "VALIDATION_STARTED"
  | "VALIDATION_COMPLETED"
  | "ADOPTION_STARTED"
  | "ADOPTION_COMPLETED"
  | "PHASE_REOPENED"
  | "APPLICATION_ARCHIVED"
  | "PHASE_OVERRIDDEN";
export type CleanupDecision = "KEEP" | "ARCHIVE";
export type WorkflowWarning = "CLEANUP_NOT_FINISHED" | "DATES_OUTSIDE_WAVE" | "NO_ACTIVE_REPOS";
export type RepoStatus = "NOT_STARTED" | "MIGRATING" | "MIGRATED" | "VALIDATING" | "VALIDATED" | "ADOPTED" | "ARCHIVED";
export type Technology = "JAVA" | "NODEJS" | "PYTHON" | "DOTNET" | "GO" | "OTHERS";
export type PipelineType = "DEFAULT_NODE" | "DEFAULT_JAVA" | "DEFAULT_PYTHON" | "DEFAULT_DOTNET" | "DEFAULT_GO" | "CUSTOM";
export type HealthStatus = "UNSCHEDULED" | "ON_TRACK" | "AT_RISK" | "OVERDUE" | "COMPLETE" | "ARCHIVED";

export interface Wave {
  id: number;
  number: number;
  targetStartDate: string | null;
  targetDate: string | null;
  proposedTargetDate: string | null;
  applicationCount: number;
  archivedApplicationCount: number;
  avgProgressPercent: number;
  health: HealthStatus;
}

export interface Application {
  id: number;
  appId: string;
  name: string;
  owner: string;
  teamContact: string;
  status: AppStatus;
  wave: { id: number; number: number; targetStartDate: string | null; targetDate: string | null; proposedTargetDate: string | null };
  targetStartDate: string | null;
  targetDate: string | null;
  proposedTargetDate: string | null;
  progressPercent: number;
  health: HealthStatus;
  migrationStatus: MigrationStatus;
  migrationStatusManualOverride: boolean;
  overrideReason: string | null;
  cleanupStartedAt: string | null;
  cleanupEndedAt: string | null;
  migrationStartedAt: string | null;
  migrationEndedAt: string | null;
  validationStartedAt: string | null;
  validationEndedAt: string | null;
  adoptionStartedAt: string | null;
  adoptionEndedAt: string | null;
  archivedAt: string | null;
  archiveReason: string | null;
  warnings: WorkflowWarning[];
  canArchive: boolean;
  archivedRepoCount?: number;
  repoCount?: number;
  repos?: Repo[];
  recipients?: Recipient[];
  emailLogs?: EmailLog[];
}

export interface Repo {
  id: number;
  applicationId: number;
  name: string;
  sourceUrl: string;
  targetProject: string | null;
  technology: Technology | null;
  technologyVersion: string | null;
  pipelineType: PipelineType | null;
  status: RepoStatus;
  startedAt: string | null;
  completedAt: string | null;
  notes: string | null;
  cleanupDecision: CleanupDecision | null;
  cleanupReason: string | null;
  issues?: Issue[];
  statusHistory?: { id: number; status: RepoStatus; note: string | null; changedAt: string }[];
}

export interface Issue {
  id: number;
  repoId: number;
  title: string;
  description: string | null;
  isResolved: boolean;
  createdAt: string;
  resolvedAt: string | null;
}

export interface Recipient {
  id: number;
  applicationId: number;
  email: string;
  name: string | null;
}

export interface EmailLog {
  id: number;
  applicationId: number;
  event: string;
  recipients: string;
  triggeredBy: "AUTO" | "MANUAL";
  status: "SENT" | "FAILED";
  errorMessage: string | null;
  sentAt: string;
}

export interface EmailTemplate {
  id: number;
  event: EmailEvent;
  subject: string;
  bodyHtml: string;
}

export interface ApplicationInput {
  appId?: string;
  name?: string;
  owner?: string;
  teamContact?: string;
  status?: AppStatus;
  wave?: number | string;
  targetStartDate?: string | null;
  targetDate?: string | null;
  proposedTargetDate?: string | null;
}

export interface WeekProgress {
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

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const Applications = {
  list: (params?: { status?: string; migrationStatus?: string; wave?: string; search?: string; page?: number; pageSize?: number }) =>
    api.get<Paginated<Application>>("/applications", { params }).then((r) => r.data),
  get: (id: number) => api.get<Application>(`/applications/${id}`).then((r) => r.data),
  create: (data: ApplicationInput) => api.post<Application>("/applications", data).then((r) => r.data),
  update: (id: number, data: ApplicationInput) =>
    api.patch<Application>(`/applications/${id}`, data).then((r) => r.data),
  setMigrationStatus: (id: number, stage: MigrationStatus, reason: string) =>
    api.patch<Application>(`/applications/${id}/migration-status`, { stage, reason }).then((r) => r.data),
  bulk: (action: "startCleanup" | "archive", ids: number[], reason?: string) =>
    api.post<{ results: { id: number; ok: boolean; error?: string }[] }>("/applications/bulk", { action, ids, reason }).then((r) => r.data.results),
  startCleanup: (id: number) => api.post(`/applications/${id}/cleanup/start`),
  endCleanup: (id: number) => api.post(`/applications/${id}/cleanup/end`),
  markInactive: (id: number, reason: string) => api.post(`/applications/${id}/mark-inactive`, { reason }),
  archive: (id: number, reason: string) => api.post(`/applications/${id}/archive`, { reason }),
  resetAuto: (id: number) =>
    api.post<Application>(`/applications/${id}/migration-status/reset-auto`).then((r) => r.data),
  sendEmail: (id: number) => api.post(`/applications/${id}/send-email`),
  recipients: {
    list: (id: number) => api.get<Recipient[]>(`/applications/${id}/recipients`).then((r) => r.data),
    add: (id: number, data: { email: string; name?: string }) =>
      api.post<Recipient>(`/applications/${id}/recipients`, data).then((r) => r.data),
    remove: (id: number, recipientId: number) => api.delete(`/applications/${id}/recipients/${recipientId}`),
  },
  emailLogs: (id: number) => api.get<EmailLog[]>(`/applications/${id}/email-logs`).then((r) => r.data),
  repos: {
    list: (
      id: number,
      params?: { page?: number; pageSize?: number; status?: string; technology?: string; pipelineType?: string; search?: string }
    ) => api.get<Paginated<Repo>>(`/applications/${id}/repos`, { params }).then((r) => r.data),
    create: (id: number, data: Partial<Repo>) => api.post<Repo>(`/applications/${id}/repos`, data).then((r) => r.data),
  },
};

export const Repos = {
  get: (id: number) => api.get<Repo>(`/repos/${id}`).then((r) => r.data),
  update: (id: number, data: Partial<Repo> & { statusReason?: string }) => api.patch<Repo>(`/repos/${id}`, data).then((r) => r.data),
  bulkStatus: (ids: number[], status: RepoStatus, reason?: string) =>
    api
      .post<{ results: { id: number; outcome: "updated" | "unchanged" | "failed"; error?: string }[] }>("/repos/bulk-status", { ids, status, reason })
      .then((r) => r.data.results),
  setCleanupDecision: (id: number, decision: CleanupDecision | null, reason?: string) =>
    api.patch<Repo>(`/repos/${id}/cleanup-decision`, { decision, reason }).then((r) => r.data),
  issues: {
    add: (repoId: number, data: { title: string; description?: string }) =>
      api.post<Issue>(`/repos/${repoId}/issues`, data).then((r) => r.data),
    update: (repoId: number, issueId: number, data: Partial<Issue>) =>
      api.patch<Issue>(`/repos/${repoId}/issues/${issueId}`, data).then((r) => r.data),
  },
};

export const Waves = {
  list: () => api.get<Wave[]>("/waves").then((r) => r.data),
  update: (number: number, data: { targetStartDate?: string | null; targetDate?: string | null; proposedTargetDate?: string | null }) =>
    api.patch<Wave>(`/waves/${number}`, data).then((r) => r.data),
};

export const EmailTemplates = {
  list: () => api.get<EmailTemplate[]>("/email-templates").then((r) => r.data),
  update: (event: EmailEvent, data: { subject: string; bodyHtml: string }) =>
    api.patch<EmailTemplate>(`/email-templates/${event}`, data).then((r) => r.data),
};

export const Reports = {
  summary: () => api.get("/reports/summary").then((r) => r.data),
  weeklyProgress: () => api.get<WeekProgress[]>("/reports/weekly-progress").then((r) => r.data),
  issues: () => api.get("/reports/issues").then((r) => r.data),
  emails: () => api.get("/reports/emails").then((r) => r.data),
  exportUrl: (format: "xlsx" | "pdf", params?: Record<string, string | undefined>) => {
    const entries = Object.entries({ format, ...params }).filter(([, v]) => v !== undefined) as [string, string][];
    const query = new URLSearchParams(entries).toString();
    return `/api/reports/export?${query}`;
  },
};

export const Import = {
  upload: (files: File[]) => {
    const form = new FormData();
    files.forEach((file) => form.append("files", file));
    return api.post("/import", form, { headers: { "Content-Type": "multipart/form-data" } }).then((r) => r.data);
  },
};

// The server's message for a broken rule, or a fallback for anything unexpected.
export function errorMessage(err: any): string {
  return err?.response?.data?.error ?? "Something went wrong. Please try again.";
}
