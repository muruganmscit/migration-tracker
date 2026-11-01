import { createElement } from "react";

// Design tokens: solid panels on a plain page background, with indigo accents and tinted status pills.
// Shared colours are CSS variables (index.css).

export const card = "panel rounded-3xl p-6 mb-6";
export const statCard = "panel panel-lift rounded-3xl p-5";
export const tile = "bg-slate-50 border border-edge rounded-2xl p-5";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2";
export const btn = `cursor-pointer inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-indigo-600 to-violet-600 shadow-md shadow-indigo-500/25 hover:shadow-lg hover:shadow-indigo-500/35 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition ${focusRing}`;
export const btnSecondary = `cursor-pointer inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium bg-surface text-slate-700 border border-slate-500/40 shadow-sm hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition ${focusRing}`;
export const input =
  "border border-slate-500/60 rounded-xl px-3 py-2 text-sm bg-surface text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition";
export const row = "flex gap-3 items-center flex-wrap";
export const table = "w-full border-collapse";
export const th = "text-left text-xs font-semibold uppercase tracking-wide bg-slate-50 text-slate-600 px-4 py-3 border-b border-slate-900/10 whitespace-nowrap";
export const td = "text-left text-sm text-slate-700 px-4 py-3.5 border-b border-slate-900/5";
export const tableWrap = "overflow-x-auto rounded-2xl border border-edge";

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
  UNSCHEDULED: "bg-indigo-500",
  ARCHIVED: "bg-slate-400",
};

export const WARNING_TEXT: Record<string, string> = {
  CLEANUP_NOT_FINISHED: "Repos have started migrating, but Cleanup hasn't finished.",
  DATES_OUTSIDE_WAVE: "This application's target dates fall outside its wave's dates.",
  NO_ACTIVE_REPOS: "There are no active repos. Add repos, or archive this application if it is no longer needed.",
};

export function progressBarColor(health: string): string {
  return PROGRESS_BAR_COLORS[health] ?? "bg-indigo-500";
}

// Hex equivalents of PROGRESS_BAR_COLORS, for contexts (e.g. SVG stroke) where a Tailwind
// class built from a runtime string wouldn't survive JIT purging.
const PROGRESS_HEX_COLORS: Record<string, string> = {
  ON_TRACK: "#10b981",
  AT_RISK: "#f59e0b",
  OVERDUE: "#f43f5e",
  COMPLETE: "#10b981",
  UNSCHEDULED: "#6366f1",
  ARCHIVED: "#94a3b8",
};

export function progressHexColor(health?: string): string {
  return (health && PROGRESS_HEX_COLORS[health]) ?? "#6366f1";
}

export const formatHealth = statusLabel;

export function badgeClass(value: string): string {
  const color = BADGE_COLORS[value] ?? "bg-slate-100 text-slate-600";
  return `inline-block whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-semibold ${color}`;
}

// Solid rounded-square icon chips, e.g. for stat tiles.
const ICON_BG_COLORS: Record<string, string> = {
  indigo: "from-indigo-500 to-violet-600",
  emerald: "from-emerald-400 to-teal-600",
  rose: "from-rose-400 to-pink-600",
  amber: "from-amber-400 to-orange-500",
  sky: "from-sky-400 to-blue-600",
  fuchsia: "from-fuchsia-500 to-purple-600",
  slate: "from-slate-400 to-slate-500",
};

export function iconBadge(color: keyof typeof ICON_BG_COLORS): string {
  return `flex items-center justify-center w-11 h-11 rounded-2xl text-white shadow-md bg-gradient-to-br ${ICON_BG_COLORS[color]}`;
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
