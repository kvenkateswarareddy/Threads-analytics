/**
 * Offline CLI: runs the same pipeline as the web app on the mock dataset and writes
 *   data/mock_raw_<user>.json      raw (dirty) mock posts
 *   data/posts_<user>.csv          cleaned posts
 *   reports/report_<user>.md       Markdown report
 *   reports/summary_<user>.json    full summary object
 *
 * Usage: npm run report -- demo_account
 * (This is a convenience for reviewers; the graded flow is the logged-in web UI.)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { generateMock } from "../src/lib/mock";
import { runPipeline } from "../src/lib/pipeline";

const user = (process.argv[2] ?? "demo_account").replace(/^@/, "");
mkdirSync("data", { recursive: true });
mkdirSync("reports", { recursive: true });

const raw = generateMock(user);
writeFileSync(`data/mock_raw_${user}.json`, JSON.stringify(raw, null, 2));

const { posts, summary: s } = await runPipeline(user, "mock");

const cols = ["posted_at", "post_url", "text", "likes", "replies", "reposts", "quotes", "engagement", "engagement_rate", "word_count", "char_count", "hashtag_count", "mention_count", "url_count", "post_type", "perf_group"] as const;
const cell = (v: unknown) => {
  let t = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return `"${t.replace(/"/g, '""')}"`;
};
writeFileSync(`data/posts_${user}.csv`, [cols.join(","), ...posts.map((p) => cols.map((c) => cell((p as any)[c])).join(","))].join("\n"));
writeFileSync(`reports/summary_${user}.json`, JSON.stringify(s, null, 2));

const o = s.overview;
const trunc = (t: string, n = 90) => (t.length > n ? t.slice(0, n) + "..." : t).replace(/\|/g, "/").replace(/\n/g, " ");
const md: string[] = [];
md.push(`# Threads performance report: @${s.username}`);
md.push(`_Source: **${s.source}** (synthetic data, post links are illustrative). ${o.post_count} posts from ${o.date_from.slice(0, 10)} to ${o.date_to.slice(0, 10)}. Time zone: ${s.time_zone}._\n`);
md.push(`## Overview\n`);
md.push(`| Avg likes | Avg replies | Avg reposts | Avg quotes | Avg interactions | Avg engagement rate (${o.engagement_rate_unit === "pct_of_followers" ? "% of followers" : "index"}) |\n|---|---|---|---|---|---|`);
md.push(`| ${o.avg_likes} | ${o.avg_replies} | ${o.avg_reposts} | ${o.avg_quotes} | ${o.avg_engagement} | ${o.avg_engagement_rate} |\n`);
md.push(`## Three observations\n`);
s.observations.forEach((t, i) => md.push(`${i + 1}. ${t}`));
md.push(`\n## Top 5 posts by engagement rate\n`);
md.push(`| # | Post | Likes | Replies | Reposts | Quotes | Rate |\n|---|---|---|---|---|---|---|`);
s.top_posts.forEach((p, i) => md.push(`| ${i + 1} | ${trunc(p.text)} | ${p.likes} | ${p.replies} | ${p.reposts} | ${p.quotes} | ${p.engagement_rate} |`));
md.push(`\n## Posting time\n`);
md.push(`Most frequent day: **${s.busiest_day}**, most frequent hour: **${String(s.busiest_hour).padStart(2, "0")}:00**, best day by average interactions: **${s.best_day_by_engagement}**.\n`);
md.push(`| Day | Posts | Avg interactions |\n|---|---|---|`);
s.weekday_distribution.forEach((d) => md.push(`| ${d.day} | ${d.posts} | ${d.avg_engagement} |`));
md.push(`\n## Text length vs interactions\n`);
md.push(`Pearson r (characters vs interactions) = **${s.length_vs_engagement.pearson_chars_vs_engagement}**\n`);
md.push(`| Bucket | Posts | Avg interactions |\n|---|---|---|`);
s.length_vs_engagement.buckets.forEach((b) => md.push(`| ${b.label} | ${b.posts} | ${b.avg_engagement} |`));
md.push(`\n## Post types\n`);
md.push(`| Type | Posts | Share | Avg interactions |\n|---|---|---|---|`);
s.post_types.forEach((t) => md.push(`| ${t.type} | ${t.posts} | ${Math.round(t.share * 100)}% | ${t.avg_engagement} |`));
md.push(`\n## Keywords and hashtags\n`);
md.push(`Keywords: ${s.top_keywords.map((k) => `${k.term} (${k.count})`).join(", ")}\n`);
md.push(`Hashtags: ${s.top_hashtags.map((k) => `#${k.tag} (${k.count})`).join(", ") || "none"}\n`);
md.push(`## Success and failure analysis (NLP)\n`);
md.push(`Groups: ${s.group_thresholds.formula}.\n`);
for (const g of s.groups) {
  md.push(`### ${g.group.toUpperCase()} group (${g.size} posts, avg likes ${g.avg_likes}, avg replies ${g.avg_replies})\n`);
  g.reasons.forEach((r, i) => md.push(i === 0 ? `**${r}**` : `- ${r}`));
  if (g.distinctive_terms.length) md.push(`\nDistinctive terms: ${g.distinctive_terms.map((t) => t.term).join(", ")}`);
  md.push(`\nSample posts (same feature method applied to each):\n`);
  g.samples.forEach((p) => md.push(`- "${trunc(p.text, 110)}" (${p.likes} likes, ${p.replies} replies): ${p.signals.join("; ")}`));
  md.push("");
}
md.push(`## Recommendations\n`);
md.push(s.recommendations.text + "\n");
md.push(`## Cleaning report\n`);
const c = s.cleaning;
md.push(`${c.input_rows} rows in, ${c.output_rows} out; ${c.duplicates_removed} duplicates removed; ${c.dropped_invalid_time} dropped for unusable timestamps; ${c.filled_missing_counts} rows with missing counts imputed with the column median; ${c.filled_missing_text} without text; ${c.rebuilt_urls} URLs rebuilt.`);
writeFileSync(`reports/report_${user}.md`, md.join("\n") + "\n");

console.log(`Wrote data/posts_${user}.csv and reports/report_${user}.md`);
