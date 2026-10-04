"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AnalyzeForm({ apiAvailable }: { apiAvailable: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [source, setSource] = useState<"mock" | "api">("mock");
  const [refresh, setRefresh] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState<string[]>([]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotes([]);
    try {
      const accounts = text.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accounts, source, refresh }),
      });
      const json = await res.json();
      if (!res.ok && !json.results) throw new Error(json.error ?? `Request failed (${res.status})`);
      const results: { username: string; task_id?: string; cached?: boolean; error?: string }[] = json.results ?? [];
      const good = results.filter((r) => r.task_id && !r.error);
      setNotes(
        results.map((r) =>
          r.error ? `@${r.username}: ${r.error}` : `@${r.username}: ${r.cached ? "reused a recent analysis (cache)" : "analysed"}`,
        ),
      );
      if (good.length === 1) router.push(`/report/${good[0].task_id}`);
      else if (good.length > 1) router.push(`/compare?ids=${good.map((g) => g.task_id).join(",")}`);
      else throw new Error(results.map((r) => r.error).filter(Boolean).join(" | ") || "No analysis could be completed.");
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card stack">
      <h2>New analysis</h2>
      <label>
        Threads username or profile URL (up to 3, separated by commas or new lines, for a comparison)
        <textarea
          rows={2}
          required
          placeholder="e.g. @demo_account  or  https://www.threads.com/@demo_account"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <div className="row">
        <label className="inline">
          Data source
          <select value={source} onChange={(e) => setSource(e.target.value as "mock" | "api")}>
            <option value="mock">Mock dataset (always available)</option>
            <option value="api" disabled={!apiAvailable}>
              Official Threads API{apiAvailable ? "" : " (not configured)"}
            </option>
          </select>
        </label>
        <label className="inline check">
          <input type="checkbox" checked={refresh} onChange={(e) => setRefresh(e.target.checked)} />
          Ignore cache
        </label>
      </div>
      <button className="primary" disabled={busy}>
        {busy ? "Analysing..." : "Collect posts & analyse"}
      </button>
      {error && <p className="error">{error}</p>}
      {notes.length > 0 && (
        <ul className="muted small">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </form>
  );
}
