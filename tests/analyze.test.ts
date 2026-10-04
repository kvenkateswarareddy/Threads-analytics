import { describe, expect, it } from "vitest";
import { pearson, scorePosts } from "@/lib/analyze";
import { distinctiveTerms, nlpFeatures, tokenize } from "@/lib/nlp";
import { generateMock } from "@/lib/mock";
import { MIN_POSTS, runPipeline } from "@/lib/pipeline";
import { cleanPosts } from "@/lib/clean";

describe("pearson", () => {
  it("returns 1 / -1 for perfect linear relations and 0 for constants", () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBe(1);
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBe(-1);
    expect(pearson([1, 1, 1, 1], [1, 2, 3, 4])).toBe(0);
  });
});

describe("nlpFeatures", () => {
  it("detects questions, CTA, numbers, sentiment and emoji", () => {
    const f = nlpFeatures("What do you think? I love these 3 tips 😊😊");
    expect(f.is_question).toBe(true);
    expect(f.has_cta).toBe(true);
    expect(f.has_number).toBe(true);
    expect(f.sentiment).toBeGreaterThan(0);
    expect(f.emoji_count).toBe(2);
    expect(f.first_person).toBe(1);
  });
  it("scores negative text below zero", () => {
    expect(nlpFeatures("This is the worst, terrible and boring").sentiment).toBeLessThan(0);
  });
});

describe("tokenize / distinctiveTerms", () => {
  it("drops stopwords, urls, hashtags and mentions", () => {
    expect(tokenize("The coffee is great https://x.com #tag @bob")).toEqual(["coffee", "great"]);
  });
  it("finds terms over-represented in a group", () => {
    const group = [["coffee", "morning"], ["coffee", "tea"], ["coffee"]];
    const rest = [["travel"], ["tea"], ["design"], ["travel", "coffee"]];
    const out = distinctiveTerms(group, rest);
    expect(out[0].term).toBe("coffee");
  });
});

describe("scorePosts grouping", () => {
  it("splits into balanced terciles by likes + 2 x replies", () => {
    const base = Array.from({ length: 30 }, (_, i) => ({
      external_id: `p${i}`, post_url: "u", posted_at: "2026-03-01T00:00:00.000Z", text: "x",
      likes: i * 10, replies: 0, reposts: 0, quotes: 0, post_type: "plain" as const, engagement: i * 10,
      char_count: 1, word_count: 1, hashtag_count: 0, mention_count: 0, url_count: 0, hashtags: [],
    }));
    const { posts, thresholds } = scorePosts(base, 1000);
    const count = (g: string) => posts.filter((p) => p.perf_group === g).length;
    expect(count("high")).toBe(10);
    expect(count("mid")).toBe(10);
    expect(count("low")).toBe(10);
    expect(posts.find((p) => p.external_id === "p29")!.perf_group).toBe("high");
    expect(posts.find((p) => p.external_id === "p0")!.perf_group).toBe("low");
    expect(thresholds.high_min).toBe(200);
    expect(thresholds.low_max).toBe(90);
    // engagement rate = engagement / followers x 100
    expect(posts.find((p) => p.external_id === "p10")!.engagement_rate).toBe(10);
  });
});

describe("mock data", () => {
  it("is deterministic and contains deliberate dirt", () => {
    const a = generateMock("demo");
    const b = generateMock("demo");
    expect(a).toEqual(b);
    expect(a.posts.length).toBeGreaterThan(MIN_POSTS);
    const { report } = cleanPosts(a.posts, "demo");
    expect(report.duplicates_removed).toBe(2);
    expect(report.dropped_invalid_time).toBe(1);
    expect(report.rebuilt_urls).toBeGreaterThanOrEqual(1);
  });
});

describe("full pipeline on mock data", () => {
  it("produces a complete summary with 3 groups and 3 observations", async () => {
    const { posts, summary } = await runPipeline("https://www.threads.com/@demo_account", "mock");
    expect(posts.length).toBeGreaterThanOrEqual(MIN_POSTS);
    expect(summary.username).toBe("demo_account");
    expect(summary.top_posts).toHaveLength(5);
    expect(summary.top_posts[0].engagement_rate).toBeGreaterThanOrEqual(summary.top_posts[4].engagement_rate);
    expect(summary.weekday_distribution).toHaveLength(7);
    expect(summary.hour_distribution).toHaveLength(24);
    expect(summary.weekday_distribution.reduce((s, d) => s + d.posts, 0)).toBe(posts.length);
    expect(summary.post_types.reduce((s, t) => s + t.posts, 0)).toBe(posts.length);
    expect(summary.groups.map((g) => g.group)).toEqual(["high", "mid", "low"]);
    for (const g of summary.groups) {
      expect(g.samples.length).toBeGreaterThanOrEqual(3);
      expect(g.samples.length).toBeLessThanOrEqual(5);
      expect(g.reasons.length).toBeGreaterThan(0);
    }
    expect(summary.groups.reduce((s, g) => s + g.size, 0)).toBe(posts.length);
    expect(summary.observations).toHaveLength(3);
    expect(summary.recommendations.text.length).toBeGreaterThan(10);
  });
  it("fails clearly when too few posts come back", async () => {
    const fake = async () => ({ username: "x", followers: 0, source: "mock" as const, posts: generateMock("x").posts.slice(0, 10) });
    await expect(runPipeline("x", "mock", undefined, fake)).rejects.toThrow(/need at least/);
  });
});
