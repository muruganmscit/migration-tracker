import { useState } from "react";
import { Application, Applications, errorMessage } from "../api/client";
import { btn, btnSecondary, input as inputClass } from "../ui";
import Dialog from "./Dialog";

export type BulkAction = "startCleanup" | "archive";
export type BulkResult = { action: BulkAction; done: Application[]; failed: { app: Application; error: string }[] };

export default function BulkActionDialog({
  action,
  apps,
  skipped,
  onClose,
  onDone,
}: {
  action: BulkAction;
  apps: Application[];
  skipped: number;
  onClose: () => void;
  onDone: (result: BulkResult) => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const archive = action === "archive";
  const count = `${apps.length} ${apps.length === 1 ? "application" : "applications"}`;
  const activeRepos = apps.reduce((sum, a) => sum + (a.repoCount ?? 0), 0);
  const canConfirm = !working && (!archive || !!reason.trim());

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (!canConfirm) return;
    setError(null);
    setWorking(true);
    try {
      const results = await Applications.bulk(action, apps.map((a) => a.id), archive ? reason.trim() : undefined);
      const appById = new Map(apps.map((a) => [a.id, a]));
      onDone({
        action,
        done: results.filter((r) => r.ok).map((r) => appById.get(r.id)!),
        failed: results.filter((r) => !r.ok).map((r) => ({ app: appById.get(r.id)!, error: r.error ?? "Something went wrong" })),
      });
    } catch (err) {
      setError(errorMessage(err));
      setWorking(false);
    }
  }

  return (
    <Dialog title={archive ? `Archive ${count}?` : `Start Cleanup for ${count}?`} onClose={onClose}>
      <form onSubmit={confirm} className="space-y-4">
        <ul className="text-sm text-slate-700 max-h-48 overflow-y-auto rounded-md bg-slate-50 border border-edge px-3 py-2 space-y-1">
          {apps.map((a) => (
            <li key={a.id} className="break-words">
              <span className="font-mono text-xs text-slate-500 mr-2">{a.appId}</span>
              {a.name}
            </li>
          ))}
        </ul>
        {skipped > 0 && (
          <p className="text-sm text-slate-500">
            {skipped} other selected {skipped === 1 ? "application doesn't" : "applications don't"} qualify and won't be changed.
          </p>
        )}
        {archive ? (
          <>
            <p className="text-sm text-slate-500">
              This also archives their {activeRepos} active {activeRepos === 1 ? "repo" : "repos"}. They leave progress reporting, recipients are emailed, and this can't be undone in the portal.
            </p>
            <label className="flex flex-col gap-1.5 text-sm text-slate-500">
              Reason, applied to all of them (required)
              <input className={`${inputClass} w-full`} value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
          </>
        ) : (
          <p className="text-sm text-slate-500">Recipients of each application are emailed that Cleanup has started.</p>
        )}
        {error && (
          <div role="alert" className="rounded-md bg-rose-100 text-rose-700 text-sm px-3 py-2">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-3">
          <button type="button" className={btnSecondary} onClick={onClose} disabled={working}>
            Cancel
          </button>
          <button type="submit" className={btn} disabled={!canConfirm}>
            {working ? "Working…" : archive ? `Archive ${count}` : "Start Cleanup"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
