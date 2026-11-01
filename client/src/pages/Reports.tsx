import { useEffect, useState } from "react";
import { Reports as ReportsApi } from "../api/client";
import { Download, Inbox } from "lucide-react";
import PageHeader from "../components/PageHeader";
import EmptyState from "../components/EmptyState";
import { badgeClass, btn, btnSecondary, card, input as inputClass, row, table, tableWrap, td, th, statusLabel } from "../ui";

export default function Reports() {
  const [status, setStatus] = useState("");
  const [migrationStatus, setMigrationStatus] = useState("");
  const [wave, setWave] = useState("");
  const [search, setSearch] = useState("");
  const [issues, setIssues] = useState<any[]>([]);
  const [emails, setEmails] = useState<any[]>([]);

  useEffect(() => {
    ReportsApi.issues().then(setIssues);
    ReportsApi.emails().then(setEmails);
  }, []);

  const params = {
    status: status || undefined,
    migrationStatus: migrationStatus || undefined,
    wave: wave || undefined,
    search: search || undefined,
  } as Record<string, string>;

  return (
    <div>
      <PageHeader title="Reports" subtitle="Filter applications, export them to Excel or PDF, and review issue and email activity." />

      <div className={`${card} ${row}`}>
        <input className={inputClass} placeholder="Search apps…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All app statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
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
        <a href={ReportsApi.exportUrl("xlsx", params)}>
          <button className={btn}><Download size={16} /> Export as Excel</button>
        </a>
        <a href={ReportsApi.exportUrl("pdf", params)}>
          <button className={btnSecondary}><Download size={16} /> Export as PDF</button>
        </a>
      </div>

      <div className={card}>
        <h3 className="text-base font-semibold mb-4 text-slate-800">Issues by application</h3>
        <div className={tableWrap}>
        <table className={table}>
          <thead>
            <tr>
              <th className={th}>App ID</th>
              <th className={th}>Name</th>
              <th className={th}>Open</th>
              <th className={th}>Resolved</th>
            </tr>
          </thead>
          <tbody>
            {issues.map((row) => (
              <tr key={row.appId}>
                <td className={td}>{row.appId}</td>
                <td className={td}>{row.name}</td>
                <td className={td}>{row.open}</td>
                <td className={td}>{row.resolved}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {issues.length === 0 && <EmptyState icon={Inbox} title="No issues logged" description="Issues raised against repos will be summarised here." />}
      </div>

      <div className={card}>
        <h3 className="text-base font-semibold mb-5 text-slate-800">Email send volume by event</h3>
        <div className={tableWrap}>
        <table className={table}>
          <thead>
            <tr>
              <th className={th}>Event</th>
              <th className={th}>Status</th>
              <th className={th}>Count</th>
            </tr>
          </thead>
          <tbody>
            {emails.map((row, i) => (
              <tr key={i}>
                <td className={td}>{statusLabel(row.event)}</td>
                <td className={td}>
                  <span className={badgeClass(row.status)}>{statusLabel(row.status)}</span>
                </td>
                <td className={td}>{row.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {emails.length === 0 && <EmptyState icon={Inbox} title="No emails sent yet" description="Stage-change notifications will be counted here once they go out." />}
      </div>
    </div>
  );
}
