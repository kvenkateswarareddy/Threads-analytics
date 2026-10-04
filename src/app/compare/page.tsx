import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Summary } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ComparePage({ searchParams }: { searchParams: { ids?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const ids = (searchParams.ids ?? "").split(",").filter(Boolean).slice(0, 3);
  const { data } = await supabase.from("analysis_summaries").select("task_id, summary").in("task_id", ids);
  const rows = ids
    .map((id) => data?.find((d) => d.task_id === id))
    .filter(Boolean)
    .map((d) => ({ id: d!.task_id as string, s: d!.summary as Summary }));

  const metrics: [string, (s: Summary) => string | number][] = [
    ["Posts analysed", (s) => s.overview.post_count],
    ["Followers", (s) => (s.followers > 0 ? s.followers.toLocaleString() : "n/a")],
    ["Avg likes", (s) => s.overview.avg_likes],
    ["Avg replies", (s) => s.overview.avg_replies],
    ["Avg reposts", (s) => s.overview.avg_reposts],
    ["Avg interactions", (s) => s.overview.avg_engagement],
    ["Avg engagement rate", (s) => s.overview.avg_engagement_rate],
    ["Most frequent posting day", (s) => s.busiest_day],
    ["Best day by engagement", (s) => s.best_day_by_engagement],
    ["Text length vs interactions (r)", (s) => s.length_vs_engagement.pearson_chars_vs_engagement],
    ["Top hashtag", (s) => (s.top_hashtags[0] ? `#${s.top_hashtags[0].tag}` : "none")],
  ];

  return (
    <main>
      <header className="topbar">
        <div>
          <Link href="/dashboard" className="small">&larr; All analyses</Link>
          <h1>Account comparison</h1>
        </div>
      </header>
      {rows.length === 0 ? (
        <p className="muted">Nothing to compare.</p>
      ) : (
        <section className="card scroll">
          <table>
            <thead>
              <tr>
                <th>Metric</th>
                {rows.map((r) => (
                  <th key={r.id}><Link href={`/report/${r.id}`}>@{r.s.username}</Link></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metrics.map(([label, fn]) => (
                <tr key={label}>
                  <td>{label}</td>
                  {rows.map((r) => (
                    <td key={r.id}>{fn(r.s)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">Engagement rate is only strictly comparable between accounts that share the same unit (see each report).</p>
        </section>
      )}
    </main>
  );
}
