import { progressBarColor } from "../ui";

export default function ProgressBar({ percent, health }: { percent: number; health?: string }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-2 rounded-full bg-slate-900/[0.07] overflow-hidden">
        <div
          className={`h-full rounded-full ${health ? progressBarColor(health) : "bg-indigo-500"} transition-all`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="text-xs text-slate-500 w-9 text-right">{clamped}%</span>
    </div>
  );
}
