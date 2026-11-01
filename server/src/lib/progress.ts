import { RepoStatus } from "@prisma/client";

const STATUS_CREDIT: Record<Exclude<RepoStatus, "ARCHIVED">, number> = {
  NOT_STARTED: 0,
  MIGRATING: 25,
  MIGRATED: 50,
  VALIDATING: 65,
  VALIDATED: 80,
  ADOPTED: 100,
};

// Average credit across active repos. Archived repos are left out entirely.
export function applicationProgressPercent(repos: { status: RepoStatus }[]): number {
  const active = repos.filter((r) => r.status !== "ARCHIVED");
  if (active.length === 0) return 0;
  const total = active.reduce((sum, r) => sum + STATUS_CREDIT[r.status as Exclude<RepoStatus, "ARCHIVED">], 0);
  return Math.round(total / active.length);
}
