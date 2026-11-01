import { Check, Lock } from "lucide-react";
import { Application } from "../api/client";
import { statusLabel } from "../ui";

const PHASES: { key: Application["migrationStatus"]; start?: keyof Application; end?: keyof Application }[] = [
  { key: "NOT_STARTED" },
  { key: "CLEANUP", start: "cleanupStartedAt", end: "cleanupEndedAt" },
  { key: "MIGRATION", start: "migrationStartedAt", end: "migrationEndedAt" },
  { key: "VALIDATION", start: "validationStartedAt", end: "validationEndedAt" },
  { key: "ADOPTION", start: "adoptionStartedAt", end: "adoptionEndedAt" },
  { key: "COMPLETE" },
];

const shortDate = (value: unknown) =>
  typeof value === "string" ? new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : null;

export default function StageStepper({ app }: { app: Application }) {
  const currentIndex = PHASES.findIndex((p) => p.key === app.migrationStatus);
  const archived = app.status === "ARCHIVED";
  return (
    <ol className="flex items-start w-full overflow-x-auto pb-1">
      {PHASES.map((phase, i) => {
        const done = !archived && i < currentIndex;
        const active = i === currentIndex;
        const finished = active && phase.key === "COMPLETE";
        const started = phase.start && shortDate(app[phase.start]);
        const ended = phase.end && shortDate(app[phase.end]);
        return (
          <li key={phase.key} className="flex-1 min-w-[96px] relative flex flex-col items-center text-center" aria-current={active ? "step" : undefined}>
            {i > 0 && <span className={`absolute top-4 right-1/2 w-full h-0.5 ${!archived && i <= currentIndex ? "bg-indigo-500" : "bg-slate-500/40"}`} />}
            <span
              className={`relative z-10 flex items-center justify-center w-8 h-8 rounded-full text-xs font-semibold ${
                active && archived
                  ? "bg-slate-500 text-white"
                  : done || active
                    ? "bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/30"
                    : "bg-surface text-slate-500 border border-slate-500/60"
              } ${active && !archived && !finished ? "ring-4 ring-indigo-500/20" : ""}`}
            >
              {active && archived ? <Lock size={14} /> : done || finished ? <Check size={15} /> : i + 1}
            </span>
            <span className={`mt-2 text-xs ${active ? "font-semibold text-slate-900" : "text-slate-500"}`}>{statusLabel(phase.key)}</span>
            {(started || ended) && (
              <span className="mt-0.5 text-[11px] text-slate-500 whitespace-nowrap">
                {started ?? "—"} → {ended ?? (archived ? "archived" : "now")}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
