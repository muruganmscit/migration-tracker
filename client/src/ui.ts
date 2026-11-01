import { createElement } from "react";

// Design tokens: a restrained enterprise look. Flat bordered panels on a neutral page, one blue accent,
// compact spacing, and colour reserved for status. Shared colours are CSS variables (index.css).

export const card = "panel rounded-lg p-5 mb-4";
export const statCard = "panel rounded-lg p-4";
export const tile = "bg-slate-50 border border-edge rounded-md p-4";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1";
export const btn = `cursor-pointer inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${focusRing}`;
export const btnSecondary = `cursor-pointer inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium bg-surface text-slate-700 border border-slate-500/40 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${focusRing}`;
export const input =
  "border border-slate-500/50 rounded-md px-2.5 py-1.5 text-sm bg-surface text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600 transition-colors";
export const row = "flex gap-2 items-center flex-wrap";
export const table = "w-full border-collapse";
export const th = "text-left text-xs font-semibold text-slate-600 bg-slate-50 px-3 py-2 border-b border-edge whitespace-nowrap";
export const td = "text-left text-sm text-slate-700 px-3 py-2 border-b border-slate-900/5";
export const tableWrap = "overflow-x-auto rounded-md border border-edge";

// "NOT_STARTED" -> "Not started"
export function statusLabel(value: string): string {
  const text = value.replace(/_/g, " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const BADGE_COLORS: Record<string, string> = {
  // application phase
  NOT_STARTED: "bg-slate-100 text-slate-600",
  CLEANUP: "bg-amber-100 text-amber-700",
  MIGRATION: "bg-indigo-100 text-indigo-700",
  VALIDATION: "bg-sky-100 text-sky-700",
  ADOPTION: "bg-emerald-100 text-emerald-700",
  COMPLETE: "bg-emerald-100 text-emerald-700",
  // repo status
  MIGRATING: "bg-amber-100 text-amber-700",
  MIGRATED: "bg-indigo-100 text-indigo-700",
  VALIDATING: "bg-sky-100 text-sky-700",
  VALIDATED: "bg-sky-100 text-sky-700",
  ADOPTED: "bg-emerald-100 text-emerald-700",
  ARCHIVED: "bg-rose-100 text-rose-700",
  // cleanup decision
  KEEP: "bg-emerald-100 text-emerald-700",
  ARCHIVE: "bg-rose-100 text-rose-700",
  // app status
  ACTIVE: "bg-emerald-100 text-emerald-700",
  INACTIVE: "bg-slate-100 text-slate-600",
  // email send status
  SENT: "bg-emerald-100 text-emerald-700",
  FAILED: "bg-rose-100 text-rose-700",
  // health status (waves + applications)
  ON_TRACK: "bg-emerald-100 text-emerald-700",
  AT_RISK: "bg-amber-100 text-amber-700",
  OVERDUE: "bg-rose-100 text-rose-700",
  UNSCHEDULED: "bg-slate-100 text-slate-600",
};

const PROGRESS_BAR_COLORS: Record<string, string> = {
  ON_TRACK: "bg-emerald-500",
  AT_RISK: "bg-amber-500",
  OVERDUE: "bg-rose-500",
  COMPLETE: "bg-emerald-500",
  UNSCHEDULED: "bg-blue-600",
  ARCHIVED: "bg-slate-400",
};

export const WARNING_TEXT: Record<string, string> = {
  CLEANUP_NOT_FINISHED: "Repos have started migrating, but Cleanup hasn't finished.",
  DATES_OUTSIDE_WAVE: "This application's target dates fall outside its wave's dates.",
  NO_ACTIVE_REPOS: "There are no active repos. Add repos, or archive this application if it is no longer needed.",
};

export function progressBarColor(health: string): string {
  return PROGRESS_BAR_COLORS[health] ?? "bg-blue-600";
}

// Hex equivalents of PROGRESS_BAR_COLORS, for contexts (e.g. SVG stroke) where a Tailwind
// class built from a runtime string wouldn't survive JIT purging.
const PROGRESS_HEX_COLORS: Record<string, string> = {
  ON_TRACK: "#10b981",
  AT_RISK: "#f59e0b",
  OVERDUE: "#f43f5e",
  COMPLETE: "#10b981",
  UNSCHEDULED: "#2563eb",
  ARCHIVED: "#94a3b8",
};

export function progressHexColor(health?: string): string {
  return (health && PROGRESS_HEX_COLORS[health]) ?? "#2563eb";
}

export const formatHealth = statusLabel;

export function badgeClass(value: string): string {
  const color = BADGE_COLORS[value] ?? "bg-slate-100 text-slate-600";
  return `inline-block whitespace-nowrap px-2 py-0.5 rounded text-xs font-medium ${color}`;
}

// Solid rounded-square icon chips, e.g. for stat tiles.

export function iconBadge(_color?: string): string {
  return "flex items-center justify-center w-9 h-9 rounded-md bg-slate-100 text-slate-600 shrink-0";
}

// Chart palette tuned for white cards.
export const CHART_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#0ea5e9", "#f43f5e", "#8b5cf6"];
// Chart colours come from CSS variables (index.css).
export const chartAxisProps = { stroke: "var(--chart-axis)", tick: { fill: "var(--chart-tick)", fontSize: 11 } };
export const chartGridProps = { stroke: "var(--chart-grid)" };
export const chartTooltipStyle = {
  contentStyle: { background: "var(--tooltip-bg)", border: "1px solid var(--tooltip-border)", borderRadius: 12, color: "var(--tooltip-text)", boxShadow: "0 4px 12px rgba(0,0,0,0.12)" },
  labelStyle: { color: "var(--tooltip-text)" },
  itemStyle: { color: "var(--tooltip-text)" },
};
// Series colours are too light to read as text, so only the legend swatches carry them.
export const chartLegendStyle = {
  wrapperStyle: { fontSize: 12 },
  formatter: (value: string) => createElement("span", { style: { color: "var(--chart-legend)" } }, value),
};
