import { HttpError, isTransient, withRetry } from "./retry";
import type { FetchResult, RawPost } from "./types";

/**
 * Official Threads API client (graph.threads.net). No scraping, no session theft, no login bypass.
 *
 * Limitation (by design of the platform): a user access token can only read the posts of the account that
 * authorised it. So this source works for an account you own or are authorised to analyse, and the username
 * you enter must match the token's owner. For any other account use the mock source.
 *
 * NOTE: written against the public API docs; it has not been exercised against a live token in this repo's tests.
 */
const BASE = "https://graph.threads.net/v1.0";

async function getJson(path: string, token: string, params: Record<string, string> = {}): Promise<any> {
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);
  return withRetry(
    async () => {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new HttpError(res.status, `Threads API ${res.status}: ${body.slice(0, 200)}`);
      }
      return res.json();
    },
    { retries: 3, baseMs: 500, shouldRetry: isTransient },
  );
}

async function insightsFor(id: string, token: string) {
  try {
    const j = await getJson(`/${id}/insights`, token, { metric: "likes,replies,reposts,quotes" });
    const out: Record<string, number> = {};
    for (const m of j.data ?? []) out[m.name] = m.values?.[0]?.value ?? 0;
    return out;
  } catch {
    return {}; // missing insights are filled with 0 (and counted) by the cleaning step
  }
}

export async function fetchFromThreadsApi(username: string, token: string, minPosts = 30): Promise<FetchResult> {
  if (!token) throw new Error("THREADS_ACCESS_TOKEN is not set. Use DATA_SOURCE=mock or provide a token.");

  const me = await getJson("/me", token, { fields: "id,username" });
  if (String(me.username).toLowerCase() !== username.toLowerCase()) {
    throw new Error(
      `The official API only returns the account that owns the token (@${me.username}). ` +
        `Use the mock source to analyse @${username}.`,
    );
  }

  const raw: RawPost[] = [];
  let next: string | undefined;
  for (let page = 0; page < 6 && raw.length < Math.max(minPosts, 50); page++) {
    const j: any = await getJson("/me/threads", token, {
      fields: "id,text,permalink,timestamp",
      limit: "25",
      ...(next ? { after: next } : {}),
    });
    for (const t of j.data ?? []) {
      raw.push({ external_id: t.id, post_url: t.permalink, posted_at: t.timestamp, text: t.text ?? "" });
    }
    next = j.paging?.cursors?.after;
    if (!j.paging?.next) break;
  }

  for (let i = 0; i < raw.length; i += 5) {
    const batch = raw.slice(i, i + 5);
    const res = await Promise.all(batch.map((p) => insightsFor(String(p.external_id), token)));
    batch.forEach((p, k) => Object.assign(p, res[k]));
  }

  let followers = 0;
  try {
    const f = await getJson("/me/threads_insights", token, { metric: "followers_count" });
    followers = f.data?.[0]?.total_value?.value ?? 0;
  } catch {
    /* followers stay 0 -> engagement rate falls back to an index */
  }
  return { username, followers, posts: raw, source: "api" };
}
