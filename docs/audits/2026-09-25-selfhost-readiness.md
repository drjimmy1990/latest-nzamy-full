# 2026-09-25 — Self-hosted Supabase production readiness

**Decision (developer, 2026-09-25):** production moves from the Supabase cloud project
(`gdqfqfcxnwrwgaphtfhu`) to the self-hosted instance at `https://auth.nezamy.sa`, with a **clean start**: cloud
users (181 profiles, 146 of them synthetic UAT actors) are not migrated. The operator checklist is
`دليل_الانتقال_للإنتاج_على_الخادم_الذاتي_٢٠٢٦-٠٩-٢٥.md` (Arabic, for the developer — kept OUT of git because it
describes the server's hardening state; it lives in the developer's local `outputs/selfhost/`).

## 1. What the developer had built (found 2026-09-25, all uncommitted)

- Self-hosted Supabase restored from `scripts/selfhost/run4_delivery/01-schema.sql` (cloud schema dump of
  2026-09-22 17:52 UTC — includes `20260922_01..04`, 0 `MAINTAIN` grants). Data dumps `02-auth-data`/`03-data`
  intentionally not restored.
- `scripts/seed-library-from-owner.mjs` streamed the owner package (2026-09-20) into `library.*`. **Verified:
  all 14 tables equal the source JSONL line counts** (laws 5,901 · articles 110,794 · feqh_blocks 208,775 …).
- 616 blog articles + 614 covers (`blog:seed`, `blog:images`).
- `scripts/seed-clean-test-accounts.mjs` + `دليل_حسابات_الاختبار_النظيفة_٢٠٢٦.md` (12 accounts),
  `scripts/check-counts.mjs`, `OWNER_SEEDING_AND_CONTENT_GUIDE_2026.md` (English).

## 2. Findings on that work (read-only probes)

| # | Severity | Finding | Resolution |
|---|---|---|---|
| S1 | critical | The account seeder hardcoded the **live self-hosted service_role JWT** + a raw-IP plain-HTTP fallback URL, and the shared test password as a default; the accounts md printed the password. Repo is public. Never committed (verified with `git log --all -S`). | Script rewritten: URL/key from env only, no password default, `--url/--key/--password` removed; password removed from the md. |
| S2 | high | Network exposure of the self-hosted stack's internal ports (database, pooler, gateway) needs to be restricted before go-live. | Operator step (local checklist). |
| S3 | high | Auth signup settings on the self-hosted GoTrue must match the cloud's (verified signups only; SMTP; OAuth redirect). | Operator step (local checklist). |
| S4 | high | The seeder ignored every error. Result: 0 `subscriptions` (upsert `onConflict user_id` — only a PK exists); firm/business/government/ngo rows were the `handle_new_user` placeholders (no UNIQUE on `owner_user_id`); `firm-lawyer` not in the firm; `corp-legal` owned a separate placeholder business; lawyers `pending`. | Fixed and applied (§3). |
| S5 | high | Schema-only restore lost every catalog row that migrations INSERT: `admin_pricing_catalog` 27→0, `blog_sections` 31→0, `deadline_rules` 5→0, `court_holidays` 4→0, `jurisdictions` 9→0, `platform_settings` 6→4; the 18 plans had empty `features`/`limits`/`sort_order` (the first seeder upserted them without those fields). | New `scripts/selfhost/copy-reference-data.mjs`; applied (§3). |
| S6 | high | `next.config.ts` `images.remotePatterns` allowed only `*.supabase.co` → every blog cover from `auth.nezamy.sa` would throw in `next/image` after cutover. | Pattern derived from `NEXT_PUBLIC_SUPABASE_URL` (+ `*.supabase.co` kept). Verified: `/_next/image?url=https://auth.nezamy.sa/…webp` → 200. |
| S7 | high | Library at 15× scale: silent 1000-row truncation, search 503s, broken filters (18 findings, LIB-01..18). | Separate batch — see §4. |
| S8 | medium | `scripts/uat/_env.ps1` deny-list knew only the cloud ref, so UAT write scripts would have allowed the self-hosted production host. | Deny-list now also matches the API host (`auth.nezamy.sa`, cloud host); verified it refuses with exit 3. |
| S9 | medium | English owner guide: claimed self-hosted was live, invented expected counts for 7 tables, told the owner `git add .` with an 800 MB package inside the repo. | Replaced by `دليل_المالك_إدارة_المحتوى_٢٠٢٦-٠٩-٢٥.md`; the English file archived in `outputs/archive/` (gitignored). `.gitignore` now excludes `nzamy-developer-test-*/` and `scripts/selfhost/run*_delivery/`. |
| S10 | low | `SUPABASE_DB_URL` in `.env.local` still points at the cloud pooler; `.env.vps` (cloud keys) is a fallback source for the blog scripts. | Operator step; the cloud project's DB password is reset before the project is paused. |
| S11 | low | 2 of 616 blog articles have no cover: their slugs are missing from `blog_images_registry.json` (the uploader reads the registry, not the folder). | Owner content item (guide §١/§٤). |

Checked and fine: realtime publication (`chat_messages`, `notifications`) present; buckets `documents`/`blog-covers`
match cloud (public flag, size limit, MIME list); Studio behind basic auth; JWT not signed with the published demo
secret; `library_status` absent → fails open (`getLibraryStatus`), now inserted anyway; no NZAMY workflow on n8n.

## 3. Applied to self-hosted today (developer-authorised, data only, no DDL)

- `node scripts/selfhost/copy-reference-data.mjs --execute --overwrite --overwrite-settings` — inserted
  jurisdictions 9, blog_sections 31, admin_pricing_catalog 27, court_holidays 4, deadline_rules 5,
  platform_settings 2 (+4 description-only updates), restored `features/limits/sort_order` on 18 plans.
  Re-run → 0 to insert, 0 differing. Coupons (3, all inactive) and the 1 broadcast deliberately **not** copied.
  Snapshot of every source row: `outputs/selfhost/reference-snapshot-*.json`.
- `node scripts/seed-clean-test-accounts.mjs --execute` — 32 changes, 0 failures; second run "no change" for all 12;
  `--verify` → "all 12 accounts match the spec" (server tier via `getUserTier` logic + `user_metadata.tier`).
- `npm run library:counts` → library 14/14 OK, reference 8/8 OK, blog covers 614/616 (S11).

## 4. Library scale (separate commit)

Measured first (dev server on `.env.local` → self-hosted, guest; read-only REST with `count=exact`), then fixed in
three rounds, each fixer followed by an independent verifier that re-measured. Findings file of the measurement:
LIB-01..18. **Deploy rule: this code ships only with the cutover** — on the old cloud data some shapes differ
(`feqh_blocks.book_id` is NULL there, block `order_index` restarts per section), and cloud compatibility was
deliberately not built. The pre-cutover deploy is pinned to `0f08978`.

| ID | Before (measured) | After (measured) |
|---|---|---|
| LIB-01 search | `section=all` 503 cold (5.6s/4.2s); anon 57014 at 3.27s; one slow section failed the whole request | Sections in parallel with a 4.5s budget each, `count:'estimated'`, a failed section → `degraded[]` (others still served); `order('id')` for stable pages with a **≥50-row fetch window** (`SEARCH_MIN_FETCH`; a 6-row LIMIT made Postgres walk the PK: «كوفيد» 3.1s → 0.4–0.7s). Depth cap offset+limit ≤ 1000; past-end page = proven-empty 200 (PGRST103). All section=all probes 0.4–1.3s, 0 degraded. |
| LIB-02 category filter | UI `SA-06` vs stored `06` → always 0 | Normalised at the API (`SA-06`/`06`/`6` → `06`; decrees match `08` and `8`). |
| LIB-03 /laws facets | counts over loaded rows (50/5,901); 28/30 chips empty; `doc_type` hardcoded; section 30 missing | Server facets (`/api/library/facets`, optional RPC `library.law_facet_counts` from **20260925_04**), server-side filters and sort in `/api/library/init`, `doc_type` from the row, section 30 mapped. |
| LIB-04 law page | 1,000 of 1,838 articles | `selectAllPages` → 1,838/1,838; explicit columns (no `fts`, 8.7 MB → ~4 MB). Chapters ordered by the position of their first article, `__orphan__` → «مواد خارج الأبواب» re-placed by article number, empty chapters dropped (civil-transactions-law started at art. 120 → now 1, 3, 19, 25…; descents across the corpus 627 → 108). |
| LIB-05 precedents | 1,000 of 2,323 principles; error ignored | Windowed API (`offset/limit`, paywall by global index), load-more in the page, lock notice rendered. |
| LIB-06/07 feqh books | TOC capped at 1,000 chapters; reader expected nested blocks | Complete TOC, blocks per section/window, reading order by block `order_index` (verified book-global on self-hosted), prefetch, errors surfaced. |
| LIB-08/09 | 50 of 209 collections; decree category never matched | Load-more; category normalisation. |
| LIB-10 autocomplete | count errors became 0 | Errors → `null` + `degraded`; `countsExact` contract. |
| LIB-11 relevance | «نظام العمل» not in the top 6 | Title hits first (نظام boost, «ال» stripped both sides); ts_rank ordering for the `section=all` preview via **20260925_01** `library.search_law_articles_ranked` (optional; the route falls back when absent). |
| LIB-12 | `/laws/civil-procedure` served hardcoded text for a slug that does not exist | 308 alias to `sharia-pleading-law-qadha-edition`; 12 dead related-law slugs resolved or removed; 15 demo smart-folder entries removed. |
| LIB-13 counters | «386 نظاماً / ١٣٬٠٠٠+ مادة» hardcoded (home, banner, about, ai, login) | `src/lib/library/libraryStats.ts` + `GET /api/library/stats` (real counts, cached 24h, floored; `library.laws` labelled «وثيقة نظامية» because only 593 rows are type نظام). |
| LIB-14 sitemap | blog select would cap at 1,000 | Paged blog query; civil-procedure entry → real slug. No per-law URLs yet (law pages are client-rendered — follow-up). |
| LIB-15 admin library | 4 selects capped at 1,000; «الكل» paging 500 from page 5 | Planned per-table windows (PGRST103-safe), substring search kept (fts lost 58% recall), `*` stripped. |
| LIB-16/17 | init shipped `fts`/`preamble`; law JSON fetched twice | Card columns + deterministic order; single fetch. |

Search counts contract (API ↔ `/laws`): `counts`, `countsExact{section}`, `degraded[]`; the UI prints «أكثر من ١٬٠٠٠»
for a non-exact count and an Arabic notice for a degraded section; view-all buttons page through results instead of
promising rows that cannot be reached.

**Migrations (written, Docker-validated, not applied — the developer applies them on self-hosted):**
`20260925_01_library_search_law_articles_ranked.sql`, `20260925_04_law_facet_counts.sql`. Harness:
`supabase/tests/rls/library_search_ranked_and_facets.test.sql` (T1–T4 PASS); `rehearse-staging-order.sh` extended, rc=0.

**Verification:** `npm run test:unit` 1,747/1,747; `tsc` 0 source errors (one stale `.next/types` entry for the deleted
`civil-procedure/page.tsx`, regenerated by the next build); eslint 0 errors on the 79 changed files.

**Known and left (low):** 82 laws still have chapter-order descents that come from the data itself; the 5 free
articles follow `order_index`, not reading order, in ~200 laws (no leak); LIB-18 `effective_date_gregorian` is not
populated by the seeder (enactments widget empty); title-hit lookups do not normalise hamza; no law-status filter;
library pages are not in the sitemap.
