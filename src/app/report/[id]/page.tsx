import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Charts from "@/components/Charts";
import { createClient } from "@/lib/supabase/server";
import type { Summary } from "@/lib/types";

export const dynamic = "force-dynamic";

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "Asia/Taipei" });
const pct = (x: number) => `${Math.round(x * 100)}%`;
const GROUP_LABEL = { high: "High performers", mid: "Middle", low: "Low performers" } as const;

export default async function ReportPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Row Level Security: another user's id simply returns no row -> 404
  const { data: task } = await supabase.from("analysis_tasks").select("id, username, source, created_at").eq("id", params.id).maybeSingle();
  if (!task) notFound();
  const { data: row } = await supabase.from("analysis_summaries").select("summary").eq("task_id", params.id).maybeSingle();
  if (!row) notFound();
  const s = row.summary as Summary;

  const { data: pts } = await supabase.from("posts").select("char_count, engagement").eq("task_id", params.id);
  const scatter = (pts ?? []).map((p) => ({ chars: p.char_count as number, engagement: p.engagement as number }));
  const o = s.overview;
  const rateUnit = o.engagement_rate_unit === "pct_of_followers" ? "% of followers" : "index (100 = account average)";

  return (
    <main>
      <header className="topbar">
        <div>
          <Link href="/dashboard" className="small">
            &larr; All analyses
          </Link>
          <h1>@{s.username}</h1>
          <p className="muted small">
            {o.post_count} posts, {fmtDate(o.date_from)} to {fmtDate(o.date_to)} &middot; source: {s.source}
            {s.source === "mock" && " (synthetic data, post links are illustrative)"}
          </p>
        </div>
        <div className="row">
          <a className="button" href={`/api/export/${task.id}?format=csv`}>
            Download CSV
          </a>
          <a className="button" href={`/api/export/${task.id}?format=json`}>
            Download JSON
          </a>
        </div>
      </header>

      <section className="metrics">
        {[
          ["Avg likes", o.avg_likes],
          ["Avg replies", o.avg_replies],
          ["Avg reposts", o.avg_reposts],
          ["Avg quotes", o.avg_quotes],
          ["Avg interactions", o.avg_engagement],
          ["Avg engagement rate", o.avg_engagement_rate],
        ].map(([label, value]) => (
          <div className="metric" key={String(label)}>
            <div className="metric-value">{value}</div>
            <div className="muted small">{label}</div>
          </div>
        ))}
      </section>
      <p className="muted small">Engagement rate unit: {rateUnit}. Interactions = likes + replies + reposts + quotes.</p>

      <section className="card">
        <h2>Three observations on the content strategy</h2>
        <ol>
          {s.observations.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ol>
      </section>

      <Charts summary={s} scatter={scatter} />

      <section className="card">
        <h2>Top 5 posts by engagement rate</h2>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Post</th>
                <th className="num">Likes</th>
                <th className="num">Replies</th>
                <th className="num">Reposts</th>
                <th className="num">Quotes</th>
                <th className="num">Rate</th>
              </tr>
            </thead>
            <tbody>
              {s.top_posts.map((p, i) => (
                <tr key={p.post_url}>
                  <td>{i + 1}</td>
                  <td>
                    <div>{p.text.length > 140 ? `${p.text.slice(0, 140)}...` : p.text || <em>(no text)</em>}</div>
                    <a className="small" href={p.post_url} target="_blank" rel="noreferrer">
                      {fmtDate(p.posted_at)} &middot; open post
                    </a>
                  </td>
                  <td className="num">{p.likes}</td>
                  <td className="num">{p.replies}</td>
                  <td className="num">{p.reposts}</td>
                  <td className="num">{p.quotes}</td>
                  <td className="num">{p.engagement_rate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>Post types, hashtags and timing</h2>
        <div className="grid3">
          <div>
            <h3>Post types</h3>
            <table>
              <thead>
                <tr><th>Type</th><th className="num">Posts</th><th className="num">Share</th><th className="num">Avg interactions</th></tr>
              </thead>
              <tbody>
                {s.post_types.map((t) => (
                  <tr key={t.type}><td>{t.type}</td><td className="num">{t.posts}</td><td className="num">{pct(t.share)}</td><td className="num">{t.avg_engagement}</td></tr>
                ))}
              </tbody>
            </table>
            <p className="muted small">
              Overlapping flags: {s.feature_flags.has_link} with links, {s.feature_flags.has_hashtag} with hashtags,{" "}
              {s.feature_flags.has_mention} with mentions, {s.feature_flags.plain} plain.
            </p>
          </div>
          <div>
            <h3>Top hashtags</h3>
            {s.top_hashtags.length === 0 ? (
              <p className="muted">No hashtags used.</p>
            ) : (
              <ul>
                {s.top_hashtags.map((h) => (
                  <li key={h.tag}>#{h.tag} <span className="muted">({h.count})</span></li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3>Timing</h3>
            <ul>
              <li>Most frequent day: <b>{s.busiest_day}</b></li>
              <li>Most frequent hour: <b>{String(s.busiest_hour).padStart(2, "0")}:00</b> ({s.time_zone})</li>
              <li>Best day by avg interactions: <b>{s.best_day_by_engagement}</b></li>
            </ul>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Success and failure analysis (NLP)</h2>
        <p className="muted small">
          Groups: {s.group_thresholds.formula}. Low group &le; {s.group_thresholds.low_max}, high group &ge; {s.group_thresholds.high_min}.
          The same lexicon/feature method is applied to every sampled post in every group.
        </p>
        <div className="grid3">
          {s.groups.map((g) => (
            <div key={g.group} className={`group ${g.group}`}>
              <h3>{GROUP_LABEL[g.group]} <span className="muted small">({g.size} posts)</span></h3>
              <p className="small">Avg likes {g.avg_likes} &middot; avg replies {g.avg_replies}</p>
              <ul className="small">
                {g.reasons.map((r, i) => (
                  <li key={i} className={i === 0 ? "lead" : ""}>{r}</li>
                ))}
              </ul>
              {g.distinctive_terms.length > 0 && (
                <p className="small">Distinctive terms: {g.distinctive_terms.map((t) => t.term).join(", ")}</p>
              )}
              <h4>Sample posts</h4>
              {g.samples.map((p) => (
                <div className="sample" key={p.post_url}>
                  <div className="small">{p.text.length > 130 ? `${p.text.slice(0, 130)}...` : p.text}</div>
                  <div className="muted small">{p.likes} likes &middot; {p.replies} replies</div>
                  <div className="small signals">{p.signals.join(" · ")}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Content strategy recommendations {s.recommendations.by === "llm" && <span className="pill done">LLM</span>}</h2>
        <pre className="reco">{s.recommendations.text}</pre>
      </section>

      <section className="card">
        <h2>Data cleaning report</h2>
        <ul className="small">
          <li>{s.cleaning.input_rows} rows in, {s.cleaning.output_rows} rows out</li>
          <li>{s.cleaning.duplicates_removed} duplicates removed</li>
          <li>{s.cleaning.dropped_invalid_time} rows dropped (unusable timestamp)</li>
          <li>{s.cleaning.filled_missing_counts} rows had missing counts (imputed with the column median), {s.cleaning.filled_missing_text} had no text</li>
          <li>{s.cleaning.rebuilt_urls} post URLs rebuilt from username + id</li>
          <li>All timestamps stored as UTC and bucketed in {s.cleaning.time_zone}</li>
        </ul>
      </section>
    </main>
  );
}
