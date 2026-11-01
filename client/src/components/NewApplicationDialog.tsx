import { useState } from "react";
import { Application, Applications, errorMessage } from "../api/client";
import { btn, btnSecondary, input as inputClass } from "../ui";
import Dialog from "./Dialog";

const EMPTY = { appId: "", name: "", owner: "", teamContact: "", wave: "", targetStartDate: "", targetDate: "", proposedTargetDate: "" };
const field = "flex flex-col gap-1.5 text-sm text-slate-500";

export default function NewApplicationDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (app: Application) => void }) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [key]: e.target.value });

  const datesBackward = !!form.targetStartDate && !!form.targetDate && form.targetStartDate > form.targetDate;
  const canSave = !saving && !datesBackward && !!form.appId.trim() && !!form.name.trim() && !!form.owner.trim() && !!form.teamContact.trim();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setError(null);
    setSaving(true);
    try {
      const created = await Applications.create({
        appId: form.appId.trim(),
        name: form.name.trim(),
        owner: form.owner.trim(),
        teamContact: form.teamContact.trim(),
        wave: form.wave ? Number(form.wave) : undefined,
        targetStartDate: form.targetStartDate || undefined,
        targetDate: form.targetDate || undefined,
        proposedTargetDate: form.proposedTargetDate || undefined,
      });
      onCreated(created);
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <Dialog title="New application" onClose={onClose}>
      <form onSubmit={save}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className={field}>
            App ID (required)
            <input className={`${inputClass} w-full`} value={form.appId} onChange={set("appId")} />
          </label>
          <label className={field}>
            Name (required)
            <input className={`${inputClass} w-full`} value={form.name} onChange={set("name")} />
          </label>
          <label className={field}>
            Owner (required)
            <input className={`${inputClass} w-full`} value={form.owner} onChange={set("owner")} />
          </label>
          <label className={field}>
            Team Contact (required)
            <input className={`${inputClass} w-full`} value={form.teamContact} onChange={set("teamContact")} />
          </label>
          <label className={field}>
            Wave
            <select className={`${inputClass} w-full`} value={form.wave} onChange={set("wave")}>
              <option value="">No wave</option>
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  Wave {n}
                </option>
              ))}
            </select>
          </label>
          <label className={field}>
            Target Start
            <input type="date" className={`${inputClass} w-full`} value={form.targetStartDate} onChange={set("targetStartDate")} />
          </label>
          <label className={field}>
            Target End
            <input type="date" className={`${inputClass} w-full`} value={form.targetDate} onChange={set("targetDate")} />
          </label>
          <label className={field}>
            Proposed Target
            <input type="date" className={`${inputClass} w-full`} value={form.proposedTargetDate} onChange={set("proposedTargetDate")} />
          </label>
        </div>
        {datesBackward && <p className="text-sm text-rose-700 mt-3">Target start must be on or before target end.</p>}
        <p className="text-xs text-slate-500 mt-4">It starts at Not started. Add repos and recipients on the next page, then start Cleanup when you're ready.</p>
        {error && (
          <div role="alert" className="rounded-xl bg-rose-100 text-rose-700 text-sm px-3 py-2 mt-4">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-3 mt-6">
          <button type="button" className={btnSecondary} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={btn} disabled={!canSave}>
            {saving ? "Creating…" : "Create application"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
