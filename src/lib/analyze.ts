import { TIME_ZONE, WEEKDAYS, localParts } from "./clean";
import { analyseGroups, postScore, round, tokenize } from "./nlp";
import type { CleanPost, CleaningReport, DataSource, PerfGroup, PostType, Summary } from "./types";

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return 0;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? 0 : round(num / den, 3);
}

/**
 * Adds engagement_rate and perf_group.
 *  engagement      = likes + replies + reposts + quotes
 *  engagement_rate = engagement / followers x 100            (when followers are known)
 *                  = engagement / mean(engagement) x 100     (otherwise: an index, 100 = account average)
 *  perf_group      = terciles of score = likes + 2 x replies  (top third = high, bottom third = low)
 */
export function scorePosts(
  base: Omit<CleanPost, "engagement_rate" | "perf_group">[],
  followers: number,
): { posts: CleanPost[]; thresholds: { low_max: number; high_min: number } } {
  const avgEng = mean(base.map((p) => p.engagement)) || 1;
  const ranked = [...base].sort((a, b) => postScore(b) - postScore(a) || a.external_id.localeCompare(b.external_id));
  const third = Math.floor(base.length / 3);
  const groupOf = new Map<string, PerfGroup>();
  ranked.forEach((p, i) => groupOf.set(p.external_id, i < third ? "high" : i >= base.length - third ? "low" : "mid"));

  const posts: CleanPost[] = base.map((p) => ({
    ...p,
    engagement_rate: round(followers > 0 ? (p.engagement / followers) * 100 : (p.engagement / avgEng) * 100, 3),
    perf_group: groupOf.get(p.external_id)!,
  }));
  const high = ranked.slice(0, third);
  const low = ranked.slice(base.length - third);
  return {
    posts,
    thresholds: {
      high_min: high.length ? postScore(high[high.length - 1]) : 0,
      low_max: low.length ? postScore(low[0]) : 0,
    },
  };
}

type Meta = { username: string; source: DataSource; followers: number; cleaning: CleaningReport };

export function summarize(posts: CleanPost[], meta: Meta, thresholds: { low_max: number; high_min: number }): Summary {
  if (posts.length === 0) throw new Error("No usable posts to analyse.");
  const sorted = [...posts].sort((a, b) => a.posted_at.localeCompare(b.posted_at));
  const byEng = (arr: CleanPost[]) => round(mean(arr.map((p) => p.engagement)), 1);

  // weekday / hour distribution (unified time zone)
  const wd = WEEKDAYS.map((day) => ({ day, items: [] as CleanPost[] }));
  const hr = Array.from({ length: 24 }, (_, hour) => ({ hour, items: [] as CleanPost[] }));
  for (const p of posts) {
    const { day, hour } = localParts(p.posted_at);
    wd[WEEKDAYS.indexOf(day)].items.push(p);
    hr[hour].items.push(p);
  }
  const weekday_distribution = wd.map((d) => ({ day: d.day, posts: d.items.length, avg_engagement: byEng(d.items) }));
  const hour_distribution = hr.map((h) => ({ hour: h.hour, posts: h.items.length, avg_engagement: byEng(h.items) }));
  const busiest_day = [...weekday_distribution].sort((a, b) => b.posts - a.posts)[0].day;
  const busiest_hour = [...hour_distribution].sort((a, b) => b.posts - a.posts)[0].hour;
  const eligibleDays = weekday_distribution.filter((d) => d.posts >= 2);
  const best_day_by_engagement = [...(eligibleDays.length ? eligibleDays : weekday_distribution)].sort(
    (a, b) => b.avg_engagement - a.avg_engagement,
  )[0].day;

  // length vs engagement
  const bucketDefs: [string, (c: number) => boolean][] = [
    ["Short (<=60 chars)", (c) => c <= 60],
    ["Medium (61-180)", (c) => c > 60 && c <= 180],
    ["Long (>180)", (c) => c > 180],
  ];
  const buckets = bucketDefs.map(([label, test]) => {
    const items = posts.filter((p) => test(p.char_count));
    return { label, posts: items.length, avg_engagement: byEng(items) };
  });
  const eng = posts.map((p) => p.engagement);

  // keywords / hashtags (document frequency: how many posts contain the term)
  const kw = new Map<string, number>();
  const tags = new Map<string, number>();
  for (const p of posts) {
    for (const t of new Set(tokenize(p.text))) kw.set(t, (kw.get(t) ?? 0) + 1);
    for (const t of new Set(p.hashtags)) tags.set(t, (tags.get(t) ?? 0) + 1);
  }
  const top = <T extends string>(m: Map<string, number>, key: T) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 10)
      .map(([k, count]) => ({ [key]: k, count }) as { count: number } & Record<T, string>);
  const top_keywords = top(kw, "term");
  const top_hashtags = top(tags, "tag");

  // post type categories
  const types: PostType[] = ["plain", "link", "hashtag", "mention"];
  const post_types = types.map((type) => {
    const items = posts.filter((p) => p.post_type === type);
    return { type, posts: items.length, share: round(items.length / posts.length, 3), avg_engagement: byEng(items) };
  });
  const feature_flags = {
    has_link: posts.filter((p) => p.url_count > 0).length,
    has_hashtag: posts.filter((p) => p.hashtag_count > 0).length,
    has_mention: posts.filter((p) => p.mention_count > 0).length,
    plain: posts.filter((p) => p.url_count + p.hashtag_count + p.mention_count === 0).length,
  };

  const top_posts = [...posts]
    .sort((a, b) => b.engagement_rate - a.engagement_rate || b.engagement - a.engagement)
    .slice(0, 5)
    .map(({ post_url, posted_at, text, likes, replies, reposts, quotes, engagement_rate }) => ({
      post_url, posted_at, text, likes, replies, reposts, quotes, engagement_rate,
    }));

  const groups = analyseGroups(posts);

  const summary: Summary = {
    username: meta.username,
    source: meta.source,
    followers: meta.followers,
    time_zone: TIME_ZONE,
    overview: {
      post_count: posts.length,
      date_from: sorted[0].posted_at,
      date_to: sorted[sorted.length - 1].posted_at,
      avg_likes: round(mean(posts.map((p) => p.likes)), 1),
      avg_replies: round(mean(posts.map((p) => p.replies)), 1),
      avg_reposts: round(mean(posts.map((p) => p.reposts)), 1),
      avg_quotes: round(mean(posts.map((p) => p.quotes)), 1),
      avg_engagement: round(mean(eng), 1),
      avg_engagement_rate: round(mean(posts.map((p) => p.engagement_rate)), 3),
      engagement_rate_unit: meta.followers > 0 ? "pct_of_followers" : "index_vs_mean",
    },
    top_posts,
    weekday_distribution,
    hour_distribution,
    busiest_day,
    busiest_hour,
    best_day_by_engagement,
    length_vs_engagement: {
      buckets,
      pearson_chars_vs_engagement: pearson(posts.map((p) => p.char_count), eng),
      pearson_words_vs_engagement: pearson(posts.map((p) => p.word_count), eng),
    },
    top_keywords,
    top_hashtags,
    post_types,
    feature_flags,
    groups,
    group_thresholds: {
      ...thresholds,
      formula: "score = likes + 2 x replies; top third = high, bottom third = low, rest = mid",
    },
    observations: [],
    recommendations: { text: "", by: "rules" },
    cleaning: meta.cleaning,
  };
  summary.observations = buildObservations(summary);
  summary.recommendations = { text: ruleRecommendations(summary), by: "rules" };
  return summary;
}

const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** Exactly three data-driven observations about content strategy. */
export function buildObservations(s: Summary): string[] {
  const hi = s.groups.find((g) => g.group === "high")!;
  const lo = s.groups.find((g) => g.group === "low")!;

  // 1. timing
  const bestHourRow = [...s.hour_distribution].filter((h) => h.posts >= 2).sort((a, b) => b.avg_engagement - a.avg_engagement)[0];
  const timing =
    `Timing: most posts go out on ${s.busiest_day} and around ${hourLabel(s.busiest_hour)} (${s.time_zone}), ` +
    `but ${s.best_day_by_engagement} earns the highest average engagement` +
    (bestHourRow ? ` and the ${hourLabel(bestHourRow.hour)} slot averages ${bestHourRow.avg_engagement} interactions per post.` : ".");

  // 2. format
  const typed = s.post_types.filter((t) => t.posts >= 2).sort((a, b) => b.avg_engagement - a.avg_engagement);
  const best = typed[0];
  const worst = typed[typed.length - 1];
  const format = best && worst && best.type !== worst.type
    ? `Format: "${best.type}" posts perform best (${best.avg_engagement} avg interactions) while "${worst.type}" posts perform worst (${worst.avg_engagement}); ` +
      `${Math.round(s.feature_flags.has_link / s.overview.post_count * 100)}% of all posts contain an external link.`
    : `Format: post types perform similarly; ${Math.round(s.feature_flags.plain / s.overview.post_count * 100)}% of posts are plain text.`;

  // 3. language / hooks
  const r = s.length_vs_engagement.pearson_chars_vs_engagement;
  const lenTxt = Math.abs(r) < 0.15 ? "length has little relationship with engagement" : r < 0 ? "shorter posts tend to get more engagement" : "longer posts tend to get more engagement";
  const hooks =
    `Hooks: ${lenTxt} (Pearson r = ${r}); question posts make up ${Math.round(hi.feature_means.question_rate * 100)}% of the high group ` +
    `versus ${Math.round(lo.feature_means.question_rate * 100)}% of the low group.`;

  return [timing, format, hooks];
}

export function ruleRecommendations(s: Summary): string {
  const hi = s.groups.find((g) => g.group === "high")!;
  const lo = s.groups.find((g) => g.group === "low")!;
  const lines: string[] = [];
  if (hi.feature_means.question_rate - lo.feature_means.question_rate >= 0.15)
    lines.push("End more posts with an open question: it is clearly over-represented in the best-performing posts.");
  if (lo.feature_means.link_rate - hi.feature_means.link_rate >= 0.1)
    lines.push("Move external links into a reply or the profile; posts with links sit disproportionately in the low group.");
  if (hi.feature_means.number_rate - lo.feature_means.number_rate >= 0.15)
    lines.push("Use concrete numbers or lists; high performers contain them far more often.");
  if (lo.feature_means.hashtag_rate - hi.feature_means.hashtag_rate >= 0.1)
    lines.push("Cut hashtags: tagged posts are more common in the low group than the high group.");
  lines.push(`Schedule more posts on ${s.best_day_by_engagement}, the day with the highest average engagement.`);
  if (hi.distinctive_terms.length)
    lines.push(`Lean into topics that distinguish winners: ${hi.distinctive_terms.slice(0, 3).map((t) => t.term).join(", ")}.`);
  return lines.map((l) => `- ${l}`).join("\n");
}
