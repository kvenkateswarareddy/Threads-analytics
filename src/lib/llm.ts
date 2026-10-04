import { HttpError, isTransient, withRetry } from "./retry";
import type { Summary } from "./types";

/** Optional bonus: LLM-written strategy recommendations. Returns null on any failure so callers fall back to rules. */
export async function llmRecommendations(s: Summary, apiKey: string | undefined): Promise<string | null> {
  if (!apiKey) return null;
  const facts = {
    account: s.username,
    avg: s.overview,
    best_day: s.best_day_by_engagement,
    post_types: s.post_types,
    length_correlation: s.length_vs_engagement.pearson_chars_vs_engagement,
    high_group: { means: s.groups[0].feature_means, terms: s.groups[0].distinctive_terms },
    low_group: { means: s.groups[2].feature_means, terms: s.groups[2].distinctive_terms },
  };
  try {
    return await withRetry(
      async () => {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({
            model: "claude-sonnet-5-5",
            max_tokens: 500,
            messages: [
              {
                role: "user",
                content:
                  "You are a social media analyst. Using ONLY these computed facts about a Threads account, write 4-5 short, concrete " +
                  "content-strategy recommendations as a markdown bullet list. Do not invent numbers.\n\n" +
                  JSON.stringify(facts),
              },
            ],
          }),
        });
        if (!res.ok) throw new HttpError(res.status, `LLM ${res.status}`);
        const j = await res.json();
        const text = j.content?.find((c: any) => c.type === "text")?.text;
        if (!text) throw new Error("empty LLM response");
        return String(text).trim();
      },
      { retries: 2, baseMs: 600, shouldRetry: isTransient },
    );
  } catch {
    return null;
  }
}
