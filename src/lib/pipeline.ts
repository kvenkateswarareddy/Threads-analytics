import { scorePosts, summarize } from "./analyze";
import { cleanPosts, parseUsername } from "./clean";
import { generateMock } from "./mock";
import { fetchFromThreadsApi } from "./threads-api";
import type { CleanPost, DataSource, FetchResult, Summary } from "./types";

export const MIN_POSTS = 30;

export async function fetchPosts(username: string, source: DataSource, token?: string): Promise<FetchResult> {
  if (source === "api") return fetchFromThreadsApi(username, token ?? "", MIN_POSTS);
  return generateMock(username);
}

export type PipelineResult = { username: string; posts: CleanPost[]; summary: Summary };

/** fetch -> clean -> score/group -> summarise. Pure apart from the fetch itself. */
export async function runPipeline(
  input: string,
  source: DataSource,
  token?: string,
  fetcher: typeof fetchPosts = fetchPosts,
): Promise<PipelineResult> {
  const username = parseUsername(input);
  const fetched = await fetcher(username, source, token);
  const { posts: cleaned, report } = cleanPosts(fetched.posts, username);
  if (cleaned.length < MIN_POSTS) {
    throw new Error(
      `Only ${cleaned.length} usable posts were found (need at least ${MIN_POSTS}). ` +
        `Try the mock data source or an account with more public posts.`,
    );
  }
  const { posts, thresholds } = scorePosts(cleaned, fetched.followers);
  const summary = summarize(posts, { username, source, followers: fetched.followers, cleaning: report }, thresholds);
  return { username, posts, summary };
}
