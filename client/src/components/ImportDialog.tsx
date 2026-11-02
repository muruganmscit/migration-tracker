import { useState } from "react";
import { Download, Upload } from "lucide-react";
import { errorMessage, Import } from "../api/client";
import { btn, btnSecondary, input as inputClass, table, tableWrap, td, th } from "../ui";
import Dialog from "./Dialog";

const REPO_STATUSES = "NOT_STARTED, MIGRATING, MIGRATED, VALIDATING, VALIDATED, ADOPTED, ARCHIVED";

const APPLICATION_COLUMNS: [string, string][] = [
  ["appId *", "Unique ID. An existing ID updates that application"],
  ["name *", ""],
  ["owner *", ""],
  ["teamContact *", ""],
  ["status", "ACTIVE. Archiving and marking inactive happen in the portal"],
  ["wave *", "1 to 4. Required for a new application; blank keeps an existing one's wave"],
  ["targetStartDate, targetDate", "YYYY-MM-DD. Target start and end"],
  ["proposedTargetDate", "YYYY-MM-DD"],
  ["cleanupStartedAt, cleanupEndedAt", "YYYY-MM-DD. Only for applications already past that point"],
];
const REPO_COLUMNS: [string, string][] = [
  ["appId *", "Must match an application"],
  ["repoName *", "An existing name updates that repo"],
  ["sourceUrl *", ""],
  ["status", REPO_STATUSES],
  ["reason", "Required when archiving or moving a repo backward"],
  ["cleanupDecision", "KEEP or ARCHIVE, while Cleanup is in progress"],
  ["targetProject, notes", ""],
  ["technology", "JAVA, NODEJS, PYTHON, DOTNET, GO, OTHERS"],
  ["technologyVersion", ""],
  ["pipelineType", "DEFAULT_NODE, DEFAULT_JAVA, DEFAULT_PYTHON, DEFAULT_DOTNET, DEFAULT_GO, CUSTOM"],
  ["startedAt, completedAt", "YYYY-MM-DD"],
];

const TEMPLATES: Record<string, string> = {
  "applications.csv":
    "appId,name,owner,teamContact,status,wave,targetStartDate,targetDate,proposedTargetDate,cleanupStartedAt,cleanupEndedAt\nAPP-100,Example Application,Jane Doe,example-team@example.com,ACTIVE,1,2027-01-04,2027-03-26,,,\n",
  "repos.csv":
    "appId,repoName,sourceUrl,status,reason,cleanupDecision,targetProject,technology,technologyVersion,pipelineType,startedAt,completedAt,notes\nAPP-100,example-api,https://github.com/example/example-api,NOT_STARTED,,,,JAVA,17,DEFAULT_JAVA,,,\n",
};

function downloadTemplate(name: string) {
  const url = URL.createObjectURL(new Blob([TEMPLATES[name]], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function Columns({ title, rows, file }: { title: string; rows: [string, string][]; file: string }) {
  return (
    <details className="border-t border-slate-900/5 pt-3">
      <summary className="text-sm font-medium text-slate-700 cursor-pointer">{title} columns</summary>
      <button type="button" className="text-sm text-blue-700 underline inline-flex items-center gap-1 mt-2" onClick={() => downloadTemplate(file)}>
        <Download size={14} /> Download {file} template
      </button>
      <div className={`${tableWrap} mt-2`}>
        <table className={table}>
          <thead>
            <tr>
              <th className={th}>Column</th>
              <th className={th}>Values</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([column, note]) => (
              <tr key={column}>
                <td className={`${td} font-mono text-xs`}>{column}</td>
                <td className={td}>{note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export default function ImportDialog({ onClose, onImported }: { onClose: () => void; onImported: (summary: any) => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (files.length === 0 || uploading) return;
    setError(null);
    setUploading(true);
    try {
      onImported(await Import.upload(files));
    } catch (err) {
      setError(errorMessage(err));
      setUploading(false);
    }
  }

  return (
    <Dialog title="Upload applications and repos" onClose={onClose}>
      <form onSubmit={upload} className="space-y-4">
        <p className="text-sm text-slate-500">
          Upload CSV or Excel files. Sheets or files named <b className="font-medium text-slate-700">Applications</b> and <b className="font-medium text-slate-700">Repos</b> are recognised automatically, and applications load first. Columns marked * are required, and blank cells leave existing values alone.
        </p>
        <label className="flex flex-col gap-1.5 text-sm text-slate-500">
          Files
          <input
            type="file"
            multiple
            accept=".csv,.xlsx"
            className={`${inputClass} w-full`}
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />
        </label>
        <Columns title="Applications" rows={APPLICATION_COLUMNS} file="applications.csv" />
        <Columns title="Repos" rows={REPO_COLUMNS} file="repos.csv" />
        <p className="text-xs text-slate-500 border-t border-slate-900/5 pt-3">
          New applications send no email. Updates that change an existing application's phase email its recipients, as usual.
        </p>
        {error && (
          <div role="alert" className="rounded-md bg-rose-100 text-rose-700 text-sm px-3 py-2">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-3">
          <button type="button" className={btnSecondary} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={btn} disabled={files.length === 0 || uploading}>
            <Upload size={16} /> {uploading ? "Uploading…" : "Upload"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
