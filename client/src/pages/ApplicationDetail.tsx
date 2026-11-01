import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, Archive, ArrowLeft, Building2, CheckCircle2, GitBranch, Mail, Play, Plus, Send, Undo2, X } from "lucide-react";
import StageStepper from "../components/StageStepper";
import Dialog from "../components/Dialog";
import PageHeader from "../components/PageHeader";
import EmptyState from "../components/EmptyState";
import {
  Application,
  ApplicationInput,
  Applications as ApplicationsApi,
  EmailLog,
  errorMessage,
  MigrationStatus,
  Recipient,
  Repo,
  Repos as ReposApi,
} from "../api/client";
import { badgeClass, btn, btnSecondary, card, formatHealth, iconBadge, input as inputClass, row, table, tableWrap, td, th, tile, statusLabel, WARNING_TEXT } from "../ui";
import DonutProgress from "../components/DonutProgress";
import Pagination from "../components/Pagination";

const PHASES: MigrationStatus[] = ["NOT_STARTED", "CLEANUP", "MIGRATION", "VALIDATION", "ADOPTION", "COMPLETE"];
const REPO_STATUSES = ["NOT_STARTED", "MIGRATING", "MIGRATED", "VALIDATING", "VALIDATED", "ADOPTED", "ARCHIVED"];
const PATH = REPO_STATUSES.slice(0, 6);

// Same rule as the server: going backward, archiving and un-archiving all need a reason.
function needsReason(from: string, to: string) {
  if (from === to) return false;
  if (from === "ARCHIVED" || to === "ARCHIVED") return true;
  return PATH.indexOf(to) < PATH.indexOf(from);
}
const TECHNOLOGIES = ["JAVA", "NODEJS", "PYTHON", "DOTNET", "GO", "OTHERS"];
const PIPELINE_TYPES = ["DEFAULT_NODE", "DEFAULT_JAVA", "DEFAULT_PYTHON", "DEFAULT_DOTNET", "DEFAULT_GO", "CUSTOM"];
const REPOS_PAGE_SIZE = 20;

export default function ApplicationDetail() {
  const { id } = useParams();
  const appId = Number(id);
  const [app, setApp] = useState<Application | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [reposTotal, setReposTotal] = useState(0);
  const [reposPage, setReposPage] = useState(1);
  const [reposSearch, setReposSearch] = useState("");
  const [reposStatus, setReposStatus] = useState("");
  const [reposTechnology, setReposTechnology] = useState("");
  const [reposPipelineType, setReposPipelineType] = useState("");
  const [newRecipient, setNewRecipient] = useState({ email: "", name: "" });
  const [showAddRepo, setShowAddRepo] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // Kept by id, so a selection survives moving between pages and filters.
  const [selectedRepos, setSelectedRepos] = useState<Map<number, Repo>>(new Map());
  const [showBulkStatus, setShowBulkStatus] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<{ text: string; failures: string[] } | null>(null);
  const [overridePhase, setOverridePhase] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [archiving, setArchiving] = useState(false);
  const [markingInactive, setMarkingInactive] = useState(false);
  const [archiveReason, setArchiveReason] = useState("");

  function load() {
    ApplicationsApi.get(appId).then(setApp);
    ApplicationsApi.recipients.list(appId).then(setRecipients);
    ApplicationsApi.emailLogs(appId).then(setLogs);
  }

  function loadRepos() {
    ApplicationsApi.repos
      .list(appId, {
        page: reposPage,
        pageSize: REPOS_PAGE_SIZE,
        search: reposSearch || undefined,
        status: reposStatus || undefined,
        technology: reposTechnology || undefined,
        pipelineType: reposPipelineType || undefined,
      })
      .then((r) => {
        setRepos(r.data);
        setReposTotal(r.total);
      });
  }

  useEffect(load, [appId]);
  useEffect(loadRepos, [appId, reposPage, reposSearch, reposStatus, reposTechnology, reposPipelineType]);
  useEffect(() => setReposPage(1), [reposSearch, reposStatus, reposTechnology, reposPipelineType]);

  if (!app) return <p className="text-slate-500">Loading…</p>;

  async function saveApp(fields: ApplicationInput) {
    await ApplicationsApi.update(appId, fields);
    load();
  }

  // Runs a workflow action, showing any broken rule to the user.
  async function act(run: () => Promise<unknown>) {
    setActionError(null);
    try {
      await run();
      return true;
    } catch (err) {
      setActionError(errorMessage(err));
      return false;
    } finally {
      load();
      loadRepos();
    }
  }

  async function applyOverride() {
    const ok = await act(() => ApplicationsApi.setMigrationStatus(appId, overridePhase as MigrationStatus, overrideReason));
    if (ok) {
      setOverridePhase("");
      setOverrideReason("");
    }
  }

  async function archiveApp() {
    const ok = await act(() => ApplicationsApi.archive(appId, archiveReason));
    if (ok) {
      setArchiving(false);
      setArchiveReason("");
    }
  }

  async function addRecipient() {
    if (!newRecipient.email) return;
    await ApplicationsApi.recipients.add(appId, newRecipient);
    setNewRecipient({ email: "", name: "" });
    load();
  }

  async function removeRecipient(recipientId: number) {
    await ApplicationsApi.recipients.remove(appId, recipientId);
    load();
  }

  const archived = app.status === "ARCHIVED";
  const cleanupOpen = !archived && !!app.cleanupStartedAt && !app.cleanupEndedAt;
  const refreshAll = () => {
    load();
    loadRepos();
  };
  const toggleRepo = (repo: Repo, on: boolean) => {
    const next = new Map(selectedRepos);
    on ? next.set(repo.id, repo) : next.delete(repo.id);
    setSelectedRepos(next);
  };
  const allReposOnPage = repos.length > 0 && repos.every((x) => selectedRepos.has(x.id));
  const someReposOnPage = repos.some((x) => selectedRepos.has(x.id));
  const toggleRepoPage = (on: boolean) => {
    const next = new Map(selectedRepos);
    repos.forEach((x) => (on ? next.set(x.id, x) : next.delete(x.id)));
    setSelectedRepos(next);
  };

  return (
    <div>
      {markingInactive && (
        <MarkInactiveDialog
          app={app}
          onClose={() => setMarkingInactive(false)}
          onDone={() => {
            setMarkingInactive(false);
            refreshAll();
          }}
        />
      )}
      <PageHeader title={app.name} subtitle="Manage this application’s details, workflow, repos and who gets notified." actions={<Link to="/applications" className={`${btnSecondary} no-underline`}><ArrowLeft size={16} /> All applications</Link>} />

      <div className={card}>
        <div className="flex items-center gap-4 mb-6">
          <span className={iconBadge("indigo")}>
            <Building2 size={22} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-semibold text-slate-900 truncate">{app.name}</h3>
              <span className={badgeClass(app.status)}>{statusLabel(app.status)}</span>
              {app.wave && <span className="text-xs text-slate-400">Wave {app.wave.number}</span>}
            </div>
            <div className="text-xs text-slate-400 font-mono mt-0.5">{app.appId}</div>
          </div>
          <DonutProgress percent={app.progressPercent} health={app.health} size={64} />
        </div>

        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Identity</h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-5">
          <label className="flex flex-col gap-1.5 text-sm text-slate-500">
            App ID
            <input className={`${inputClass} w-full disabled:bg-slate-100 disabled:text-slate-500`} value={app.appId} disabled />
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-slate-500">
            Name
            <input
              className={`${inputClass} w-full`}
              value={app.name}
              onChange={(e) => setApp({ ...app, name: e.target.value })}
              onBlur={() => saveApp({ name: app.name })}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-slate-500">
            Owner
            <input
              className={`${inputClass} w-full`}
              value={app.owner}
              onChange={(e) => setApp({ ...app, owner: e.target.value })}
              onBlur={() => saveApp({ owner: app.owner })}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-slate-500">
            Team Contact
            <input
              className={`${inputClass} w-full`}
              value={app.teamContact}
              onChange={(e) => setApp({ ...app, teamContact: e.target.value })}
              onBlur={() => saveApp({ teamContact: app.teamContact })}
            />
          </label>
        </div>

        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3 mt-6 pt-5 border-t border-slate-900/5">Planning</h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-5">
          <label className="flex flex-col gap-1.5 text-sm text-slate-500">
            App Status
            <select
              className={`${inputClass} w-full disabled:bg-slate-100 disabled:text-slate-500`}
              value={app.status}
              disabled={archived}
              onChange={(e) => {
                // Inactive archives everything, so it waits for confirmation and the field stays as it is.
                if (e.target.value === "INACTIVE") setMarkingInactive(true);
              }}
            >
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE" disabled={app.migrationStatus === "COMPLETE"}>
                {app.migrationStatus === "COMPLETE" ? "Inactive (not available once Complete)" : "Inactive"}
              </option>
              {archived && <option value="ARCHIVED">Archived</option>}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-slate-500">
            Wave
            <select
              className={`${inputClass} w-full`}
              value={app.wave?.number ?? ""}
              onChange={(e) => saveApp({ wave: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">No wave</option>
              <option value="1">Wave 1</option>
              <option value="2">Wave 2</option>
              <option value="3">Wave 3</option>
              <option value="4">Wave 4</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-slate-500">
            Target Start
            <input
              type="date"
              className={`${inputClass} w-full`}
              value={app.targetStartDate?.slice(0, 10) ?? ""}
              onChange={(e) => saveApp({ targetStartDate: e.target.value || null })}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-slate-500">
            Target End
            <input
              type="date"
              className={`${inputClass} w-full`}
              value={app.targetDate?.slice(0, 10) ?? ""}
              onChange={(e) => saveApp({ targetDate: e.target.value || null })}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-slate-500">
            Proposed Target Date
            <input
              type="date"
              className={`${inputClass} w-full`}
              value={app.proposedTargetDate?.slice(0, 10) ?? ""}
              onChange={(e) => saveApp({ proposedTargetDate: e.target.value || null })}
            />
          </label>
        </div>

      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 xl:gap-x-4">
      <div className={`${card} xl:col-span-2`} data-testid="workflow">
        <h3 className="text-sm font-semibold text-slate-800 mb-1">Workflow</h3>
        <p className="text-sm text-slate-500 mb-5">
          {archived
            ? "This application was archived and will not be migrated."
            : app.migrationStatusManualOverride
              ? "Phase set by hand. It stays here until you return to automatic."
              : "Cleanup is managed here. Later phases follow the repo statuses automatically."}
        </p>

        {archived && (
          <Notice icon={Archive} tone="slate">
            <b>Archived</b>
            {app.archivedAt && ` on ${new Date(app.archivedAt).toLocaleDateString()}`}. Reason: {app.archiveReason}
          </Notice>
        )}
        {app.migrationStatusManualOverride && (
          <Notice icon={AlertTriangle} tone="amber">
            <b>Manual override.</b> Reason: {app.overrideReason}
          </Notice>
        )}
        {app.warnings.map((w) => (
          <Notice key={w} icon={AlertTriangle} tone="amber">
            {WARNING_TEXT[w]}
          </Notice>
        ))}
        {actionError && (
          <div role="alert" className="flex items-start gap-2 rounded-md bg-rose-100 text-rose-700 text-sm px-3 py-2 mb-3">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <span className="flex-1">{actionError}</span>
            <button onClick={() => setActionError(null)} aria-label="Dismiss error">
              <X size={16} />
            </button>
          </div>
        )}

        <div className="mt-2 mb-5">
          <StageStepper app={app} />
        </div>

        {!archived && (
          <>
            <div className={row}>
              {!app.cleanupStartedAt && (
                <button className={btn} onClick={() => act(() => ApplicationsApi.startCleanup(appId))}>
                  <Play size={15} /> Start Cleanup
                </button>
              )}
              {cleanupOpen && (
                <button className={btn} onClick={() => act(() => ApplicationsApi.endCleanup(appId))}>
                  <CheckCircle2 size={15} /> End Cleanup
                </button>
              )}
              {app.canArchive && (
                <button className={btnSecondary} onClick={() => setArchiving((v) => !v)}>
                  <Archive size={15} /> Archive application
                </button>
              )}
              <button className={btnSecondary} onClick={() => act(() => ApplicationsApi.sendEmail(appId))}>
                <Send size={14} /> Send email now
              </button>
              {app.migrationStatusManualOverride && (
                <button className={btnSecondary} onClick={() => act(() => ApplicationsApi.resetAuto(appId))}>
                  <Undo2 size={15} /> Return to automatic
                </button>
              )}
            </div>
            {cleanupOpen && (
              <p className="text-xs text-slate-500 mt-2">To end Cleanup, mark every repo Keep or Archive in the Repos section below. Repos marked Archive are archived when Cleanup ends.</p>
            )}

            {archiving && (
              <div className={`${tile} mt-4`}>
                <div className="text-sm font-medium text-slate-800">{app.repoCount ? `Archive this application and its ${app.repoCount} active repos?` : "Archive this application? It has no active repos."}</div>
                <p className="text-sm text-slate-500 mt-1">It will leave progress reporting, recipients will be emailed, and this can't be undone in the portal.</p>
                <div className={`${row} mt-3`}>
                  <input
                    className={`${inputClass} flex-1 min-w-[240px]`}
                    placeholder="Reason (required)"
                    aria-label="Archive reason"
                    value={archiveReason}
                    onChange={(e) => setArchiveReason(e.target.value)}
                  />
                  <button className={btn} disabled={!archiveReason.trim()} onClick={archiveApp}>
                    Confirm archive
                  </button>
                  <button className={btnSecondary} onClick={() => setArchiving(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <details className="mt-5 pt-4 border-t border-slate-900/5">
              <summary className="text-sm font-medium text-slate-700 cursor-pointer">Override the phase</summary>
              <div className={`${row} mt-3`}>
                <select className={inputClass} aria-label="Override phase" value={overridePhase} onChange={(e) => setOverridePhase(e.target.value)}>
                  <option value="">Choose a phase…</option>
                  {PHASES.map((p) => (
                    <option key={p} value={p}>
                      {statusLabel(p)}
                    </option>
                  ))}
                </select>
                <input
                  className={`${inputClass} flex-1 min-w-[240px]`}
                  placeholder="Reason (required)"
                  aria-label="Override reason"
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                />
                <button className={btnSecondary} disabled={!overridePhase || !overrideReason.trim()} onClick={applyOverride}>
                  Apply override
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-2">Recipients are emailed about the change.</p>
            </details>
          </>
        )}
      </div>
      <div className={`${card} xl:!mb-4 flex flex-col`}>
        <h3 className="text-sm font-semibold mb-4 text-slate-800">Recipients</h3>
        {recipients.length === 0 ? (
          <EmptyState icon={Mail} title="No recipients yet" description="Add at least one email address to receive notifications." />
        ) : (
          <ul className="space-y-2 mb-4 max-h-72 overflow-y-auto">
            {recipients.map((r) => (
              <li key={r.id} className="flex items-center gap-2 rounded-md bg-slate-50 border border-edge pl-3 pr-1.5 py-1.5">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-800 break-words">{r.email}</div>
                  {r.name && <div className="text-xs text-slate-500 break-words">{r.name}</div>}
                </div>
                <button
                  className="shrink-0 p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-rose-700 transition"
                  title={`Remove ${r.email}`}
                  aria-label={`Remove ${r.email}`}
                  onClick={() => removeRecipient(r.id)}
                >
                  <X size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-auto flex flex-col gap-2">
          <input
            className={`${inputClass} w-full`}
            placeholder="email"
            aria-label="Recipient email"
            value={newRecipient.email}
            onChange={(e) => setNewRecipient({ ...newRecipient, email: e.target.value })}
          />
          <input
            className={`${inputClass} w-full`}
            placeholder="name (optional)"
            aria-label="Recipient name"
            value={newRecipient.name}
            onChange={(e) => setNewRecipient({ ...newRecipient, name: e.target.value })}
          />
          <button className={btnSecondary} onClick={addRecipient}>
            Add recipient
          </button>
        </div>
      </div>
      </div>

      <div className={card}>
        <div className={`${row} justify-between`}>
          <h3 className="text-sm font-semibold text-slate-800">Repos</h3>
          {!archived && (
            <button className={btn} onClick={() => setShowAddRepo(true)}>
              <Plus size={16} /> Add repo
            </button>
          )}
        </div>
        <div className={`${row} mt-4`}>
          <input
            className={inputClass}
            placeholder="Search name"
            value={reposSearch}
            onChange={(e) => setReposSearch(e.target.value)}
          />
          <select className={inputClass} value={reposStatus} onChange={(e) => setReposStatus(e.target.value)}>
            <option value="">All statuses</option>
            {REPO_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
          <select className={inputClass} value={reposTechnology} onChange={(e) => setReposTechnology(e.target.value)}>
            <option value="">All technologies</option>
            {TECHNOLOGIES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select className={inputClass} value={reposPipelineType} onChange={(e) => setReposPipelineType(e.target.value)}>
            <option value="">All pipeline types</option>
            {PIPELINE_TYPES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        {showAddRepo && (
          <AddRepoDialog
            appId={appId}
            onClose={() => setShowAddRepo(false)}
            onAdded={() => {
              setShowAddRepo(false);
              refreshAll();
            }}
          />
        )}
        {selectedRepos.size > 0 && (
          <div role="region" aria-label="Repo bulk actions" className={`${tile} ${row} !py-3 mt-4 sticky top-4 z-10`}>
            <span className="text-sm font-medium text-slate-800">{selectedRepos.size} selected</span>
            <button className={btn} onClick={() => setShowBulkStatus(true)}>
              Update status
            </button>
            <button className="text-sm text-blue-700 underline" onClick={() => setSelectedRepos(new Map())}>
              Clear selection
            </button>
          </div>
        )}
        {showBulkStatus && (
          <BulkRepoStatusDialog
            repos={Array.from(selectedRepos.values())}
            onClose={() => setShowBulkStatus(false)}
            onDone={(message) => {
              setShowBulkStatus(false);
              setBulkMessage(message);
              setSelectedRepos(new Map());
              refreshAll();
            }}
          />
        )}
        {bulkMessage && (
          <div role="status" className="flex items-start gap-2 rounded-md bg-slate-100 text-slate-700 text-sm px-3 py-2 mt-4">
            <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
            <div className="flex-1">
              {bulkMessage.text}
              {bulkMessage.failures.length > 0 && (
                <ul className="mt-1">
                  {bulkMessage.failures.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              )}
            </div>
            <button onClick={() => setBulkMessage(null)} aria-label="Dismiss">
              <X size={16} />
            </button>
          </div>
        )}
        <div className={`${tableWrap} mt-4`}>
        <table className={table}>
          <thead>
            <tr>
              {!archived && (
                <th className={`${th} w-10 !pr-0`}>
                  <input
                    type="checkbox"
                    aria-label="Select all repos on this page"
                    className="w-4 h-4 cursor-pointer accent-blue-600 align-middle"
                    checked={allReposOnPage}
                    disabled={repos.length === 0}
                    ref={(el) => {
                      if (el) el.indeterminate = someReposOnPage && !allReposOnPage;
                    }}
                    onChange={(e) => toggleRepoPage(e.target.checked)}
                  />
                </th>
              )}
              <th className={th}>Name</th>
              <th className={th}>URL</th>
              <th className={th}>Technology</th>
              <th className={th}>Version</th>
              <th className={th}>Pipeline Type</th>
              <th className={th}>Status</th>
              {cleanupOpen && <th className={th}>Cleanup decision</th>}
              <th className={th}></th>
            </tr>
          </thead>
          <tbody>
            {repos.map((repo) => (
              <RepoRow
                key={repo.id}
                repo={repo}
                onChange={refreshAll}
                cleanupOpen={cleanupOpen}
                readOnly={archived}
                selected={selectedRepos.has(repo.id)}
                onSelect={(on) => toggleRepo(repo, on)}
              />
            ))}
          </tbody>
        </table>
        </div>
        {repos.length === 0 && (
          <EmptyState icon={GitBranch} title="No repos found" description="Add the first repo for this application, or adjust the filters above." />
        )}
        <Pagination page={reposPage} pageSize={REPOS_PAGE_SIZE} total={reposTotal} onPageChange={setReposPage} />
      </div>

      <div className={card}>
        <h3 className="text-sm font-semibold mb-5 text-slate-800">Email history</h3>
        <div className={tableWrap}>
        <table className={table}>
          <thead>
            <tr>
              <th className={th}>Event</th>
              <th className={th}>Sent At</th>
              <th className={th}>Triggered By</th>
              <th className={th}>Status</th>
              <th className={th}>Error</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td className={td}>{statusLabel(log.event)}</td>
                <td className={td}>{new Date(log.sentAt).toLocaleString()}</td>
                <td className={td}>{statusLabel(log.triggeredBy)}</td>
                <td className={td}>
                  <span className={badgeClass(log.status)}>{statusLabel(log.status)}</span>
                </td>
                <td className={`${td} text-rose-600`}>{log.errorMessage}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {logs.length === 0 && <EmptyState icon={Mail} title="No emails sent yet" description="Notifications for this application will be logged here." />}
      </div>
    </div>
  );
}

function Notice({ icon: Icon, tone, children }: { icon: typeof Archive; tone: "amber" | "slate"; children: React.ReactNode }) {
  const colors = tone === "amber" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-700";
  return (
    <div className={`flex items-start gap-2 rounded-md text-sm px-3 py-2 mb-3 ${colors}`}>
      <Icon size={16} className="shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}

function CleanupDecisionCell({ repo, onChange }: { repo: Repo; onChange: () => void }) {
  const [choosing, setChoosing] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (repo.status === "ARCHIVED") return <span className="text-slate-500 text-xs">Already archived</span>;

  async function decide(decision: "KEEP" | "ARCHIVE" | null, why?: string) {
    setError(null);
    try {
      await ReposApi.setCleanupDecision(repo.id, decision, why);
      setChoosing(false);
      setReason("");
      onChange();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (choosing) {
    return (
      <div className="flex flex-col gap-2 min-w-[200px]">
        <input className={inputClass} placeholder="Why archive? (required)" aria-label={`Reason to archive ${repo.name}`} value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className={row}>
          <button className={btn} disabled={!reason.trim()} onClick={() => decide("ARCHIVE", reason)}>
            Mark Archive
          </button>
          <button className={btnSecondary} onClick={() => setChoosing(false)}>
            Cancel
          </button>
        </div>
        {error && <span className="text-xs text-rose-700">{error}</span>}
      </div>
    );
  }
  if (repo.cleanupDecision) {
    return (
      <div className="flex items-center gap-2">
        <span className={badgeClass(repo.cleanupDecision)} title={repo.cleanupReason ?? undefined}>
          {statusLabel(repo.cleanupDecision)}
        </span>
        <button className="text-xs text-blue-700 underline" onClick={() => decide(null)}>
          Change
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      <button className={btnSecondary} onClick={() => decide("KEEP")}>
        Keep
      </button>
      <button className={btnSecondary} onClick={() => setChoosing(true)}>
        Archive
      </button>
      {error && <span className="text-xs text-rose-700">{error}</span>}
    </div>
  );
}

function AddRepoDialog({ appId, onClose, onAdded }: { appId: number; onClose: () => void; onAdded: () => void }) {
  const [form, setForm] = useState({ name: "", sourceUrl: "", targetProject: "", technology: "", technologyVersion: "", pipelineType: "", notes: "" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const canSave = !saving && !!form.name.trim() && !!form.sourceUrl.trim();
  const field = "flex flex-col gap-1.5 text-sm text-slate-500";
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [key]: e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setError(null);
    setSaving(true);
    try {
      await ApplicationsApi.repos.create(appId, {
        name: form.name.trim(),
        sourceUrl: form.sourceUrl.trim(),
        targetProject: form.targetProject.trim() || undefined,
        technology: (form.technology || undefined) as Repo["technology"] | undefined,
        technologyVersion: form.technologyVersion.trim() || undefined,
        pipelineType: (form.pipelineType || undefined) as Repo["pipelineType"] | undefined,
        notes: form.notes.trim() || undefined,
      });
      onAdded();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <Dialog title="Add repo" onClose={onClose}>
      <form onSubmit={save}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className={field}>
            Name (required)
            <input className={`${inputClass} w-full`} value={form.name} onChange={set("name")} />
          </label>
          <label className={field}>
            Target Project
            <input className={`${inputClass} w-full`} value={form.targetProject} onChange={set("targetProject")} />
          </label>
          <label className={`${field} sm:col-span-2`}>
            Source URL (required)
            <input className={`${inputClass} w-full`} value={form.sourceUrl} onChange={set("sourceUrl")} />
          </label>
          <label className={field}>
            Technology
            <select className={`${inputClass} w-full`} value={form.technology} onChange={set("technology")}>
              <option value="">—</option>
              {TECHNOLOGIES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className={field}>
            Version
            <input className={`${inputClass} w-full`} value={form.technologyVersion} onChange={set("technologyVersion")} />
          </label>
          <label className={`${field} sm:col-span-2`}>
            Pipeline Type
            <select className={`${inputClass} w-full`} value={form.pipelineType} onChange={set("pipelineType")}>
              <option value="">—</option>
              {PIPELINE_TYPES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className={`${field} sm:col-span-2`}>
            Notes
            <textarea className={`${inputClass} w-full h-20`} value={form.notes} onChange={set("notes")} />
          </label>
        </div>
        <p className="text-xs text-slate-500 mt-4">It starts as Not started. If the application has already moved past Migration, adding a repo reopens that phase.</p>
        {error && (
          <div role="alert" className="rounded-md bg-rose-100 text-rose-700 text-sm px-3 py-2 mt-4">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2 mt-5">
          <button type="button" className={btnSecondary} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={btn} disabled={!canSave}>
            {saving ? "Adding…" : "Add repo"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function EditRepoDialog({ repo, onClose, onSaved }: { repo: Repo; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState(repo);
  const [statusReason, setStatusReason] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const reasonRequired = needsReason(repo.status, form.status);
  const canSave = !saving && !!form.name.trim() && !!form.sourceUrl.trim() && (!reasonRequired || !!statusReason.trim());
  const field = "flex flex-col gap-1.5 text-sm text-slate-500";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setSaveError(null);
    setSaving(true);
    try {
      await ReposApi.update(repo.id, {
        name: form.name.trim(),
        sourceUrl: form.sourceUrl.trim(),
        targetProject: form.targetProject || null,
        technology: form.technology,
        technologyVersion: form.technologyVersion || null,
        pipelineType: form.pipelineType,
        notes: form.notes || null,
        status: form.status,
        statusReason: reasonRequired ? statusReason.trim() : undefined,
      });
      onSaved();
    } catch (err) {
      setSaveError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <Dialog title={`Edit ${repo.name}`} onClose={onClose}>
      <form onSubmit={save}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className={field}>
            Name (required)
            <input className={`${inputClass} w-full`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className={field}>
            Target Project
            <input className={`${inputClass} w-full`} value={form.targetProject ?? ""} onChange={(e) => setForm({ ...form, targetProject: e.target.value })} />
          </label>
          <label className={`${field} sm:col-span-2`}>
            Source URL (required)
            <input className={`${inputClass} w-full`} value={form.sourceUrl} onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })} />
          </label>
          <label className={field}>
            Technology
            <select
              className={`${inputClass} w-full`}
              value={form.technology ?? ""}
              onChange={(e) => setForm({ ...form, technology: (e.target.value || null) as Repo["technology"] })}
            >
              <option value="">—</option>
              {TECHNOLOGIES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className={field}>
            Version
            <input className={`${inputClass} w-full`} value={form.technologyVersion ?? ""} onChange={(e) => setForm({ ...form, technologyVersion: e.target.value })} />
          </label>
          <label className={field}>
            Pipeline Type
            <select
              className={`${inputClass} w-full`}
              value={form.pipelineType ?? ""}
              onChange={(e) => setForm({ ...form, pipelineType: (e.target.value || null) as Repo["pipelineType"] })}
            >
              <option value="">—</option>
              {PIPELINE_TYPES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className={field}>
            Status
            <select className={`${inputClass} w-full`} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Repo["status"] })}>
              {REPO_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </select>
          </label>
          {reasonRequired && (
            <label className={`${field} sm:col-span-2`}>
              Reason for this status change (required)
              <input className={`${inputClass} w-full`} value={statusReason} onChange={(e) => setStatusReason(e.target.value)} />
            </label>
          )}
          <label className={`${field} sm:col-span-2`}>
            Notes
            <textarea className={`${inputClass} w-full h-20`} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>
        </div>
        {saveError && (
          <div role="alert" className="rounded-md bg-rose-100 text-rose-700 text-sm px-3 py-2 mt-4">
            {saveError}
          </div>
        )}
        <div className="flex justify-end gap-3 mt-6">
          <button type="button" className={btnSecondary} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={btn} disabled={!canSave}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function MarkInactiveDialog({ app, onClose, onDone }: { app: Application; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const repos = app.repoCount ?? 0;

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (working || !reason.trim()) return;
    setError(null);
    setWorking(true);
    try {
      await ApplicationsApi.markInactive(app.id, reason.trim());
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setWorking(false);
    }
  }

  return (
    <Dialog title={`Mark ${app.name} inactive?`} onClose={onClose}>
      <form onSubmit={confirm} className="space-y-4">
        <p className="text-sm text-slate-700">
          This archives the application{repos > 0 ? ` and its ${repos} active ${repos === 1 ? "repo" : "repos"}` : ""}. They leave progress reporting, recipients are emailed, and this can't be undone in the portal.
        </p>
        <label className="flex flex-col gap-1.5 text-sm text-slate-500">
          Reason (required)
          <input className={`${inputClass} w-full`} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        {error && (
          <div role="alert" className="rounded-md bg-rose-100 text-rose-700 text-sm px-3 py-2">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-3">
          <button type="button" className={btnSecondary} onClick={onClose} disabled={working}>
            Cancel
          </button>
          <button type="submit" className={btn} disabled={working || !reason.trim()}>
            {working ? "Archiving…" : "Mark inactive and archive"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function BulkRepoStatusDialog({
  repos,
  onClose,
  onDone,
}: {
  repos: Repo[];
  onClose: () => void;
  onDone: (message: { text: string; failures: string[] }) => void;
}) {
  const [status, setStatus] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const changing = repos.filter((x) => x.status !== status);
  const reasonRequired = !!status && changing.some((x) => needsReason(x.status, status));
  const canConfirm = !working && !!status && changing.length > 0 && (!reasonRequired || !!reason.trim());
  const count = (n: number) => `${n} ${n === 1 ? "repo" : "repos"}`;

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (!canConfirm) return;
    setError(null);
    setWorking(true);
    try {
      const results = await ReposApi.bulkStatus(repos.map((x) => x.id), status as Repo["status"], reasonRequired ? reason.trim() : undefined);
      const updated = results.filter((x) => x.outcome === "updated").length;
      const unchanged = results.filter((x) => x.outcome === "unchanged").length;
      const nameOf = new Map(repos.map((x) => [x.id, x.name]));
      onDone({
        text: `${count(updated)} moved to ${statusLabel(status)}${unchanged ? `, ${unchanged} already there` : ""}.`,
        failures: results.filter((x) => x.outcome === "failed").map((x) => `${nameOf.get(x.id)}: ${x.error}`),
      });
    } catch (err) {
      setError(errorMessage(err));
      setWorking(false);
    }
  }

  return (
    <Dialog title={`Update status for ${count(repos.length)}`} onClose={onClose}>
      <form onSubmit={confirm} className="space-y-4">
        <ul className="text-sm text-slate-700 max-h-48 overflow-y-auto rounded-md bg-slate-50 border border-edge px-3 py-2 space-y-1">
          {repos.map((x) => (
            <li key={x.id} className="flex items-center justify-between gap-3">
              <span className="break-words min-w-0">{x.name}</span>
              <span className={badgeClass(x.status)}>{statusLabel(x.status)}</span>
            </li>
          ))}
        </ul>
        <label className="flex flex-col gap-1.5 text-sm text-slate-500">
          New status
          <select className={`${inputClass} w-full`} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Choose a status…</option>
            {REPO_STATUSES.map((x) => (
              <option key={x} value={x}>
                {statusLabel(x)}
              </option>
            ))}
          </select>
        </label>
        {status && changing.length === 0 && <p className="text-sm text-slate-500">All selected repos already have this status.</p>}
        {reasonRequired && (
          <label className="flex flex-col gap-1.5 text-sm text-slate-500">
            Reason, saved on every repo changed (required for archiving or moving backward)
            <input className={`${inputClass} w-full`} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
        )}
        <p className="text-xs text-slate-500">If this starts a new phase or completes the application, recipients get one email for the whole update.</p>
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
            {working ? "Updating…" : status ? `Update ${count(changing.length)}` : "Update"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function RepoRow({
  repo,
  onChange,
  cleanupOpen,
  readOnly,
  selected,
  onSelect,
}: {
  repo: Repo;
  onChange: () => void;
  cleanupOpen: boolean;
  readOnly: boolean;
  selected: boolean;
  onSelect: (on: boolean) => void;
}) {
  const [edit, setEdit] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const [newIssue, setNewIssue] = useState("");
  async function addIssue() {
    if (!newIssue.trim()) return;
    await ReposApi.issues.add(repo.id, { title: newIssue });
    setNewIssue("");
    onChange();
  }

  async function resolveIssue(issueId: number, isResolved: boolean) {
    await ReposApi.issues.update(repo.id, issueId, { isResolved });
    onChange();
  }

  return (
    <>
      {edit && (
        <EditRepoDialog
          repo={repo}
          onClose={() => setEdit(false)}
          onSaved={() => {
            setEdit(false);
            onChange();
          }}
        />
      )}
      <tr className="border-b border-slate-900/5">
        {!readOnly && (
          <td className={`${td} !pr-0`}>
            <input
              type="checkbox"
              aria-label={`Select ${repo.name}`}
              className="w-4 h-4 cursor-pointer accent-blue-600 align-middle"
              checked={selected}
              onChange={(e) => onSelect(e.target.checked)}
            />
          </td>
        )}
        <td className={td}>
          <b className="text-slate-900 font-medium whitespace-nowrap">{repo.name}</b>
        </td>
        <td className={`${td} text-slate-500 max-w-[240px] truncate`} title={repo.sourceUrl}>
          {repo.sourceUrl}
        </td>
        <td className={td}>{repo.technology ?? <span className="text-slate-400">—</span>}</td>
        <td className={td}>{repo.technologyVersion ?? <span className="text-slate-400">—</span>}</td>
        <td className={td}>{repo.pipelineType ?? <span className="text-slate-400">—</span>}</td>
        <td className={td}>
          <span className={badgeClass(repo.status)}>{statusLabel(repo.status)}</span>
        </td>
        {cleanupOpen && (
          <td className={td}>
            <CleanupDecisionCell repo={repo} onChange={onChange} />
          </td>
        )}
        <td className={td}>
          <div className="flex gap-2 items-center justify-end">
            {!readOnly && (
              <button className={btnSecondary} onClick={() => setEdit(true)}>
                Edit
              </button>
            )}
            <button className={btnSecondary} onClick={() => setShowIssues((v) => !v)}>
              Issues ({repo.issues?.filter((i) => !i.isResolved).length ?? 0})
            </button>
          </div>
        </td>
      </tr>
      {showIssues && (
        <tr className="border-b border-slate-900/5">
          <td className={td} colSpan={(cleanupOpen ? 8 : 7) + (readOnly ? 0 : 1)}>
            <div className={tile}>
              {repo.issues?.map((issue) => (
                <div key={issue.id} className={row}>
                  <span className={issue.isResolved ? "line-through text-slate-400" : "text-slate-800"}>{issue.title}</span>
                  <button className={btnSecondary} onClick={() => resolveIssue(issue.id, !issue.isResolved)}>
                    {issue.isResolved ? "Reopen" : "Resolve"}
                  </button>
                </div>
              ))}
              <div className={`${row} mt-2`}>
                <input className={inputClass} placeholder="New issue" value={newIssue} onChange={(e) => setNewIssue(e.target.value)} />
                <button className={btn} onClick={addIssue}>
                  Add issue
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
