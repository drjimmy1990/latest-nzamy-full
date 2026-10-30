# Owner package 30-Oct — note ١٣ «حصن المكتبة القانونية» (library fortress): ledger

Branch `fix/owner-30oct-library-fortress` (cut from `main` 235e1bef). Sources: the reviewer's
`08-current-code-review/REVIEW.md` NOTE-13-C01…C15, the owner's note `07-references/REF0013.md.html`.
Nothing here was deployed or run against production.

Status wording for every item built here: **fixed in code — awaiting deploy and acceptance test**.
None of them is "closed" until the owner's acceptance test passes on the live site.

## Commits

| Commit | What |
|---|---|
| `7c0c9399` | SQL `20261030_80_library_read_quota.sql` + Docker test (C07, C09) |
| `1398b07a` | Budgets on every library / AI route (C03) + per-user document quota in the proxy (C07) |
| `a58e7cdd` | Library-only security lock: reader notice, status route, admin panel (C09) |
| `11b997c5` | `vault-explorer` admin-only, no error echo (C06) |
| (this doc) | ledger, Arabic owner note, SQL README |

## Blast radius (GitNexus index is stale; mapped by grep)

- `src/proxy.ts` `proxy()`: one new awaited step, `applyLibraryReadQuota`. It returns `null` immediately unless the request
  is `GET /api/library/{laws,books,precedents,decrees}/<one segment>` or `POST /api/library/{search,scoped-search}` /
  `POST /api/ai/{explain-article,library-chat}`, the request carries a Supabase session cookie, and supabase mode is on.
  Every other request runs exactly as before.
- `applyRateLimit` (same file): the new buckets match only `/api/library/**`, `/api/v1/library/**`, `/api/ai/**`.
  The existing buckets are unchanged.
- `src/hooks/useLibraryStatus.ts`: one consumer (`LibraryGuard`). `GET /api/v1/library/status`: one caller (that hook).
  `LibraryGuard` wraps `src/app/{laws,precedents,book/[slug]}/layout.tsx`.
- `src/app/dashboard/admin/security/page.tsx`: one new tab. `vault-explorer`: one caller, `src/app/academy/quiz/page.tsx`
  (unchanged; it already treats a refused call as "no vault questions").
- Branch sweep (every local branch, `git diff --name-only main...<branch>`): no open branch touches `proxy.ts`,
  `rateLimit*`, `admin/security`, `LibraryGuard`, `useLibraryStatus`, `v1/library/status`, `vault-explorer` or
  `academy/quiz`. No library route file was edited (laws, books, init, autocomplete are all rewritten on open branches).

## Per item

### C01 — corpus inside public JS chunks — NOT BUILT (collides with `feat/library-owner-2026-10-30`)
**Verified state.** `src/app/precedents/[slug]/page.tsx:302-371` holds 33 `await import("@/constants/precedents/*.json")`
calls (the folder is 34 MB, 33 files); `src/app/book/[slug]/page.tsx:449-455` imports `@/constants/sources-of-right-1.json`.
Each dynamic import becomes its own chunk under `/_next/static/chunks/`, downloadable by anyone without signing in, whether
or not the fallback ever runs. The precedents page also falls through to that JSON on any API answer below 500 (`:290`), so a
429 or 423 from the API shows the bundled copy.
**Exact change needed (on the library branch, not here):** delete the static-JSON fallback block in
`src/app/precedents/[slug]/page.tsx` (`// Fallback: static JSON imports`, :302-371) and the `sources-of-right-1` branch in
`src/app/book/[slug]/page.tsx` (:449-455); treat every non-OK answer as an error state that shows `body.error`; then delete
(or move outside `src/`) `src/constants/precedents/*.json` and `src/constants/sources-of-right-1.json` once nothing imports
them; verify with `next build` and `grep -l "مبدأ" .next/static/chunks/*.js` (should print nothing). Also check
`src/app/laws/demo-data*.ts` and `law-metadata-map.ts` (the note's items) for any statutory text in client bundles.
Mitigation already here: a locked user never mounts the readers (C09), so the fallback cannot hand him the copy.

### C02 — direct `library` reads with the anon key — OPS CHECK (not code)
**Verified state.** `20260922_01_library_grants.sql:136` grants `usage on schema library to anon, authenticated`. Text columns
are server-only (`20261004_01`, `20261016_01`, `20261018_02`, `20261019_40`, `20260929_01`), but catalogue columns stay
readable straight from PostgREST with the public anon key, bypassing Next and every limit above. Several routes still read
catalogue columns with the cookie client (e.g. autocomplete's decree counts, the precedents collection lookup), so a blanket
`revoke usage` today would break them (the note's own warning).
**Steps for the user (read-only check on production):**
1. SQL editor: `select table_name, column_name from information_schema.column_privileges where grantee = 'anon' and table_schema = 'library' and privilege_type = 'SELECT' order by 1,2;`
   — this is the exact set a scraper can pull with the anon key. Send us the list.
2. `select grantee, privilege_type from information_schema.role_usage_grants where object_schema = 'library';` (schema usage).
3. Check PostgREST's `max-rows` (self-hosted: `PGRST_DB_MAX_ROWS` in the docker env) is set (1000 today per the code comments).
4. Do NOT revoke anything yet: first every library route must move to the service client (a code batch on the library branch),
   then `revoke usage on schema library from anon, authenticated` in its own migration.

### C03 — limits on every library, invitation and AI route — FIXED IN CODE
**Before.** `src/lib/rateLimitRoutes.ts:55-62` covered 4 routes (search, autocomplete, laws/[slug], scoped-search).
**Now.** `libraryBudgetBuckets` (`src/lib/rateLimitRoutes.ts:94`) + `LIBRARY_BUDGETS` (`src/proxy.ts:117`), applied at
`src/proxy.ts:214`. Per visitor (CF-Connecting-IP) and a ten-times-wider ceiling on the proxy-resolved IP:

| Bucket | Covers | Per visitor | Per IP |
|---|---|---|---|
| `library-any` | every method under `/api/library/` and `/api/v1/library/` (catch-all, incl. folders writes, notes, status, access, invitations/redeem, and the routes that only exist on open branches) | 240 / min | 2400 / min |
| `library-doc` | GET laws/[slug], books/[slug], precedents/[slug], decrees/[id] | 120 / min | 1200 / min |
| `library-init` | GET /api/library/init (catalogue, 200 rows a page) | 60 / 10 min | 600 / 10 min |
| `library-ai` | every `/api/ai/*` (explain-article, library-chat) | 40 / 10 min | 400 / 10 min |

Unchanged and still applied: `library-read` 300/min (article-text routes), `strict` 10/10 min on
`POST /api/v1/library/invitations/redeem`, the AI routes' own `rateLimit(... 20/min per IP)`.
**Tests.** `src/lib/rateLimitRoutes.test.ts` walks `src/app/api/library`, `src/app/api/v1/library`, `src/app/api/ai`, reads
each route's exported methods and fails if any (method, path) has no bucket (3 new tests, 23 in the file);
`src/proxy.libraryQuota.test.ts` pins that every bucket is checked per visitor AND per IP.

### C04 — whole-law responses (up to 1,838 articles) — NOT BUILT (collides with `feat/library-owner-2026-10-30`)
**Verified state.** `src/app/api/library/laws/[slug]/route.ts:194-220` reads every article through `selectAllPages` and
returns them all (`:414`). The lock/quota layer now applies to that read (it is a counted document), but one request still
carries the whole law.
**Exact change needed (on the library branch):** accept `?offset=&limit=` on that route (limit default/max 30), return
`pagination { offset, limit, total, hasMore }` like `precedents/[slug]` (`_window.ts`), keep the paywall by GLOBAL article
index; the reader `src/app/laws/[slug]/page.tsx` loads further windows on scroll / on in-law search. The quota key ignores
the query string, so all windows of a law stay one document.

### C05 — locked snippets in autocomplete — ALREADY FIXED ON `lib/S4-catalogue`; not duplicated here
**Verified state on main.** `src/app/api/library/autocomplete/route.ts:197-206` (the `snippet` at :204) returns the first 120 characters of a
principle's text to every caller (service-role read), with no access check.
**Why not edited here.** `lib/S4-catalogue` commit `4a3d210f` already changes exactly this, with the existing rule
(`getLibraryAccessForUser` + `isFreeLibraryItem`, the same as `/api/library/search`), fail-closed (no access answer → locked,
no snippet) and `locked: true` on the item. Editing the same lines here would only create a conflict. S4 is NOT yet merged
into `feat/library-owner-2026-10-30` (`git merge-base --is-ancestor` says no) — the closure lands when S4 merges.

### C06 — `/api/v1/academy/vault-explorer` — CLOSED BEHIND ADMIN (kept, not removed)
**Verified state.** No auth at all, and `err.message` echoed. It reads a hard-coded Windows folder
(`D:\Data\Data\antigravity ai\أكاديمية_نظامي\...`) that does not exist on the Linux production server, so in production it
answered 404 and served nothing; on any machine where the folder exists it handed the whole question bank to a guest.
It is used by `src/app/academy/quiz/page.tsx` (the «مستعرض بنك الأسئلة» tab and a section sample at quiz start), so it was
closed rather than removed.
**Now.** `requireAdmin()` before any disk read (401/403 otherwise), a generic Arabic error, nothing echoed. The quiz page
already falls back to its built-in bank on a refused call. Test: `src/app/api/v1/academy/vault-explorer/route.test.ts` (2).

### C07 — durable per-user counter independent of shared IPs — FIXED IN CODE (needs the SQL to take effect)
**Before.** `src/lib/rateLimit.ts:108` in-memory `Map` only; per IP; reset on restart.
**Now.**
- SQL `supabase/migrations/20261030_80_library_read_quota.sql`: `public.library_read_quota_docs (user_id, day, doc_key,
  allowed, first_at)`, primary key `(user, Riyadh day, document)`; `public.library_read_quota_hit(...)` (`:104`) —
  SECURITY DEFINER, `search_path = ''`, per-user advisory lock, one transaction. A document counts ONCE per day however many
  windows/pages are fetched; re-opening a counted document is free; admins are exempt; the office/company tier is
  `profiles.user_type in ('firm','corporate')` or an active `firm_members` / `business_members` row (each only if the table
  exists). Each user's rows older than yesterday are deleted on his next call (no cron). RLS on, no grant to anon /
  authenticated, execute for `service_role` only.
- App: `src/lib/library/readQuota.ts` (pure: what is counted, the document key — percent-decoded up to 3 times + NFC, so the
  `apiSlug` double-encoding cannot make one law two documents — the Arabic refusals, a 60-second in-process memo) and
  `src/lib/library/readQuotaServer.ts` (one PostgREST RPC call, 1.5 s timeout). Called from `src/proxy.ts:253`
  (`applyLibraryReadQuota`, step 0b at `:366`): the user comes from a verified `getUser()` with branch 1b's cookie pattern
  (never a decoded JWT); guests skipped.
- **Quotas:** individual **220** distinct documents/day, office/company member **400** (both the owner's numbers);
  **120** distinct documents per rolling hour and **lock after 60 distinct refused documents** in a day (chosen here — owner
  questions). At the cap: 429 + Retry-After + «بلغت الحد اليومي…» (documents already opened stay open; resets at Riyadh
  midnight). Reaching the cap never locks anyone.
- **Degrades safely:** a missing function (PGRST202/42883/404), a missing service key, a timeout or an auth failure lets the
  request through unchanged (only the per-visitor buckets apply). The deploy may go before or after the SQL.
- **Not covered (owner questions):** the note's 300 / 600 searches per day (search is lock-checked, not counted); guests'
  25 searches / 20 documents per day (a guest has no durable identity — only the in-memory per-visitor buckets apply);
  the Turnstile challenge at the cap.
**Tests.** Docker: `supabase/tests/rls/library_read_quota.test.sql` — T0–T11 (counting once per document, cap, refusal,
lock on the Nth refusal, lift + reset, office tier incl. a suspended member, admin exempt, hourly cap + promotion, admin
lock + one-open-lock index + expiry, bad arguments, housekeeping, session role cannot read/write/call anything). The
migration ran **twice** (idempotent) then the test: ALL PASS; negative control (no migration) stops at T0, as it must.
Unit: `src/lib/library/readQuota.test.ts` (15), `src/proxy.libraryQuota.test.ts` (5).

### C08 — forged IP headers / direct origin access — OPS CHECKLIST (not code)
`libraryReadClientKey` trusts `CF-Connecting-IP`, which anyone reaching the origin directly can forge; that is why every new
bucket is paired with an X-Real-IP ceiling. The real fix is on the server:
1. Firewall the origin so ports 80/443 accept only Cloudflare's published IP ranges (https://www.cloudflare.com/ips/).
2. In nginx, restore the visitor address: `set_real_ip_from <each Cloudflare range>;` + `real_ip_header CF-Connecting-IP;`,
   and set `proxy_set_header X-Forwarded-For $remote_addr;` (stop `$proxy_add_x_forwarded_for`, which appends to a
   client-sent value — see `src/lib/rateLimit.ts:243-260`).
3. Confirm with `curl -sI https://<origin-ip> -H "Host: nezamy.sa"` from outside Cloudflare: it must time out / be refused.
4. Optional: Cloudflare Authenticated Origin Pulls (mTLS) so only Cloudflare can talk to nginx.
Until then the per-IP ceilings may count one Cloudflare edge for many readers (they are 10x wider for that reason).

### C09 — library-only security lock + admin panel to lift — FIXED IN CODE (needs the SQL)
**Before.** No `library_security_locks` anywhere; `src/app/dashboard/admin/security/page.tsx` entirely mock data.
`accountFreeze.ts` is the account-deletion freeze (60-day purge), unrelated.
**Now.**
- SQL (same file): `public.library_security_locks` (`:55`) — who, reason (`quota_breach` | `admin`), details, note,
  locked_at, locked_until (null = until lifted), locked_by (null = system), lifted_at / lifted_by / lift_note, reference
  `SEC-XXXXXXXXXX`. One open lock per user (partial unique index); rows never deleted; no FK so the record outlives the
  account. `library_security_lock_create` (`:246`, refuses an admin target, returns the existing open lock) and
  `library_security_lock_lift` (`:296`, keeps the row, clears today's count by default so the user is not re-locked on his
  next read). Expired locks close themselves on the next call.
- Enforcement: the proxy returns **423** with the Arabic message, the reference and `/contact` on every counted read, search,
  scoped search and library-AI call. It never touches the account: no freeze, no delete, the rest of the platform works.
- Reader side: `GET /api/v1/library/status` now returns `securityLock` / `readQuota` for the signed-in caller (nulls for
  guests, admins, or before the SQL); `LibraryGuard` shows `LibrarySecurityLockNotice` (account untouched, SEC- reference,
  «تواصل مع الدعم» → `/contact`) instead of mounting the readers, and a banner at the daily cap.
- Admin side: the security page's first tab «قفل المكتبة» (`LibraryLocksPanel.tsx`) — open locks / full history, lock by
  e-mail with a reason and optional end date, one-click lift (with "clear today's count"). API
  `GET/POST /api/v1/admin/library-security-locks` and `POST .../[id]/lift`; GET `requireStaff("read")`, writes
  `requireStaff("settings.write")` (the action the security page is classified under in `adminNavAccess.ts`) + `logAdminAction`.
  The four mock tabs now carry an «بيانات توضيحية» label (they were presented as real).
**Tests.** Docker test above (T3–T8, T11); `src/lib/library/securityLockAdmin.test.ts` (5).

### C10 — print fingerprint — NOT BUILT (what exists / what is missing)
`src/app/laws/components/PrintWatermark.tsx` exists and is used by the law, decree, book and precedents readers. It prints the
display name and a **made-up mobile number** from a hard-coded surname table (`getUserMobile`, :5-31; any real user gets
`0501234567`). That is a fabricated identifier on a printed page. Missing: a real per-subscriber mark (account reference),
the structural HMAC fingerprint in API metadata the note describes, and a printed-file test. Copy already produces plain
Arabic (no zero-width characters were added anywhere).

### C11 — owner Ed25519 bypass key + signed requests — NOT BUILT (owner questions)
No `NZAMY_OWNER_BYPASS_PUBKEY`, `owner:pass` or signature route exists. Needs owner decisions (see the Arabic note).
Today an admin account is already exempt from the per-user quota and cannot be locked; the per-visitor buckets still apply
to admins.

### C12 — encrypted tunnel / nonce / AAD — NOT BUILT (policy)
The reviewer's point stands: encrypting the response to an authorised browser does not stop that browser's user (or his
headless browser) from reading the decrypted text. Recommended instead: server-side windows (C04), quotas and locks (here),
removing the bundled corpus (C01).

### C13 — copy detection / canaries — NOT BUILT (policy)
Needs an owner decision on false positives and who reviews hits. Nothing added.

### C14 / C15 (listed by the reviewer, outside this brief)
C14 dwell-time rule (15 documents at < 6 s): not built; the hourly distinct-document cap is the conservative stand-in.
C15 storage encryption / key / restore evidence: operational, not code.

## How to run the tests

```
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/library/readQuota.test.ts src/lib/rateLimitRoutes.test.ts src/proxy.libraryQuota.test.ts src/lib/library/securityLockAdmin.test.ts src/app/api/v1/academy/vault-explorer/route.test.ts src/lib/rateLimit.test.ts src/proxy.membership.test.ts
R=supabase/tests/rls; M=supabase/migrations
bash $R/run.sh $M/20261030_80_library_read_quota.sql $M/20261030_80_library_read_quota.sql $R/library_read_quota.test.sql
```
Results 2026-10-30: 81 unit tests pass (30 new); SQL ALL PASS; `tsc --noEmit` clean; eslint 0 errors on changed files
(one new warning, `react-hooks/set-state-in-effect` on the panel's load effect, the same pattern as the neighbouring admin
pages). Pre-existing and unrelated: `src/lib/tracking/trackingWiring.test.ts` has 2 failures from `\n`-only regexes over
CRLF working-tree files.

## What could not be verified here
- The proxy step end-to-end in a running app with a real session (no dev server was run against a database).
- Whether nginx caches any `/api/library/*` GET publicly — a cached hit never reaches the proxy, so it would not be counted.
- Production grants (C02) and the origin firewall (C08).
