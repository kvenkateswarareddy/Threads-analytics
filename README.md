# Threads Analytics

Enter a Threads username or profile URL, collect at least 30 recent posts, clean them, analyse performance, and read an interactive report. Built with **Next.js 14 (App Router) + Supabase (Auth, Postgres, Row Level Security)**, deployable to **Vercel**.

> **Data source, read this first.** Threads has no public API for reading *other people's* posts, and scraping it would violate the platform terms. So this project does **not scrape**. It offers two compliant sources:
> 1. **Mock dataset** (default): deterministic synthetic posts per username, with deliberately messy rows (duplicates, missing fields, mixed time zones) so the whole pipeline is exercised. It loads and is analysed **through the logged-in web UI**, as the exam requires. Post links in mock data are illustrative and do not point to real posts.
> 2. **Official Threads API** (optional): works only for the account that owns the access token (a platform rule). Code is written against the public docs and has **not been tested with a live token** in this repo.

## Features

- Email/password **and** magic-link login (Supabase Auth). Signed-out visitors are redirected to `/login`; API routes return 401.
- Pipeline: fetch -> clean -> score & group -> summarise -> store in Supabase -> report.
- Report: overview metrics, top-5 table, 6 charts, 3 strategy observations, 3-group NLP success/failure analysis, cleaning report.
- Bonus: multi-account comparison (up to 3), CSV/JSON export, result cache, retry with backoff, Docker, optional LLM recommendations (rule-based fallback), unit tests.

## 1. Install

Requirements: **Node.js 18.18+** (20 recommended), npm, a free [Supabase](https://supabase.com) project, and (for deployment) a [Vercel](https://vercel.com) account.

```bash
npm install
cp .env.example .env.local      # Windows: copy .env.example .env.local
```

### Supabase setup (once)

1. Create a project at supabase.com.
2. **SQL Editor** -> paste the whole of `supabase/migrations/0001_init.sql` -> Run. This creates the tables and the RLS policies.
3. **Project Settings -> API**: copy the *Project URL* and the *anon public* key into `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   ```
4. **Authentication -> URL Configuration**: set *Site URL* to `http://localhost:3000` and add `http://localhost:3000/auth/callback` (and later your Vercel URL + `/auth/callback`) to *Redirect URLs*. For quick testing you can turn off *Confirm email* under Authentication -> Providers -> Email.

## 2. Run

```bash
npm run dev          # http://localhost:3000
```

1. Sign up (or use Magic link) and sign in.
2. Type e.g. `@demo_account` or `https://www.threads.com/@demo_account`, leave source = *Mock dataset*, click **Collect posts & analyse**.
3. The report opens. Use *Download CSV / JSON* for exports. Enter 2-3 accounts (comma separated) for a comparison table.

Other commands:

```bash
npm test                          # unit tests (vitest)
npm run typecheck                 # tsc --noEmit
npm run report -- demo_account    # offline Markdown report -> reports/, data/ (reviewer convenience only)
npm run build && npm start        # production build
docker compose up --build         # one-command launch (needs .env with the two Supabase vars)
```

## 3. Deploy to Vercel

1. Push this repo to GitHub.
2. Vercel -> *Add New Project* -> import the repo (framework: Next.js is auto-detected; `vercel.json` is included).
3. Add the environment variables below, deploy.
4. Add `https://<your-app>.vercel.app/auth/callback` to Supabase *Redirect URLs* and set the Supabase *Site URL* to the Vercel URL.

## Environment variables

| Variable | Required | Meaning |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Supabase anon (public) key. RLS protects the data; never use the service-role key here |
| `DATA_SOURCE` | no | Reserved default (`mock`); the UI dropdown selects per run |
| `THREADS_ACCESS_TOKEN` | no | Enables the *Official Threads API* option (token owner's own account only) |
| `CACHE_TTL_MINUTES` | no | Reuse a finished analysis of the same account/source within this window (default 60; 0 disables) |
| `ANTHROPIC_API_KEY` | no | If set, strategy recommendations are written by an LLM (falls back to rules on any failure) |

## Database and security

Tables (`supabase/migrations/0001_init.sql`): `profiles` (user data, auto-created by trigger on signup), `analysis_tasks`, `posts`, `analysis_summaries` (JSONB). **RLS is enabled on all four**; every policy is `auth.uid() = user_id` (or `= id` for profiles), so one user can never read or write another user's rows. The app uses only the anon key plus the user's session cookie, so these policies are what enforce isolation; there is no service-role bypass anywhere.

## Metric definitions

| Metric | Definition |
|---|---|
| Interactions | likes + replies + reposts + quotes |
| Engagement rate | interactions / followers x 100 when followers are known; otherwise an **index** = interactions / account mean interactions x 100 (100 = average). Mock data has followers; the official-API source falls back to the index if followers are unavailable |
| Top 5 | highest engagement rate (ties broken by interactions) |
| Posting time | weekday and hour in **Asia/Taipei**; all timestamps are stored as UTC |
| Length vs interaction | Pearson r (characters, words vs interactions) plus 3 length buckets (<=60, 61-180, >180 chars) |
| Keywords | content tokens (stopwords, URLs, hashtags, mentions removed; CJK as character bigrams), counted by number of posts containing the term |
| Post type | one label per post, priority `link > mention > hashtag > plain` (overlapping flags are also reported) |

### Cleaning rules

Duplicates (same id, or same text + same minute) are collapsed keeping the higher-engagement copy. Rows with an unusable timestamp are dropped. **Missing counts are imputed with the column median** (not 0, which would falsely push the post into the "low" group). Missing text becomes empty, a missing URL is rebuilt from username + id. All of this is reported on each report page.

### Success / failure analysis (the "three groups" question)

- **Grouping:** `score = likes + 2 x replies`; top third = **high**, middle third = **mid**, bottom third = **low** (rank-based, so the groups are balanced).
- **NLP method (identical for every post and group):** lexicon/rule features per post (question mark, call-to-action phrases, sentiment from a small lexicon, emoji, exclamations, first-person words, numbers, length, link/hashtag use) -> group means compared with the overall mean -> distinctive terms per group by smoothed log-odds -> **4 sample posts per group** (top 4 of high, 4 closest to the median of mid, bottom 4 of low) are explained with the same feature extractor.

## Known limits

- No real Threads data for arbitrary accounts (platform restriction). Mock data is synthetic: its patterns (questions help, links hurt) are built in, so findings describe the pipeline, not the real world.
- The official API path is untested against a live token and only covers the token owner's account.
- Sentiment is a tiny English lexicon; non-English text mostly gets neutral sentiment. Keyword/term lists from ~40 posts are noisy.
- Terciles are relative to the account itself; they say "better than this account's usual", not "good".
- Followers are not available publicly, so engagement rate may be an index rather than a true rate.
- The cache keys on (user, username, source); the LLM recommendation call is not cached.
- In the environment this was built in the npm registry was blocked, so `npm install`, `next build` and `vitest` were **not** run there; see `AI_LOG.md` for exactly what was and was not verified. Please run `npm install && npm test && npm run build` once on your machine.

## Project layout

```
src/app/            pages (login, dashboard, report/[id], compare) + API routes (analyze, export)
src/components/     LoginForm, AnalyzeForm, Charts (recharts), SignOutButton
src/lib/            clean.ts, analyze.ts, nlp.ts, mock.ts, threads-api.ts, pipeline.ts, llm.ts, retry.ts, supabase/
src/middleware.ts   auth gate
supabase/migrations schema + RLS
tests/              unit tests
data/ reports/      sample outputs from `npm run report`
docs/TIME_LOG.md    exam time-log template
AI_LOG.md           AI collaboration log
```
