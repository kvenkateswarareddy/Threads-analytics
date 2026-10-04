import type { FetchResult, RawPost } from "./types";

/**
 * Deterministic mock dataset (same username -> same data).
 * It deliberately contains the kind of mess real exports have, so the cleaning step has something to do:
 * duplicates, missing counts, a missing URL, a missing text, an invalid timestamp, counts as "1,234" strings,
 * and timestamps written in different UTC offsets.
 *
 * Engagement is generated from simple, known effects (questions raise replies, links lower likes, evening posts do better...)
 * so the analysis has real signal to find. The URLs are illustrative only and do NOT point at real posts.
 */

function fnv1a(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TOPICS = [
  "coffee", "remote work", "productivity", "side projects", "travel", "fitness", "books",
  "AI tools", "budgeting", "learning to code", "design", "startups", "sleep", "note taking",
];
const FRIENDS = ["@mia.codes", "@dev_ken", "@sara.writes", "@tomtravels", "@lena_design"];
const HASHTAGS = ["#grind", "#hustle", "#motivation", "#tech", "#life", "#mondaymood", "#creator", "#tips"];

type Style = "question" | "tips" | "personal" | "link" | "hashtags" | "mention" | "rant" | "short" | "long";
const STYLES: [Style, number][] = [
  ["question", 7], ["tips", 6], ["personal", 6], ["link", 5], ["hashtags", 4], ["mention", 3], ["rant", 3], ["short", 5], ["long", 4],
];

function pickWeighted<T>(rng: () => number, items: [T, number][]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [v, w] of items) {
    if ((r -= w) <= 0) return v;
  }
  return items[0][0];
}
const pick = <T>(rng: () => number, xs: T[]): T => xs[Math.floor(rng() * xs.length)];

function makeText(rng: () => number, style: Style, topic: string, n: number): string {
  const T = topic.charAt(0).toUpperCase() + topic.slice(1);
  switch (style) {
    case "question":
      return pick(rng, [
        `What is the one ${topic} habit you cannot live without? Tell me below 👇`,
        `Honest question: is ${topic} overrated or do I just need a better routine? What do you think?`,
        `Which ${topic} tip changed your life the most? Drop your answer in the comments!`,
        `Be honest, how many hours a week do you spend on ${topic}?`,
      ]);
    case "tips":
      return pick(rng, [
        `3 ${topic} lessons from this year: 1) start smaller 2) track one number 3) review every Sunday.`,
        `5 quick ${topic} tips that took me 10 years to learn: keep it simple, ship early, rest more, ask for help, repeat.`,
        `I tracked my ${topic} for 30 days and saved 4 hours a week. Here is the simple system I used, step by step.`,
      ]);
    case "personal":
      return pick(rng, [
        `I finally tried a new ${topic} routine and honestly it was great. I feel so much better 😊`,
        `My ${topic} journey so far: I failed a lot, I learned a lot, and I am proud of how far I have come ❤️`,
        `Today I realised my ${topic} setup is actually perfect for me. I love it when things just work.`,
      ]);
    case "link":
      return pick(rng, [
        `New blog post on ${topic}: https://example.com/blog/${n}`,
        `Read more about ${topic} here https://example.com/p/${n} and follow for updates.`,
        `Check out my ${topic} guide https://example.com/guide/${n} (link in bio too)`,
      ]);
    case "hashtags":
      return `${T} update. ${pick(rng, HASHTAGS)} ${pick(rng, HASHTAGS)} ${pick(rng, HASHTAGS)} #${topic.replace(/\s+/g, "")}`;
    case "mention":
      return `Thanks ${pick(rng, FRIENDS)} for the great chat about ${topic} today. Learned so much!`;
    case "rant":
      return pick(rng, [
        `Ugh, ${topic} is so annoying today. Everything is broken and I am tired.`,
        `Worst ${topic} advice I have ever heard: just push through it. That is a terrible plan.`,
      ]);
    case "short":
      return pick(rng, [`${T} > everything.`, `Monday. ${T}. Go.`, `Small wins in ${topic} add up.`, `Quiet day. ${T} time.`]);
    case "long":
      return (
        `Long thread-style thought on ${topic}: most people overcomplicate it. They collect tools, read ten guides, and never actually start. ` +
        `What worked for me was picking one tiny action, doing it daily, and ignoring everything else for a month. ` +
        `The results were slow at first but they compounded, and after a quarter I barely recognised my own process.`
      );
  }
}

const HOUR_WEIGHTS: [number, number][] = [
  [7, 2], [8, 3], [9, 2], [12, 3], [13, 2], [15, 1], [18, 3], [19, 4], [20, 5], [21, 4], [22, 2], [23, 1],
];

function fmtWithOffset(instantMs: number, offsetMin: number): string {
  if (offsetMin === 0) return new Date(instantMs).toISOString();
  const local = new Date(instantMs + offsetMin * 60000).toISOString().slice(0, 19);
  const sign = offsetMin >= 0 ? "+" : "-";
  const a = Math.abs(offsetMin);
  return `${local}${sign}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
}

export function generateMock(username: string, now: number = Date.UTC(2026, 9, 1, 12, 0, 0), count = 42): FetchResult {
  const rng = mulberry32(fnv1a(username));
  const followers = 6000 + Math.floor(rng() * 24000);
  const posts: RawPost[] = [];

  for (let i = 0; i < count; i++) {
    const style = pickWeighted(rng, STYLES);
    const topic = pick(rng, TOPICS);
    const text = makeText(rng, style, topic, 1000 + i);

    // time: random day within the last 70 days, hour drawn from an evening-heavy Taipei distribution (UTC+8)
    const dayAgo = Math.floor(rng() * 70);
    const localHour = pickWeighted(rng, HOUR_WEIGHTS);
    const minute = Math.floor(rng() * 60);
    const base = new Date(now - dayAgo * 86400000);
    const instant = Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), localHour - 8, minute, 0);
    const weekdayLocal = new Date(instant + 8 * 3600000).getUTCDay(); // 0=Sun

    // engagement model
    const isQ = /[?]/.test(text);
    let m = 1;
    if (isQ) m *= 1.7;
    if (/\d/.test(text.replace(/https?:\/\/\S+/g, ""))) m *= 1.3;
    if (style === "link") m *= 0.5;
    if (style === "hashtags") m *= 0.65;
    if (style === "rant") m *= 0.8;
    if (text.length > 180) m *= 0.85;
    if (text.length <= 60) m *= 1.1;
    if (localHour >= 19 && localHour <= 22) m *= 1.3;
    if (weekdayLocal === 3 || weekdayLocal === 6) m *= 1.2; // Wed & Sat
    if (/[\u{1F300}-\u{1FAFF}❤]/u.test(text)) m *= 1.15;
    const noise = Math.exp((rng() - 0.5) * 1.1);
    const likes = Math.max(0, Math.round(followers * 0.0035 * m * noise));
    const replies = Math.max(0, Math.round(likes * 0.07 * (isQ ? 3 : 1) * (0.6 + rng() * 0.8)));
    const reposts = Math.max(0, Math.round(likes * 0.05 * (0.5 + rng())));
    const quotes = Math.max(0, Math.round(likes * 0.012 * (0.5 + rng())));

    const id = `C${Math.floor(rng() * 36 ** 8).toString(36).padStart(8, "0")}${i}`;
    const offsets = [480, 480, 0, -300, 540];
    posts.push({
      external_id: id,
      post_url: `https://www.threads.com/@${username}/post/${id}`,
      posted_at: fmtWithOffset(instant, pick(rng, offsets)),
      text,
      likes,
      replies,
      reposts,
      quotes,
    });
  }

  // ---- deliberate dirt for the cleaning step ----
  const dirty = posts.map((p) => ({ ...p }));
  dirty.push({ ...posts[3], likes: Number(posts[3].likes) - 1 }); // duplicate id, slightly stale counts
  dirty.push({ ...posts[11] }); // exact duplicate
  dirty[5].likes = null; // missing count
  dirty[9].reposts = "";
  dirty[14].post_url = ""; // missing URL
  dirty[20].text = null; // missing text
  dirty[26].posted_at = "not-a-date"; // unusable timestamp
  dirty[30].likes = `${Number(dirty[30].likes).toLocaleString("en-US")}`; // "1,234"-style string

  return { username, followers, posts: dirty, source: "mock" };
}
