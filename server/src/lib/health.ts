export type HealthStatus = "UNSCHEDULED" | "ON_TRACK" | "AT_RISK" | "OVERDUE" | "COMPLETE" | "ARCHIVED";

const AT_RISK_WINDOW_DAYS = 14;
const AT_RISK_PROGRESS_THRESHOLD = 80;

export function computeHealth(input: {
  archived?: boolean;
  complete: boolean;
  progressPercent: number;
  targetStartDate: Date | null;
  targetDate: Date | null;
  cleanupStarted: boolean;
}): HealthStatus {
  if (input.archived) return "ARCHIVED";
  if (input.complete) return "COMPLETE";
  if (!input.targetDate) return "UNSCHEDULED";

  const now = Date.now();
  const daysRemaining = Math.ceil((input.targetDate.getTime() - now) / (1000 * 60 * 60 * 24));
  if (daysRemaining < 0) return "OVERDUE";
  if (input.targetStartDate && input.targetStartDate.getTime() < now && !input.cleanupStarted) return "AT_RISK";
  if (daysRemaining <= AT_RISK_WINDOW_DAYS && input.progressPercent < AT_RISK_PROGRESS_THRESHOLD) return "AT_RISK";
  return "ON_TRACK";
}
