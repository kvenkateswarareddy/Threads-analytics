import type { CleanPost, CleaningReport, PostType, RawPost, TextFeatures } from "./types";

/** Unified analysis time zone. Every timestamp is stored as UTC and bucketed in this zone. */
export const TIME_ZONE = "Asia/Taipei";

const USERNAME_RE = /^[A-Za-z0-9._]{1,30}$/;

/** Accepts "name", "@name", "https://www.threads.net/@name" or "https://www.threads.com/@name/post/xyz". */
export function parseUsername(input: string): string {
  const raw = (input ?? "").trim();
  if (!raw) throw new Error("Please enter a Threads username or profile URL.");

  let candidate = raw;
  if (/^https?:\/\//i.test(raw) || /^(www\.)?threads\.(net|com)\//i.test(raw)) {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    let url: URL;
    try {
      url = new URL(withProto);
    } catch {
      throw new Error("That does not look like a valid URL.");
    }
    if (!/(^|\.)threads\.(net|com)$/i.test(url.hostname)) {
      throw new Error("Only threads.net / threads.com profile URLs are supported.");
    }
    const seg = url.pathname.split("/").filter(Boolean)[0] ?? "";
    candidate = decodeURIComponent(seg);
  }
  candidate = candidate.replace(/^@/, "");
  if (!USERNAME_RE.test(candidate)) {
    throw new Error("Usernames may only contain letters, numbers, dots and underscores (max 30).");
  }
  return candidate.toLowerCase();
}

export function toCount(value: unknown): { n: number; missing: boolean } {
  if (value === null || value === undefined || value === "") return { n: 0, missing: true };
  const n = typeof value === "number" ? value : Number(String(value).replace(/,/g, "").trim());
  if (!Number.isFinite(n) || n < 0) return { n: 0, missing: true };
  return { n: Math.round(n), missing: false };
}

/** Parses ISO strings (with or without offset), "YYYY-MM-DD HH:mm:ss" (read as UTC) and epoch s/ms. */
export function parseTime(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  let ms: number;
  if (typeof value === "number") {
    ms = value < 1e11 ? value * 1000 : value;
  } else {
    let s = String(value).trim();
    if (/^\d+$/.test(s)) {
      const n = Number(s);
      ms = n < 1e11 ? n * 1000 : n;
      return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
    }
    s = s.replace(" ", "T").replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) s += "Z"; // no zone => assume UTC
    ms = Date.parse(s);
  }
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const URL_RE = /https?:\/\/[^\s]+/gi;
const HASHTAG_RE = /(^|[^\p{L}\p{N}_&])#([\p{L}\p{N}_]{1,60})/gu;
const MENTION_RE = /(^|[^\w@.])@([A-Za-z0-9._]{1,30})/g;
const CJK_RE = /[㐀-鿿぀-ヿ가-힯]/g;

/** Word count that works for both spaced languages and CJK (each CJK character counts as one word). */
export function countWords(text: string): number {
  const cjk = (text.match(CJK_RE) ?? []).length;
  const latin = text
    .replace(CJK_RE, " ")
    .split(/\s+/)
    .filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
  return cjk + latin;
}

export function extractTextFeatures(text: string): TextFeatures {
  const urls = text.match(URL_RE) ?? [];
  const noUrls = text.replace(URL_RE, " ");
  const hashtags = Array.from(noUrls.matchAll(HASHTAG_RE)).map((m) => m[2].toLowerCase());
  const mentions = Array.from(noUrls.matchAll(MENTION_RE));
  return {
    char_count: Array.from(text).length,
    word_count: countWords(noUrls),
    hashtag_count: hashtags.length,
    mention_count: mentions.length,
    url_count: urls.length,
    hashtags,
  };
}

export function classify(f: Pick<TextFeatures, "url_count" | "mention_count" | "hashtag_count">): PostType {
  if (f.url_count > 0) return "link";
  if (f.mention_count > 0) return "mention";
  if (f.hashtag_count > 0) return "hashtag";
  return "plain";
}

function normaliseText(t: string): string {
  return t.replace(/\s+/g, " ").trim();
}

/**
 * Cleaning pipeline.
 *  - missing / invalid counts -> imputed with the column median, missing text -> "", missing URL -> rebuilt from username + id
 *  - rows without a parseable timestamp are dropped (they cannot be placed in time)
 *  - duplicates (same external_id, or same text + same minute) are collapsed, keeping the row with more engagement
 *  - timestamps are normalised to UTC ISO; bucketing later happens in TIME_ZONE
 */
export function cleanPosts(
  raw: RawPost[],
  username: string,
): { posts: Omit<CleanPost, "engagement_rate" | "perf_group">[]; report: CleaningReport } {
  const report: CleaningReport = {
    input_rows: raw.length,
    output_rows: 0,
    duplicates_removed: 0,
    dropped_invalid_time: 0,
    filled_missing_text: 0,
    filled_missing_counts: 0,
    rebuilt_urls: 0,
    time_zone: TIME_ZONE,
  };

  type Base = Omit<CleanPost, "engagement_rate" | "perf_group">;
  const byKey = new Map<string, Base>();
  const flags = new Map<Base, { missing: ("likes" | "replies" | "reposts" | "quotes")[]; noText: boolean; urlRebuilt: boolean }>();
  let autoId = 0;

  for (const r of raw) {
    const posted_at = parseTime(r.posted_at);
    if (!posted_at) {
      report.dropped_invalid_time++;
      continue;
    }

    const text = typeof r.text === "string" ? r.text.replace(/\u0000/g, "").trim() : "";

    const counts = {
      likes: toCount(r.likes),
      replies: toCount(r.replies),
      reposts: toCount(r.reposts),
      quotes: toCount(r.quotes),
    };
    const missing = (Object.keys(counts) as (keyof typeof counts)[]).filter((k) => counts[k].missing);

    let external_id = (r.external_id ?? "").toString().trim();
    if (!external_id) external_id = `auto-${++autoId}-${posted_at}`;

    let post_url = (r.post_url ?? "").toString().trim();
    let urlRebuilt = false;
    if (!/^https?:\/\//i.test(post_url)) {
      post_url = `https://www.threads.com/@${username}/post/${external_id}`;
      urlRebuilt = true;
    }

    const features = extractTextFeatures(text);
    const engagement = counts.likes.n + counts.replies.n + counts.reposts.n + counts.quotes.n;
    const post: Base = {
      external_id,
      post_url,
      posted_at,
      text,
      likes: counts.likes.n,
      replies: counts.replies.n,
      reposts: counts.reposts.n,
      quotes: counts.quotes.n,
      post_type: classify(features),
      engagement,
      ...features,
    };
    flags.set(post, { missing, noText: !text, urlRebuilt });

    // dedupe key: stable id when we have a real one, otherwise text + minute
    const hasRealId = !external_id.startsWith("auto-");
    const key = hasRealId
      ? `id:${external_id}`
      : `tx:${normaliseText(text).toLowerCase()}|${posted_at.slice(0, 16)}`;
    const textKey = text ? `tx:${normaliseText(text).toLowerCase()}|${posted_at.slice(0, 16)}` : null;

    const existingKey = byKey.has(key) ? key : textKey && byKey.has(textKey) ? textKey : null;
    if (existingKey) {
      report.duplicates_removed++;
      const prev = byKey.get(existingKey)!;
      if (post.engagement > prev.engagement) {
        for (const [k, v] of byKey) if (v === prev) byKey.set(k, post);
      }
      continue;
    }
    byKey.set(key, post);
    if (textKey && textKey !== key) byKey.set(textKey, post);
  }

  const unique = Array.from(new Set(byKey.values())).sort((a, b) => b.posted_at.localeCompare(a.posted_at));

  // Missing counts are imputed with the column median of the posts that DO have the value.
  // (Filling with 0 would silently push those posts into the "low performer" group.)
  const median = (xs: number[]) => {
    if (xs.length === 0) return 0;
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return Math.round(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2);
  };
  const med = {} as Record<"likes" | "replies" | "reposts" | "quotes", number>;
  for (const k of ["likes", "replies", "reposts", "quotes"] as const) {
    med[k] = median(unique.filter((p) => !flags.get(p)!.missing.includes(k)).map((p) => p[k]));
  }
  for (const p of unique) {
    const f = flags.get(p)!;
    if (f.missing.length > 0) {
      report.filled_missing_counts++;
      for (const k of f.missing) p[k] = med[k];
      p.engagement = p.likes + p.replies + p.reposts + p.quotes;
    }
    if (f.noText) report.filled_missing_text++;
    if (f.urlRebuilt) report.rebuilt_urls++;
  }

  report.output_rows = unique.length;
  return { posts: unique, report };
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export { WEEKDAYS };

/** Weekday (Mon..Sun) and hour (0-23) of an instant in the given time zone. */
export function localParts(iso: string, timeZone: string = TIME_ZONE): { day: (typeof WEEKDAYS)[number]; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const day = parts.find((p) => p.type === "weekday")!.value as (typeof WEEKDAYS)[number];
  const hour = parseInt(parts.find((p) => p.type === "hour")!.value, 10) % 24;
  return { day, hour };
}
