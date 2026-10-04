import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const COLUMNS = [
  "posted_at", "post_url", "text", "likes", "replies", "reposts", "quotes", "engagement", "engagement_rate",
  "word_count", "char_count", "hashtag_count", "mention_count", "url_count", "post_type", "perf_group",
] as const;

function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  // neutralise spreadsheet formula injection from post text
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** GET /api/export/<taskId>?format=csv|json  (RLS guarantees users can only export their own task). */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const format = new URL(request.url).searchParams.get("format") === "json" ? "json" : "csv";

  const { data: task } = await supabase.from("analysis_tasks").select("id, username").eq("id", params.id).maybeSingle();
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: posts, error } = await supabase
    .from("posts")
    .select(COLUMNS.join(","))
    .eq("task_id", params.id)
    .order("posted_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (format === "json") {
    const { data: s } = await supabase.from("analysis_summaries").select("summary").eq("task_id", params.id).maybeSingle();
    return new NextResponse(JSON.stringify({ summary: s?.summary ?? null, posts }, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${task.username}-analysis.json"`,
      },
    });
  }

  const rows = (posts ?? []) as unknown as Record<string, unknown>[];
  const csv = [COLUMNS.join(","), ...rows.map((r) => COLUMNS.map((c) => csvCell(r[c])).join(","))].join("\n");
  return new NextResponse("﻿" + csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${task.username}-posts.csv"`,
    },
  });
}
