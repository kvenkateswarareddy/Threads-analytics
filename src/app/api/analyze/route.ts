import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseUsername } from "@/lib/clean";
import { llmRecommendations } from "@/lib/llm";
import { runPipeline } from "@/lib/pipeline";
import type { DataSource } from "@/lib/types";

export const maxDuration = 60;

const MAX_ACCOUNTS = 3;

type Outcome = { username: string; task_id?: string; cached?: boolean; error?: string };

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: { accounts?: string[]; source?: DataSource; refresh?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const accounts = (body.accounts ?? []).map((a) => String(a).trim()).filter(Boolean).slice(0, MAX_ACCOUNTS);
  if (accounts.length === 0) return NextResponse.json({ error: "Enter at least one username or URL." }, { status: 400 });

  const apiToken = process.env.THREADS_ACCESS_TOKEN;
  const source: DataSource = body.source === "api" ? "api" : "mock";
  if (source === "api" && !apiToken) {
    return NextResponse.json({ error: "THREADS_ACCESS_TOKEN is not configured on the server." }, { status: 400 });
  }
  const ttlMin = Number(process.env.CACHE_TTL_MINUTES ?? 60);

  const outcomes: Outcome[] = [];
  for (const raw of accounts) {
    let username: string;
    try {
      username = parseUsername(raw);
    } catch (e: any) {
      outcomes.push({ username: raw, error: e.message });
      continue;
    }

    // cache: reuse a recent finished analysis of the same account + source instead of fetching again
    if (!body.refresh && ttlMin > 0) {
      const since = new Date(Date.now() - ttlMin * 60000).toISOString();
      const { data: hit } = await supabase
        .from("analysis_tasks")
        .select("id")
        .eq("username", username)
        .eq("source", source)
        .eq("status", "done")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1);
      if (hit && hit.length > 0) {
        outcomes.push({ username, task_id: hit[0].id, cached: true });
        continue;
      }
    }

    const { data: task, error: taskErr } = await supabase
      .from("analysis_tasks")
      .insert({ user_id: user.id, username, source, status: "running" })
      .select("id")
      .single();
    if (taskErr || !task) {
      outcomes.push({ username, error: `Could not create task: ${taskErr?.message ?? "unknown error"}` });
      continue;
    }

    try {
      const { posts, summary } = await runPipeline(username, source, apiToken);

      if (process.env.ANTHROPIC_API_KEY) {
        const text = await llmRecommendations(summary, process.env.ANTHROPIC_API_KEY);
        if (text) summary.recommendations = { text, by: "llm" };
      }

      const rows = posts.map((p) => ({
        task_id: task.id,
        user_id: user.id,
        external_id: p.external_id,
        post_url: p.post_url,
        posted_at: p.posted_at,
        text: p.text,
        likes: p.likes,
        replies: p.replies,
        reposts: p.reposts,
        quotes: p.quotes,
        word_count: p.word_count,
        char_count: p.char_count,
        hashtag_count: p.hashtag_count,
        mention_count: p.mention_count,
        url_count: p.url_count,
        post_type: p.post_type,
        engagement: p.engagement,
        engagement_rate: p.engagement_rate,
        perf_group: p.perf_group,
      }));
      for (let i = 0; i < rows.length; i += 100) {
        const { error } = await supabase.from("posts").insert(rows.slice(i, i + 100));
        if (error) throw new Error(`Saving posts failed: ${error.message}`);
      }
      const { error: sumErr } = await supabase
        .from("analysis_summaries")
        .insert({ task_id: task.id, user_id: user.id, summary });
      if (sumErr) throw new Error(`Saving summary failed: ${sumErr.message}`);

      await supabase
        .from("analysis_tasks")
        .update({ status: "done", post_count: posts.length, finished_at: new Date().toISOString() })
        .eq("id", task.id);
      outcomes.push({ username, task_id: task.id });
    } catch (e: any) {
      const message = String(e?.message ?? e);
      await supabase
        .from("analysis_tasks")
        .update({ status: "failed", error: message.slice(0, 500), finished_at: new Date().toISOString() })
        .eq("id", task.id);
      outcomes.push({ username, task_id: task.id, error: message });
    }
  }

  const ok = outcomes.filter((o) => o.task_id && !o.error);
  const status = ok.length > 0 ? 200 : 422;
  return NextResponse.json({ results: outcomes }, { status });
}
