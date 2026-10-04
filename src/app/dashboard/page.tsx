import Link from "next/link";
import { redirect } from "next/navigation";
import AnalyzeForm from "@/components/AnalyzeForm";
import SignOutButton from "@/components/SignOutButton";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tasks } = await supabase
    .from("analysis_tasks")
    .select("id, username, source, status, post_count, error, created_at")
    .order("created_at", { ascending: false })
    .limit(30);

  return (
    <main>
      <header className="topbar">
        <div>
          <h1>Threads Analytics</h1>
          <p className="muted small">Signed in as {user.email}</p>
        </div>
        <SignOutButton />
      </header>

      <AnalyzeForm apiAvailable={Boolean(process.env.THREADS_ACCESS_TOKEN)} />

      <section className="card">
        <h2>Your analyses</h2>
        {!tasks || tasks.length === 0 ? (
          <p className="muted">Nothing yet. Run your first analysis above.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Account</th>
                <th>Source</th>
                <th>Status</th>
                <th className="num">Posts</th>
                <th>Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id}>
                  <td>@{t.username}</td>
                  <td>{t.source}</td>
                  <td>
                    <span className={`pill ${t.status}`}>{t.status}</span>
                    {t.error && <div className="error small">{t.error}</div>}
                  </td>
                  <td className="num">{t.post_count}</td>
                  <td>{new Date(t.created_at).toLocaleString("en-GB", { timeZone: "Asia/Taipei" })}</td>
                  <td>{t.status === "done" && <Link href={`/report/${t.id}`}>Open report</Link>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
