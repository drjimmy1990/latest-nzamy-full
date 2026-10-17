# 2026-10-18 batch (the owner's 16 Oct answers): one SQL run order and one deploy

Built one piece at a time on `batch/2026-10-17-owner-answers`: pricing and points (١٧٣–١٨٠), the library and court-procedure answers (١٨١–١٨٤), the honesty / UX answers (١٨٩–١٩٨ plus a second honesty pass), and the N16 security fix. The owner report is `تقرير_للمالك_٢٠٢٦-١٠-١٨.md`; new owner questions ٢١٩–٢٢٣.

**Who runs what:** you run every SQL file in the Supabase SQL Editor on `auth.nezamy.sa` (signed in as `postgres`). Paste the whole file and click Run. Each file is idempotent and ends with `verify: OK`; a failed verify rolls the whole file back.

**Merged tree checks:**
- 2,447/2,447 unit tests on Node 22; type-check clean; lint 0 errors.
- A Docker database test for each new migration, each run twice, each with a negative control (the test fails without the migration).
- New `_verify.sql` sections tested in Docker before and after their migration.
- A local webpack production build compiled every page. Its route type check flags 4 files for extra exports (`ai/page`, `api/library/laws/[slug]/route`, `dashboard/firm/layout`, `dashboard/lawyer/deadlines/page`). Their exports are identical to main and to live, and the Turbopack build on the server accepts them (same as the 17 Oct batch).

## Step 1: SQL before the deploy

| # | File | What it does | Order |
|---|---|---|---|
| 1 | `20261018_03_community_civil_category.sql` | «مدني» becomes its own community category; the questions stored as «أخرى» move to it (owner ١٩٠) | **before the deploy** — the new code writes `civil`, which the old CHECK rejects |
| 2 | `20261018_01_deadline_rules_admin_objection.sql` | Two verified deadline rules: administrative-court objection 30 days, urgent requests 10 days (owner ١٨١) | any time |
| 3 | `20261018_04_service_requests_session_write_guard.sql` | A client can no longer assign a lawyer to a request (and so open a chat with them) or rewrite a request's description / metadata / payment through REST (plan N16) | any time — today's code passes it |

## Step 2: deploy

```bash
cd /www/wwwroot/nzamy/latest-nzamy-full && nohup bash deploy.sh > /root/deploy-$(date +%F).log 2>&1 &
```

```bash
tail -f /root/deploy-$(date +%F).log
```

No new dependency, so no `npm install`.

## Step 3: SQL after the deploy

4. `20261018_02_library_feqh_decree_text_lock.sql`: fiqh text (`matn`, `sharh`, `hashiyah`, `fts`) and decree page text become server-only, plus `library.search_feqh_page`, the fiqh search with its own 4-second limit (owner ١٨٣).
   - **After** the deploy, never before: the new code reads that text with the service role. Before the deploy, every fiqh book and decree page would answer 500 until the code arrives.
   - Right after, the developer checks a book, a decree and a fiqh search from outside.

## Step 4: `_verify.sql`

5. `supabase/migrations/_verify.sql`, copied fresh. Two new sections at the end (`20261018_02`, `20261018_04`). `01` and `03` verify themselves.

## Held

- **Owner ١٨٦ (company charters):** needs the owner to move the three files in his library (question ٢٢٢); nothing to run.
- **Owner ١٧٣ (consultant account), ١٨٧ partner routing:** not built (questions ٢١٩, ٢٢٣).

## What users will notice

- Pricing pages show the owner's 16 Oct prices, points and refund wording; the «first 500» and «free memo» offers are gone.
- Guests and free accounts see the first two printed pages of a fiqh book or a decree; past them a block or page shows its place and a lock card, no text. Fiqh search hits for them carry no snippet.
- The court-fee calculator uses the regulation's bands (one rate on the whole claim) and flat request fees (5,000 / 7,000 / 10,000).
- The administrative-court objection rules appear in the deadline calculator and the radar.
- The procedures page's circuits tab is the real 2,192-address Ministry directory.
- The draft cart can send to the research collector; the profile QR has the logo at its centre.
- «مدني» is a separate community category.
- Clients can no longer pick a request's lawyer; nothing they do today changes.
