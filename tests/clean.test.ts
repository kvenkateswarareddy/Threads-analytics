import { describe, expect, it } from "vitest";
import { classify, cleanPosts, countWords, extractTextFeatures, localParts, parseTime, parseUsername, toCount } from "@/lib/clean";

describe("parseUsername", () => {
  it("accepts plain names, @names and profile URLs", () => {
    expect(parseUsername("zuck")).toBe("zuck");
    expect(parseUsername("@Zuck")).toBe("zuck");
    expect(parseUsername("https://www.threads.net/@some.user_1")).toBe("some.user_1");
    expect(parseUsername("https://www.threads.com/@abc/post/XYZ123")).toBe("abc");
    expect(parseUsername("threads.com/@abc")).toBe("abc");
  });
  it("rejects empty input, other hosts and illegal characters", () => {
    expect(() => parseUsername("  ")).toThrow();
    expect(() => parseUsername("https://example.com/@abc")).toThrow();
    expect(() => parseUsername("bad name!")).toThrow();
  });
});

describe("toCount / parseTime", () => {
  it("normalises counts and flags missing ones", () => {
    expect(toCount("1,234")).toEqual({ n: 1234, missing: false });
    expect(toCount(null)).toEqual({ n: 0, missing: true });
    expect(toCount("abc")).toEqual({ n: 0, missing: true });
    expect(toCount(-5)).toEqual({ n: 0, missing: true });
  });
  it("converts different offsets to the same UTC instant", () => {
    const a = parseTime("2026-03-01T20:00:00+08:00");
    const b = parseTime("2026-03-01T12:00:00Z");
    const c = parseTime("2026-03-01T07:00:00-05:00");
    expect(a).toBe("2026-03-01T12:00:00.000Z");
    expect(b).toBe(a);
    expect(c).toBe(a);
  });
  it("handles epoch seconds, offsets without colon and garbage", () => {
    expect(parseTime(1772366400)).toBe("2026-03-01T12:00:00.000Z");
    expect(parseTime("2026-03-01T12:00:00+0000")).toBe("2026-03-01T12:00:00.000Z");
    expect(parseTime("not-a-date")).toBeNull();
    expect(parseTime(null)).toBeNull();
  });
});

describe("text features", () => {
  it("counts hashtags, mentions, urls and words (ignoring hashtags inside URLs)", () => {
    const f = extractTextFeatures("Hello @bob check https://x.com/a#frag now #Tips #tips2 thanks");
    expect(f.url_count).toBe(1);
    expect(f.mention_count).toBe(1);
    expect(f.hashtag_count).toBe(2);
    expect(f.hashtags).toEqual(["tips", "tips2"]);
  });
  it("does not treat e-mail addresses as mentions", () => {
    expect(extractTextFeatures("mail me a@b.com").mention_count).toBe(0);
  });
  it("counts CJK characters as words", () => {
    expect(countWords("今天天氣很好 hello world")).toBe(8);
  });
  it("classifies with link > mention > hashtag > plain", () => {
    expect(classify({ url_count: 1, mention_count: 1, hashtag_count: 1 })).toBe("link");
    expect(classify({ url_count: 0, mention_count: 1, hashtag_count: 1 })).toBe("mention");
    expect(classify({ url_count: 0, mention_count: 0, hashtag_count: 1 })).toBe("hashtag");
    expect(classify({ url_count: 0, mention_count: 0, hashtag_count: 0 })).toBe("plain");
  });
});

describe("cleanPosts", () => {
  const base = { posted_at: "2026-03-01T12:00:00Z", text: "hi", likes: 1, replies: 0, reposts: 0, quotes: 0 };
  it("removes duplicates (keeping the higher-engagement copy), fills missing data, drops bad timestamps", () => {
    const { posts, report } = cleanPosts(
      [
        { ...base, external_id: "a", post_url: "https://t/a", likes: 5 },
        { ...base, external_id: "a", post_url: "https://t/a", likes: 9 }, // duplicate id, fresher counts
        { ...base, external_id: "b", post_url: "", likes: null, text: null },
        { ...base, external_id: "c", posted_at: "garbage" },
      ],
      "user",
    );
    expect(posts).toHaveLength(2);
    expect(report.duplicates_removed).toBe(1);
    expect(report.dropped_invalid_time).toBe(1);
    expect(report.filled_missing_text).toBe(1);
    expect(report.filled_missing_counts).toBe(1);
    expect(report.rebuilt_urls).toBe(1);
    expect(posts.find((p) => p.external_id === "a")!.likes).toBe(9);
    expect(posts.find((p) => p.external_id === "b")!.post_url).toBe("https://www.threads.com/@user/post/b");
  });
  it("imputes missing counts with the column median instead of zero", () => {
    const mk = (id: string, likes: number | null) => ({ ...base, external_id: id, post_url: "https://t/" + id, text: id, likes });
    const { posts } = cleanPosts([mk("a", 10), mk("b", 20), mk("c", 30), mk("d", null)], "u");
    expect(posts.find((p) => p.external_id === "d")!.likes).toBe(20);
    expect(posts.find((p) => p.external_id === "d")!.engagement).toBe(20);
  });
  it("dedupes id-less posts by text + minute", () => {
    const { posts } = cleanPosts([{ ...base }, { ...base }], "u");
    expect(posts).toHaveLength(1);
  });
});

describe("localParts", () => {
  it("buckets in the unified time zone (Asia/Taipei = UTC+8)", () => {
    // 2026-03-01 is a Sunday. 20:00 UTC = Monday 04:00 in Taipei.
    expect(localParts("2026-03-01T20:00:00Z")).toEqual({ day: "Mon", hour: 4 });
    expect(localParts("2026-03-01T16:00:00Z")).toEqual({ day: "Mon", hour: 0 });
    expect(localParts("2026-03-01T15:59:00Z")).toEqual({ day: "Sun", hour: 23 });
  });
});
