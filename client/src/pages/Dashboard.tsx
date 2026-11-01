import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, Archive, Building2, CheckCircle2, GitBranch, LineChart as LineChartIcon, Upload } from "lucide-react";
import { Link } from "react-router-dom";
import { Reports, Waves, Wave, WeekProgress } from "../api/client";
import { badgeClass, card, chartAxisProps, chartGridProps, chartLegendStyle, chartTooltipStyle, CHART_COLORS, formatHealth, iconBadge, input as inputClass, tile, statusLabel, statCard, btn } from "../ui";
import ProgressBar from "../components/ProgressBar";
import DonutProgress from "../components/DonutProgress";
import PageHeader from "../components/PageHeader";
import EmptyState from "../components/EmptyState";

interface Summary {
  byAppMigrationStatus: { migrationStatus: string; count: number }[];
  perApplication: {
    appId: string;
    name: string;
    wave: number | null;
    migrationStatus: string;
    repoCount: number;
    repoCounts: Record<string, number>;
    progressPercent: number;
    health: string;
  }[];
  archived: { applications: number; repos: number };
}

const weekLabel = (week: string) => new Date(`${week}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });

const SERIES = {
  applicationsPercent: { done: "applicationsDone", total: "applicationsTotal", name: "Applications complete", color: "#6366f1" },
  pipelinesMigratedPercent: { done: "pipelinesMigrated", total: "pipelinesTotal", name: "Pipelines migrated", color: "#f59e0b" },
  pipelinesPercent: { done: "pipelinesDone", total: "pipelinesTotal", name: "Pipelines adopted", color: "#10b981" },
} as const;

const PHASES = ["NOT_STARTED", "CLEANUP", "MIGRATION", "VALIDATION", "ADOPTION", "COMPLETE"];

export default function Dashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [weekly, setWeekly] = useState<WeekProgress[]>([]);
  const [waves, setWaves] = useState<Wave[]>([]);

  function loadWaves() {
    Waves.list().then(setWaves);
  }

  useEffect(() => {
    Reports.summary().then(setSummary);
    Reports.weeklyProgress().then(setWeekly);
    loadWaves();
  }, []);

  async function saveWaveDate(number: number, field: "targetStartDate" | "targetDate" | "proposedTargetDate", value: string) {
    await Waves.update(number, { [field]: value || null });
    loadWaves();
  }


  const apps = summary?.perApplication ?? [];
  const totalApplications = apps.length;
  const totalRepos = apps.reduce((sum, a) => sum + a.repoCount, 0);
  const completedRepos = apps.reduce((sum, a) => sum + (a.repoCounts.ADOPTED ?? 0), 0);
  const completedCount = apps.filter((a) => a.health === "COMPLETE").length;
  const atRiskCount = apps.filter((a) => a.health === "AT_RISK" || a.health === "OVERDUE").length;
  const avgProgress = apps.length ? Math.round(apps.reduce((sum, a) => sum + a.progressPercent, 0) / apps.length) : 0;

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="A live overview of how every application and pipeline is moving into Harness." />

      {summary && totalApplications === 0 && (
        <div className={`${card} !border-indigo-200 !bg-indigo-50/50`}>
          <EmptyState
            icon={Upload}
            title="No applications yet"
            description="Import your applications and pipelines from a CSV/Excel file, or add one manually, and this dashboard will fill in automatically."
            action={
              <Link to="/applications" className={`${btn} no-underline`}>
                Go to Applications
              </Link>
            }
          />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4 mb-6">
        <div className={statCard}>
          <span className={iconBadge("indigo")}>
            <Building2 size={20} />
          </span>
          <div className="mt-4 text-sm font-medium text-slate-500">Active Applications</div>
          <div className="text-3xl font-bold text-slate-900 mt-1 tabular-nums">
            {completedCount}
            <span className="text-lg font-semibold text-slate-500"> / {totalApplications}</span>
          </div>
          <div className="text-xs text-slate-500 mt-1">completed / total</div>
        </div>
        <div className={statCard}>
          <span className={iconBadge("emerald")}>
            <GitBranch size={20} />
          </span>
          <div className="mt-4 text-sm text-slate-500">Active Pipelines</div>
          <div className="text-3xl font-bold text-slate-900 mt-1 tabular-nums">
            {completedRepos}
            <span className="text-lg font-semibold text-slate-500"> / {totalRepos}</span>
          </div>
          <div className="text-xs text-slate-500 mt-1">completed / total</div>
        </div>
        <div className={statCard}>
          <span className={iconBadge("sky")}>
            <CheckCircle2 size={20} />
          </span>
          <div className="mt-4 text-sm text-slate-500">Completed</div>
          <div className="text-3xl font-bold text-slate-900 mt-1 tabular-nums">{completedCount}</div>
        </div>
        <div className={statCard}>
          <span className={iconBadge("rose")}>
            <AlertTriangle size={20} />
          </span>
          <div className="mt-4 text-sm text-slate-500">At Risk / Overdue</div>
          <div className="text-3xl font-bold text-slate-900 mt-1 tabular-nums">{atRiskCount}</div>
        </div>
        <div className={statCard}>
          <span className={iconBadge("slate")}>
            <Archive size={20} />
          </span>
          <div className="mt-4 text-sm text-slate-500">Archived</div>
          <div className="text-3xl font-bold text-slate-900 mt-1 tabular-nums">{summary?.archived.applications ?? 0}</div>
          <div className="text-xs text-slate-500 mt-1 tabular-nums">apps · {summary?.archived.repos ?? 0} pipelines</div>
        </div>
        <div className={`${statCard} flex flex-col items-start gap-3`}>
          <DonutProgress percent={avgProgress} size={68} />
          <div>
            <div className="text-sm text-slate-500">Overall Progress</div>
            <div className="text-xs text-slate-400 mt-1">Active applications</div>
          </div>
        </div>
      </div>

      <div className={card}>
        <h3 className="text-base font-semibold text-slate-800">Wave progress</h3>
        <p className="text-sm text-slate-500 mb-5">Average progress of active applications. Edit the target dates inline — they save automatically.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {waves.map((wave) => (
            <div key={wave.number} className={tile}>
              <div className="flex items-center justify-between mb-3">
                <span className="font-semibold text-slate-900">Wave {wave.number}</span>
                <span className={badgeClass(wave.health)}>{formatHealth(wave.health)}</span>
              </div>
              <ProgressBar percent={wave.avgProgressPercent} health={wave.health} />
              <div className="mt-4 text-xs text-slate-500 space-y-2">
                <div className="flex justify-between items-center">
                  <span>Applications</span>
                  <span className="text-slate-700">
                    {wave.applicationCount}
                    {wave.archivedApplicationCount > 0 && ` + ${wave.archivedApplicationCount} archived`}
                  </span>
                </div>
                <label className="flex flex-col gap-1">
                  <span>Target start</span>
                  <input
                    type="date"
                    className={`${inputClass} w-full py-1 text-xs`}
                    value={wave.targetStartDate?.slice(0, 10) ?? ""}
                    onChange={(e) => saveWaveDate(wave.number, "targetStartDate", e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span>Target end</span>
                  <input
                    type="date"
                    className={`${inputClass} w-full py-1 text-xs`}
                    value={wave.targetDate?.slice(0, 10) ?? ""}
                    onChange={(e) => saveWaveDate(wave.number, "targetDate", e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span>Proposed target</span>
                  <input
                    type="date"
                    className={`${inputClass} w-full py-1 text-xs`}
                    value={wave.proposedTargetDate?.slice(0, 10) ?? ""}
                    onChange={(e) => saveWaveDate(wave.number, "proposedTargetDate", e.target.value)}
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className={card}>
          <h3 className="text-base font-semibold mb-5 text-slate-800">Active applications by phase</h3>
          <div className="space-y-4">
            {PHASES.map((stage) => {
              const count = summary?.byAppMigrationStatus.find((x) => x.migrationStatus === stage)?.count ?? 0;
              const share = totalApplications ? Math.round((count / totalApplications) * 100) : 0;
              return (
                <div key={stage}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="text-slate-700">{statusLabel(stage)}</span>
                    <span className="text-slate-500 tabular-nums">
                      <b className="font-semibold text-slate-900">{count}</b> · {share}%
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-slate-900/[0.06] overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all" style={{ width: `${share}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className={card}>
          <h3 className="text-base font-semibold text-slate-800">Weekly progress</h3>
          <p className="text-sm text-slate-500 mb-5">Share of active applications complete, and pipelines migrated and adopted, by the end of each week. Adopted pipelines also count as migrated.</p>
          {weekly.length === 0 ? (
            <EmptyState icon={LineChartIcon} title="No progress to show yet" description="Weekly progress appears here as pipelines move through the workflow." />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={weekly} margin={{ top: 5, right: 12, left: -8, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" {...chartGridProps} />
                <XAxis dataKey="week" tickFormatter={weekLabel} {...chartAxisProps} />
                <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v) => `${v}%`} {...chartAxisProps} />
                <Tooltip
                  labelFormatter={(week) => `Week of ${weekLabel(String(week))}`}
                  formatter={(value, _name, item: any) => {
                    const series = SERIES[item.dataKey as keyof typeof SERIES];
                    return [`${value}% (${item.payload[series.done]} of ${item.payload[series.total]})`, series.name];
                  }}
                  {...chartTooltipStyle}
                />
                <Legend {...chartLegendStyle} />
                {Object.entries(SERIES).map(([key, series]) => (
                  <Line key={key} type="monotone" dataKey={key} name={series.name} stroke={series.color} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
