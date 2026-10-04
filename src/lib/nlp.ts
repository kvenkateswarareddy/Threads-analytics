import type { CleanPost, GroupAnalysis, GroupSamplePost, NlpFeatures, PerfGroup } from "./types";

/**
 * NLP method used for the success / failure analysis (identical for every post and every group):
 *   1. Rule + lexicon features per post  (question, call-to-action, sentiment, emoji, numbers, voice, length)
 *   2. Group-level feature means vs. the overall mean  -> "what is over/under-represented in this group"
 *   3. Distinctive terms per group via smoothed log-odds of a term appearing in the group vs. the other groups
 *   4. 3-5 representative posts per group are run through the same feature extractor and explained with signals
 */

const POSITIVE = new Set(
  "love great good best amazing awesome happy win wins won excited proud thanks thank glad fun easy better beautiful perfect nice enjoy helpful recommend favorite favourite cool brilliant success growth".split(" "),
);
const NEGATIVE = new Set(
  "bad worst hate terrible awful sad angry fail failed failing boring hard problem problems annoying broken wrong ugly mistake mistakes lose lost tired stress stressed difficult issue issues".split(" "),
);
const CTA_PHRASES = [
  "comment", "reply", "let me know", "tell me", "share", "what do you think", "thoughts", "agree", "drop your", "vote",
  "follow", "subscribe", "check out", "click", "sign up", "read more", "link in", "tag a", "your turn", "which one",
];
const FIRST_PERSON = new Set(["i", "i'm", "i've", "i'll", "i'd", "me", "my", "mine", "myself", "we", "our", "us"]);

const STOPWORDS = new Set(
  ("a about above after again all also am an and any are as at be because been before being below between both but by can could did do does doing " +
    "down during each few for from further had has have having he her here hers him his how if in into is it its just like me more most my no nor not " +
    "now of off on once only or other our out over own same she should so some such than that the their them then there these they this those through " +
    "to too under until up us very was we were what when where which while who whom why will with would you your yours get got one two really still " +
    "dont don't thats that's ive i've im i'm youre you're cant can't https http www com").split(" "),
);

const EMOJI_RE = /\p{Extended_Pictographic}/gu;
const CJK_CHAR = /[㐀-鿿]/;

export function nlpFeatures(text: string): NlpFeatures {
  const lower = text.toLowerCase();
  const words = lower.replace(/https?:\/\/\S+/g, " ").match(/[a-z][a-z'’]*/g) ?? [];
  let pos = 0;
  let neg = 0;
  let fp = 0;
  for (const w of words) {
    const t = w.replace(/’/g, "'");
    if (POSITIVE.has(t)) pos++;
    if (NEGATIVE.has(t)) neg++;
    if (FIRST_PERSON.has(t)) fp++;
  }
  const sentiment = pos + neg === 0 ? 0 : (pos - neg) / (pos + neg);
  return {
    sentiment: round(sentiment, 2),
    is_question: /[?？]/.test(text),
    has_cta: CTA_PHRASES.some((p) => lower.includes(p)),
    emoji_count: (text.match(EMOJI_RE) ?? []).length,
    exclaim_count: (text.match(/[!！]/g) ?? []).length,
    first_person: fp,
    has_number: /\d/.test(text.replace(/https?:\/\/\S+/g, "")),
    avg_word_len: words.length ? round(words.reduce((s, w) => s + w.length, 0) / words.length, 2) : 0,
  };
}

/** Lower-case content tokens: Latin words (>=3 chars, no stopwords) and CJK character bigrams. */
export function tokenize(text: string): string[] {
  const clean = text
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/(^|\s)[#@][\w.]+/g, " ")
    .toLowerCase();
  const out: string[] = [];
  for (const w of clean.match(/[a-z][a-z']*/g) ?? []) {
    if (w.length >= 3 && !STOPWORDS.has(w)) out.push(w);
  }
  const cjk = Array.from(clean).filter((c) => CJK_CHAR.test(c));
  for (let i = 0; i < cjk.length - 1; i++) out.push(cjk[i] + cjk[i + 1]);
  return out;
}

export function round(n: number, d = 2): number {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Performance score used to split posts into three groups: likes + 2 x replies (a reply costs the reader more effort). */
export const REPLY_WEIGHT = 2;
export const postScore = (p: Pick<CleanPost, "likes" | "replies">) => p.likes + REPLY_WEIGHT * p.replies;

export function signalsFor(p: CleanPost, f: NlpFeatures): string[] {
  const s: string[] = [];
  if (f.is_question) s.push("asks a direct question, which invites replies");
  if (f.has_cta) s.push("contains a call-to-action (comment / share / follow)");
  if (f.sentiment >= 0.3) s.push("positive tone");
  if (f.sentiment <= -0.3) s.push("negative / frustrated tone");
  if (f.emoji_count >= 2) s.push(`emoji-heavy (${f.emoji_count})`);
  if (f.first_person >= 2) s.push("personal first-person voice");
  if (f.has_number) s.push("uses concrete numbers");
  if (p.url_count > 0) s.push("contains an external link, which pulls readers off-platform");
  if (p.hashtag_count >= 2) s.push(`hashtag stuffing (${p.hashtag_count} tags)`);
  if (p.char_count <= 60) s.push("very short");
  else if (p.char_count > 180) s.push("long-form");
  if (s.length === 0) s.push("neutral statement with no engagement hooks");
  return s;
}

type Scored = { post: CleanPost; f: NlpFeatures; score: number };

function groupMeans(items: Scored[]) {
  const n = items.length || 1;
  return {
    sentiment: round(mean(items.map((i) => i.f.sentiment))),
    question_rate: round(items.filter((i) => i.f.is_question).length / n),
    cta_rate: round(items.filter((i) => i.f.has_cta).length / n),
    emoji_avg: round(mean(items.map((i) => i.f.emoji_count))),
    exclaim_avg: round(mean(items.map((i) => i.f.exclaim_count))),
    first_person_avg: round(mean(items.map((i) => i.f.first_person))),
    number_rate: round(items.filter((i) => i.f.has_number).length / n),
    char_avg: round(mean(items.map((i) => i.post.char_count)), 0),
    link_rate: round(items.filter((i) => i.post.url_count > 0).length / n),
    hashtag_rate: round(items.filter((i) => i.post.hashtag_count > 0).length / n),
  };
}

export function distinctiveTerms(
  group: string[][],
  rest: string[][],
  top = 5,
  alpha = 0.5,
): { term: string; log_odds: number }[] {
  const df = (docs: string[][]) => {
    const m = new Map<string, number>();
    for (const d of docs) for (const t of new Set(d)) m.set(t, (m.get(t) ?? 0) + 1);
    return m;
  };
  const g = df(group);
  const r = df(rest);
  const out: { term: string; log_odds: number }[] = [];
  for (const [term, cg] of g) {
    if (cg < 2) continue;
    const cr = r.get(term) ?? 0;
    const lg = Math.log((cg + alpha) / (group.length - cg + alpha));
    const lr = Math.log((cr + alpha) / (rest.length - cr + alpha));
    out.push({ term, log_odds: round(lg - lr, 2) });
  }
  return out.filter((o) => o.log_odds > 0).sort((a, b) => b.log_odds - a.log_odds).slice(0, top);
}

function reasonsFor(group: PerfGroup, m: ReturnType<typeof groupMeans>, all: ReturnType<typeof groupMeans>): string[] {
  const out: string[] = [];
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const cmp = (label: string, a: number, b: number, fmt: (x: number) => string, minGap: number) => {
    if (Math.abs(a - b) >= minGap) out.push(`${label}: ${fmt(a)} in this group vs ${fmt(b)} overall (${a > b ? "over" : "under"}-represented)`);
  };
  cmp("Question posts", m.question_rate, all.question_rate, pct, 0.15);
  cmp("Call-to-action posts", m.cta_rate, all.cta_rate, pct, 0.15);
  cmp("Posts with links", m.link_rate, all.link_rate, pct, 0.1);
  cmp("Posts with numbers", m.number_rate, all.number_rate, pct, 0.15);
  cmp("Average length (chars)", m.char_avg, all.char_avg, (x) => `${Math.round(x)}`, 25);
  cmp("Sentiment (-1..1)", m.sentiment, all.sentiment, (x) => x.toFixed(2), 0.2);
  cmp("First-person words per post", m.first_person_avg, all.first_person_avg, (x) => x.toFixed(1), 0.6);
  cmp("Emoji per post", m.emoji_avg, all.emoji_avg, (x) => x.toFixed(1), 0.6);
  if (out.length === 0) out.push("No single feature separates this group from the rest; differences are mostly timing or topic.");
  const lead =
    group === "high"
      ? "Why these succeeded:"
      : group === "low"
        ? "Why these underperformed:"
        : "Middle group is defined by:";
  return [lead, ...out];
}

/** Runs the NLP method on the three groups. Samples: top 4 (high), 4 closest to the median (mid), bottom 4 (low). */
export function analyseGroups(posts: CleanPost[], sampleSize = 4): GroupAnalysis[] {
  const items: Scored[] = posts.map((post) => ({ post, f: nlpFeatures(post.text), score: postScore(post) }));
  const overall = groupMeans(items);
  const toks = new Map<string, string[]>(posts.map((p) => [p.external_id, tokenize(p.text)]));
  const order: PerfGroup[] = ["high", "mid", "low"];

  return order.map((g) => {
    const mine = items.filter((i) => i.post.perf_group === g);
    const rest = items.filter((i) => i.post.perf_group !== g);
    const means = groupMeans(mine);

    let chosen: Scored[];
    const byScore = [...mine].sort((a, b) => b.score - a.score);
    if (g === "high") chosen = byScore.slice(0, sampleSize);
    else if (g === "low") chosen = byScore.slice(-sampleSize).reverse();
    else {
      const med = byScore.length ? byScore[Math.floor(byScore.length / 2)].score : 0;
      chosen = [...mine].sort((a, b) => Math.abs(a.score - med) - Math.abs(b.score - med)).slice(0, sampleSize);
    }

    const samples: GroupSamplePost[] = chosen.map((c) => ({
      post_url: c.post.post_url,
      text: c.post.text,
      likes: c.post.likes,
      replies: c.post.replies,
      score: c.score,
      features: c.f,
      signals: signalsFor(c.post, c.f),
    }));

    return {
      group: g,
      size: mine.length,
      avg_likes: round(mean(mine.map((i) => i.post.likes)), 1),
      avg_replies: round(mean(mine.map((i) => i.post.replies)), 1),
      avg_score: round(mean(mine.map((i) => i.score)), 1),
      feature_means: means,
      distinctive_terms: distinctiveTerms(
        mine.map((i) => toks.get(i.post.external_id) ?? []),
        rest.map((i) => toks.get(i.post.external_id) ?? []),
      ),
      samples,
      reasons: reasonsFor(g, means, overall),
    };
  });
}
