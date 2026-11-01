import { useEffect, useState } from "react";
import { EmailTemplate, EmailTemplates as EmailTemplatesApi } from "../api/client";
import PageHeader from "../components/PageHeader";
import { btn, card, input as inputClass, table, tableWrap, td, th, statusLabel } from "../ui";

const PLACEHOLDERS: { key: string; description: string }[] = [
  { key: "appId", description: "Application.appId" },
  { key: "appName", description: "Application.name" },
  { key: "owner", description: "Application.owner" },
  { key: "teamContact", description: "Application.teamContact" },
  { key: "stage", description: "the phase this email is about" },
  { key: "previousStage", description: "the phase before this change (blank if there was none)" },
  { key: "repoCount", description: "active repos under the application" },
  { key: "reposAtStage", description: "active repos that have reached this phase" },
  { key: "reason", description: "the reason given, for Archived and override emails" },
  { key: "changeDate", description: "timestamp of the change / manual send" },
  { key: "portalLink", description: "deep link to the Application Detail page" },
];

export default function EmailTemplatesPage() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { subject: string; bodyHtml: string }>>({});

  function load() {
    EmailTemplatesApi.list().then((list) => {
      setTemplates(list);
      setDrafts(Object.fromEntries(list.map((t) => [t.event, { subject: t.subject, bodyHtml: t.bodyHtml }])));
    });
  }

  useEffect(load, []);

  async function save(event: EmailTemplate["event"]) {
    await EmailTemplatesApi.update(event, drafts[event]);
    load();
  }

  return (
    <div>
      <PageHeader title="Email Templates" subtitle="The emails recipients receive: when Cleanup starts, when Migration and Validation start, a final notice when Adoption completes, and if an application is archived or overridden." />

      <div className={card}>
        <h3 className="text-base font-semibold mb-5 text-slate-800">Placeholders</h3>
        <div className={tableWrap}>
        <table className={table}>
          <thead>
            <tr>
              <th className={th}>Placeholder</th>
              <th className={th}>Source</th>
            </tr>
          </thead>
          <tbody>
            {PLACEHOLDERS.map((p) => (
              <tr key={p.key}>
                <td className={td}>
                  <code className="text-indigo-600">{`{{${p.key}}}`}</code>
                </td>
                <td className={td}>{p.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {templates.map((t) => (
        <div className={card} key={t.event}>
          <h3 className="text-base font-semibold mb-4 text-slate-800">{statusLabel(t.event)}</h3>
          <div>
            <label className="flex flex-col gap-1.5 text-sm text-slate-500">
              Subject
              <input
                className={`${inputClass} w-full`}
                value={drafts[t.event]?.subject ?? ""}
                onChange={(e) => setDrafts({ ...drafts, [t.event]: { ...drafts[t.event], subject: e.target.value } })}
              />
            </label>
          </div>
          <div className="mt-4">
            <label className="flex flex-col gap-1.5 text-sm text-slate-500">
              Body (HTML)
              <textarea
                className={`${inputClass} w-full h-32`}
                value={drafts[t.event]?.bodyHtml ?? ""}
                onChange={(e) => setDrafts({ ...drafts, [t.event]: { ...drafts[t.event], bodyHtml: e.target.value } })}
              />
            </label>
          </div>
          <button className={`${btn} mt-4`} onClick={() => save(t.event)}>
            Save
          </button>
        </div>
      ))}
    </div>
  );
}
