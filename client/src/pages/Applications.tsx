import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Archive, Building2, CheckCircle2, Play, Plus, SearchX, Upload, X } from "lucide-react";
import { Application, Applications as ApplicationsApi } from "../api/client";
import { badgeClass, btn, btnSecondary, card, input as inputClass, row, table, td, th, statusLabel, tile, WARNING_TEXT } from "../ui";
import ProgressBar from "../components/ProgressBar";
import Pagination from "../components/Pagination";
import PageHeader from "../components/PageHeader";
import EmptyState from "../components/EmptyState";
import NewApplicationDialog from "../components/NewApplicationDialog";
import ImportDialog from "../components/ImportDialog";
import BulkActionDialog, { BulkAction, BulkResult } from "../components/BulkActionDialog";

const PAGE_SIZE = 20;

const canStartCleanup = (app: Application) => app.status !== "ARCHIVED" && !app.cleanupStartedAt;

export default function Applications() {
  const [apps, setApps] = useState<Application[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [migrationStatus, setMigrationStatus] = useState("");
  const [wave, setWave] = useState("");
  const [uploadSummary, setUploadSummary] = useState<ImportSummary | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  // Kept by id, so a selection survives moving between pages and filters.
  const [selected, setSelected] = useState<Map<number, Application>>(new Map());
  const [bulkAction, setBulkAction] = useState<BulkAction | null>(null);
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);
  const navigate = useNavigate();

  function load() {
    ApplicationsApi.list({
      search: search || undefined,
      status: status || undefined,
      migrationStatus: migrationStatus || undefined,
      wave: wave || undefined,
      page,
      pageSize: PAGE_SIZE,
    }).then((r) => {
      setApps(r.data);
      setTotal(r.total);
    });
  }

  useEffect(load, [search, status, migrationStatus, wave, page]);
  useEffect(() => setPage(1), [search, status, migrationStatus, wave]);

  function toggle(app: Application, on: boolean) {
    const next = new Map(selected);
    on ? next.set(app.id, app) : next.delete(app.id);
    setSelected(next);
  }

  const selectable = apps.filter((a) => a.status !== "ARCHIVED");
  const allOnPage = selectable.length > 0 && selectable.every((a) => selected.has(a.id));
  const someOnPage = selectable.some((a) => selected.has(a.id));

  function togglePage(on: boolean) {
    const next = new Map(selected);
    selectable.forEach((a) => (on ? next.set(a.id, a) : next.delete(a.id)));
    setSelected(next);
  }

  const selectedApps = Array.from(selected.values());
  const startable = selectedApps.filter(canStartCleanup);
  const archivable = selectedApps.filter((a) => a.canArchive);
  const bulkApps = bulkAction === "archive" ? archivable : startable;

  const hasFilters = !!(search || status || migrationStatus || wave);

  return (
    <div>
      <PageHeader title="Applications" subtitle="Every application being migrated. Click a row to manage its workflow, repos, recipients and email history."
        actions={
          <>
            <button className={btn} onClick={() => setShowCreate(true)}>
              <Plus size={16} /> New application
            </button>
            <button className={btnSecondary} onClick={() => setShowUpload(true)}>
              <Upload size={16} /> Upload CSV/Excel
            </button>
          </>
        }
      />

      <div className={`${card} ${row}`}>
        <input className={`${inputClass} flex-1 min-w-[240px]`} placeholder="Search name, app ID or owner…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All app statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="ARCHIVED">Archived</option>
        </select>
        <select className={inputClass} value={migrationStatus} onChange={(e) => setMigrationStatus(e.target.value)}>
          <option value="">All phases</option>
          <option value="NOT_STARTED">Not started</option>
          <option value="CLEANUP">Cleanup</option>
          <option value="MIGRATION">Migration</option>
          <option value="VALIDATION">Validation</option>
          <option value="ADOPTION">Adoption</option>
          <option value="COMPLETE">Complete</option>
        </select>
        <select className={inputClass} value={wave} onChange={(e) => setWave(e.target.value)}>
          <option value="">All waves</option>
          <option value="1">Wave 1</option>
          <option value="2">Wave 2</option>
          <option value="3">Wave 3</option>
          <option value="4">Wave 4</option>
        </select>
      </div>

      {selected.size > 0 && (
        <div role="region" aria-label="Bulk actions" className={`${card} ${row} sticky top-4 z-10 !py-3`}>
          <span className="text-sm font-medium text-slate-800">{selected.size} selected</span>
          <button className={btn} disabled={startable.length === 0} onClick={() => setBulkAction("startCleanup")}>
            <Play size={15} /> Start Cleanup ({startable.length})
          </button>
          <button className={btnSecondary} disabled={archivable.length === 0} onClick={() => setBulkAction("archive")}>
            <Archive size={15} /> Archive ({archivable.length})
          </button>
          <button className="text-sm text-blue-700 underline" onClick={() => setSelected(new Map())}>
            Clear selection
          </button>
          <span className="text-xs text-slate-500 w-full">
            Cleanup can start if it hasn't started yet. Archiving needs Cleanup in progress, or no active repos.
          </span>
        </div>
      )}

      {bulkAction && (
        <BulkActionDialog
          action={bulkAction}
          apps={bulkApps}
          skipped={selected.size - bulkApps.length}
          onClose={() => setBulkAction(null)}
          onDone={(result) => {
            setBulkAction(null);
            setBulkResult(result);
            setSelected(new Map());
            load();
          }}
        />
      )}

      {bulkResult && (
        <div className={card} role="status">
          <div className="flex items-start gap-3">
            {bulkResult.failed.length > 0 ? <AlertTriangle size={20} className="text-amber-600 shrink-0" /> : <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />}
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-slate-800">
                {bulkResult.action === "archive" ? "Archived" : "Cleanup started for"} {bulkResult.done.length} {bulkResult.done.length === 1 ? "application" : "applications"}
                {bulkResult.failed.length > 0 && `, ${bulkResult.failed.length} not changed`}
              </h3>
              {bulkResult.failed.length > 0 && (
                <ul className="text-sm text-slate-700 mt-2 space-y-1">
                  {bulkResult.failed.map(({ app, error }) => (
                    <li key={app.id}>
                      <span className="font-medium">{app.name}:</span> {error}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button className="text-slate-500 hover:text-slate-700" onClick={() => setBulkResult(null)} aria-label="Close result">
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      {showCreate && <NewApplicationDialog onClose={() => setShowCreate(false)} onCreated={(app) => navigate(`/applications/${app.id}`)} />}
      {showUpload && (
        <ImportDialog
          onClose={() => setShowUpload(false)}
          onImported={(summary) => {
            setShowUpload(false);
            setUploadSummary(summary);
            load();
          }}
        />
      )}

      {uploadSummary && <ImportResult summary={uploadSummary} onClose={() => setUploadSummary(null)} />}

      <div className={"panel overflow-x-auto rounded-lg"}>
      <table className={table}>
        <thead>
          <tr>
            <th className={`${th} w-10 !pr-0`}>
              <input
                type="checkbox"
                aria-label="Select all on this page"
                className="w-4 h-4 cursor-pointer accent-blue-600 align-middle"
                checked={allOnPage}
                disabled={selectable.length === 0}
                ref={(el) => {
                  if (el) el.indeterminate = someOnPage && !allOnPage;
                }}
                onChange={(e) => togglePage(e.target.checked)}
              />
            </th>
            <th className={th}>App ID</th>
            <th className={th}>Name</th>
            <th className={th}>Owner</th>
            <th className={th}>Team Contact</th>
            <th className={th}>App Status</th>
            <th className={th}>Wave</th>
            <th className={th}>Phase</th>
            <th className={th}>Progress</th>
            <th className={th}>Repos</th>
          </tr>
        </thead>
        <tbody>
          {apps.map((app) => (
            <tr key={app.id} onClick={() => navigate(`/applications/${app.id}`)} className="cursor-pointer hover:bg-slate-50">
              <td className={`${td} !pr-0 cursor-default`} onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  aria-label={`Select ${app.name}`}
                  title={app.status === "ARCHIVED" ? "Already archived" : undefined}
                  className="w-4 h-4 cursor-pointer disabled:cursor-not-allowed accent-blue-600 align-middle"
                  checked={selected.has(app.id)}
                  disabled={app.status === "ARCHIVED"}
                  onChange={(e) => toggle(app, e.target.checked)}
                />
              </td>
              <td className={`${td} font-mono text-xs text-slate-500 whitespace-nowrap`}>{app.appId}</td>
              <td className={`${td} font-medium text-slate-900 whitespace-nowrap max-w-[185px] truncate`} title={app.name}>
                {app.warnings.length > 0 && (
                  <span title={app.warnings.map((w) => WARNING_TEXT[w]).join(" ")} aria-label="Has warnings">
                    <AlertTriangle size={14} className="inline mr-1.5 -mt-0.5 text-amber-600" />
                  </span>
                )}
                {app.name}
              </td>
              <td className={td}>{app.owner}</td>
              <td className={`${td} whitespace-nowrap max-w-[150px] truncate`} title={app.teamContact}>{app.teamContact}</td>
              <td className={td}>
                <span className={badgeClass(app.status)}>{statusLabel(app.status)}</span>
              </td>
              <td className={`${td} whitespace-nowrap`}>Wave {app.wave.number}</td>
              <td className={td}>
                {app.status === "ARCHIVED" ? (
                  <span className="text-slate-400">—</span>
                ) : (
                  <span className={badgeClass(app.migrationStatus)}>{statusLabel(app.migrationStatus)}</span>
                )}
                {app.migrationStatusManualOverride && app.status !== "ARCHIVED" && <span className="ml-1.5 text-[11px] text-slate-400">manual</span>}
              </td>
              <td className={td}>
                <ProgressBar percent={app.progressPercent} health={app.health} />
              </td>
              <td className={td}>{app.repoCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {apps.length === 0 && (
        hasFilters ? (
          <EmptyState icon={SearchX} title="No applications match your filters" description="Try a different search or clear the filters." />
        ) : (
          <EmptyState
            icon={Building2}
            title="No applications yet"
            description="Upload a CSV/Excel file (Applications and Repos sheets) or add your first application manually."
            action={
              <button className={btn} onClick={() => setShowCreate(true)}>
                <Plus size={16} /> New application
              </button>
            }
          />
        )
      )}
      </div>
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
    </div>
  );
}

interface ImportCounts {
  created: number;
  updated: number;
  errors: { row: number; error: string }[];
}
interface ImportSummary {
  applications: ImportCounts;
  repos: ImportCounts;
  warnings: { appId: string; warning: string }[];
}

function ImportResult({ summary, onClose }: { summary: ImportSummary; onClose: () => void }) {
  const sections = [
    { label: "Applications", counts: summary.applications },
    { label: "Repos", counts: summary.repos },
  ];
  const errorCount = sections.reduce((sum, x) => sum + x.counts.errors.length, 0);
  const changed = sections.reduce((sum, x) => sum + x.counts.created + x.counts.updated, 0);

  return (
    <div className={card} role="status">
      <div className="flex items-start gap-3">
        {errorCount > 0 ? <AlertTriangle size={20} className="text-amber-600 shrink-0" /> : <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />}
        <div className="flex-1">
          <h3 className="font-semibold text-slate-800">
            {errorCount > 0 ? `Import finished with ${errorCount} ${errorCount === 1 ? "row" : "rows"} skipped` : changed > 0 ? "Import complete" : "Nothing was imported"}
          </h3>
          {changed === 0 && errorCount === 0 && (
            <p className="text-sm text-slate-500 mt-1">No Applications or Repos rows were recognised. Check the sheet names and column headers.</p>
          )}
        </div>
        <button className="text-slate-500 hover:text-slate-700" onClick={onClose} aria-label="Close import result">
          <X size={18} />
        </button>
      </div>
      <div className="grid sm:grid-cols-2 gap-3 mt-4">
        {sections.map(({ label, counts }) => (
          <div key={label} className={tile}>
            <div className="text-sm font-medium text-slate-700">{label}</div>
            <div className="text-sm text-slate-500 mt-1 tabular-nums">
              {counts.created} created · {counts.updated} updated · {counts.errors.length} skipped
            </div>
          </div>
        ))}
      </div>
      {summary.warnings.length > 0 && (
        <div className="mt-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Imported, but worth a look</div>
          <ul className="text-sm text-slate-700 space-y-1 max-h-48 overflow-y-auto">
            {summary.warnings.map((w) => (
              <li key={`${w.appId}-${w.warning}`}>
                <span className="font-medium">{w.appId}:</span> {WARNING_TEXT[w.warning]}
              </li>
            ))}
          </ul>
        </div>
      )}
      {errorCount > 0 && (
        <div className="mt-4 space-y-3">
          {sections
            .filter((x) => x.counts.errors.length > 0)
            .map(({ label, counts }) => (
              <div key={label}>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">{label}: rows to fix</div>
                <ul className="text-sm text-slate-700 space-y-1 max-h-48 overflow-y-auto">
                  {counts.errors.map((e) => (
                    <li key={`${label}-${e.row}`}>
                      <span className="font-medium">Row {e.row}:</span> {e.error}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
