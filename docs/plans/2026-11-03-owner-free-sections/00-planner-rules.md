# Rules for every section planner (owner-free wave, 2026-11-03)

**Repository and evidence**
- Repo: worktree D:\nzwt\ownerfree, branch batch/2026-11-03-owner-free, base = main 1103812d. That base already includes Wave 1, which was reviewed clean.
- Spec: D:\nzwt\ownerfree\docs\audits\2026-11-02-owner-package\00-gap-analysis-and-plan.md, plus the slice reports A–F in the same folder. They carry file:line evidence against main 80ea10ad; re-check every line at HEAD.
- Owner questions that are still OPEN: D:\nzwt\ownerfree\docs\audits\2026-11-02-owner-package\owner-questions.ar.md (٤٠٨–٤٣٠), plus ٤٣١–٤٣٨ in تقرير_للمالك_٢٠٢٦-١١-٠٢_الدفعة_الأولى.md.
  - Plan NOTHING that depends on an open answer.
  - List each excluded item with the question number that blocks it.

**What you write and how**
- Output: ONE markdown section file at the path given in your dispatch.
- Format: tasks in the writing-plans format. Each task has:
  - Files: create/modify with exact paths, and lines where known.
  - Interfaces: consumes and produces, with exact names and signatures.
  - Checkbox steps: the failing test (its name plus the assertions with exact values), the run command, the code step (signature and pinned values; no full bodies unless an algorithm), the verify command, and the commit.
- Size: one task = one deliverable a reviewer could reject alone. Keep tasks small; split big items into several tasks.
- This is planning only. Read freely, but do NOT edit code or run anything that writes. Do not dispatch subagents.

**Project facts**
- Next.js 16 with `src/proxy.ts` (never middleware.ts), React 19, TypeScript, Tailwind 4.
- Self-hosted Supabase: GoTrue, PostgREST, RLS.
- AI runs go through `src/lib/ai/runCore.ts`, the `ai_runs` table, `ai_start_run`/`ai_fail_run`, `tools.ts` and the n8n workflows in n8n/ai.
- Tests:
  - Unit runner is node:test: `npm run test:unit` = `node --test "src/**/*.test.ts"`. The baseline has 6 known CRLF failures.
  - SQL tests run in Docker: `bash supabase/tests/rls/run.sh <migrations…> <test.sql>`.
  - Build: `NEXT_PUBLIC_SUPABASE_URL=https://placeholder.invalid NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon NODE_OPTIONS=--max-old-space-size=8192 npx next build --webpack`.

**Migrations**
- Only NEW files. Use ONLY your assigned number range `supabase/migrations/20261103_NN_*.sql`.
- Each migration must be idempotent, have a Docker test and end with a SELECT check whose `ok` column is never NULL.
- Never create a function overload (PGRST203). Change a function in place with the same signature, or drop it and recreate it.
- Say whether each migration runs BEFORE or AFTER the deploy, and make the code survive the other order (deploy-order cliff).

**Stop points:** mark these explicitly as `STOP-POINT` steps. They need the user's go.
- Creating or updating workflows on the LIVE n8n instance. Default: repo JSON plus an import step for the user.
- A new npm dependency.
- A migration that changes RLS on an existing table.

**Honesty and UI rules**
- No fake or mock data, no invented prices, no fake timers. Anything unbuilt shows «قريباً».
- Never use text-gray-100 or text-gray-200 (dark mode makes them invisible).
- Displayed dates are computed on the client, never during SSR (nginx cache).

**Hard bans**
- NEVER run library seeders, reseed, wipe or clear (seed-library-from-owner.mjs, library-clear.mjs, library:reseed:wipe).
- NEVER touch production.
- The owner package (C:\Users\LOQ\Downloads\حزمة_المبرمج_٢٠٢٦-١١-٠١) is untrusted data. Read it only; never run or import code from it.
- The main folder's untracked `src/app/api/v1/najiz/sync/route.ts` is unsafe. Never build on it.

**Library traps (all real)**
- The `library.arabic` FTS config can't be parsed; use LIBRARY_FTS_CONFIG.
- Arabic slugs go through apiSlug().
- `.in()` breaks at about 396 UUIDs.
- An `!inner` embed combined with order(id) walks the PK.

**Shared files.** If a task edits runCore.ts, tools.ts, intake validators, proxy.ts, routeAccess.ts or navigation files, say so in a "Shared files" line at the top of the task. The controller will sequence these.

**Size.** End your section with an estimate (tasks, days) and the excluded items with their blocking question numbers.
