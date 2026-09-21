# Review of the 2026-09-20/21 update — what must be fixed or changed

> **Status 2026-09-22:** A1–A6 (and B3, needed by A5) are closed in the 2026-09-22 batch — see `docs/audits/2026-09-22-critical-fixes.md`; the three migrations `20260922_01..03` are applied by the developer before that code is deployed. B1–B17 (except B3), C, D and E remain open.

**Scope:** the three commits that landed on `main` after our last commit `17a81b9` (2026-09-05):

| Commit | What it is |
|---|---|
| `fbf9c58` | Sync of the owner's technical package (`nzamy-developer-test-نهائي-2026-09-20/web/`) over `main`: 371 files, 17 new migrations, library parsers/seeder rewrite, PWA, academy, capacitor deps, many `src/` pages. |
| `3e2f5db` | The profiles fix batch (WP-0..WP-7): 192 files, 4 new migrations `20260921_01..04`, auth/session rework, business members API, dashboards, settings tabs, contact/register validation. |
| `8727d2d` | `_verify.sql` storage-policy gate by content. |

**Method:** 9 read-only reviewers (migrations, auth, business API, DB exposure, owner-sync ×2, tooling, docs, UI), then every finding judged by two independent verifiers (one trying to refute, one establishing live impact), then a completeness critic. 131 agents, 60 raw findings → 55 confirmed, 5 refuted. Every item below cites the current tree (`HEAD 8727d2d`) and, where it says "live", was reproduced against production (`gdqfqfcxnwrwgaphtfhu` / `nezamy.sa`) with read-only probes on 2026-09-21.

**Production state confirmed:** batch A + B migrations (15 files, order in `_fix-delivery-2026-09-20/sql-apply-order/README-ORDER.md`) are applied and correct — profiles lockdown, subscription revoke, entity recursion fix (8 helpers, no 42P17), phone constraint (0 violating rows), court costs, `service_requests.business_id`, 20260917 RPCs, batch-B library columns. The new code is deployed on nezamy.sa. Batch C (academy, feqh `is_synthetic_page`, `needs_human_review`, private precedents) is not applied, as intended.

**What is good:** the four `20260921_*` migrations are sound (the entity matrix drops nothing a later feature needs; the `handle_new_user` body is a faithful carry-forward of 20260827 with only the phone clamp added; the CHECK regex matches `saudiMobile.ts`; the 20260917 RPCs test `requester_user_id = auth.uid()`; every new table has RLS on and anon reads 0 rows; the `_verify.sql` gates match the live catalog). REVIEW-2's two MUST FIX items are applied at HEAD (LIKE-pattern e-mail lookup escaped in both invite routes). Local gates, re-run after `npm ci` on the locked toolchain (next 16.3.3 / eslint-config-next 16.3.3): unit 1431/1431 pass (1430/1431 under `TZ=UTC`, see B18), lint 3 errors / 3915 warnings (B17), type-check 1254 errors all inside the nested owner ZIP (B19).

---

## A. Act today — security incidents and a broken production feature

### A1. A production admin password is in a public GitHub repo (C02) — CRITICAL
`scripts/simulate_human_admin.py:44-45` (and eight sibling `simulate_human_*.py`, all tracked, all pushed at `fbf9c58`) contain `ADMIN_EMAIL = "admin.uat-20260915-full@nzamy.test"` and the plaintext `UNIVERSAL_PASSWORD`, with `LIVE_BASE_URL = "https://nezamy.sa"`. The repo `drjimmy1990/latest-nzamy-full` is **public**; the raw file is served to anyone. That account is a live `user_type = admin` on production (created 2026-09-15), and 18 other live UAT accounts (firm owners, corporate owner + manager, judge, prosecutor, lawyer, client…) share the same password.

Do now, in this order:
1. Ban or delete the four synthetic admins on production: `admin.uat-20260915-full@`, `admin.uat-20260921-161948@`, `-162542@`, `-163451@nzamy.test` (or at minimum reset their passwords and demote `user_type`). Then the other 18 accounts named in the scripts.
2. Strip the literal from all nine scripts (read `os.environ["UAT_PASSWORD"]`; default `LIVE_BASE_URL` to localhost with an explicit `--live` flag). Rotation is mandatory; rewriting history is optional and not sufficient on its own.
3. Decide whether this repo should be public at all — it also ships every migration and the owner's internal reports.

### A2. Production is 81% synthetic accounts, and the UAT scripts write to production by default (C03, F05) — CRITICAL
Live counts today: 180 profiles, **146** with `@nzamy.test` / `metadata.uat_run` (4 runs: `uat-20260915-full` = 47, three `uat-20260921-*` runs = 99 created today), 25 corporate accounts, 43 `business_members` rows, 41 `firm_members` rows, 4 `cases` rows — almost all of it fixtures. There is no teardown script (`scripts/uat/backup-test-state.ps1` is read-only). Every `scripts/uat/*.ps1` reads `.env.local`, which **is** production; the only guard is a presence check. Six of them write with the service-role key (`verify-core-tenant-isolation.ps1` POSTs `service_requests`/`cases`/`notifications`, `verify-subscription-rls.ps1` writes `subscriptions`, `verify-document-storage-isolation.ps1` uploads/deletes in the `documents` bucket, `verify-profile-write-guards.ps1` PATCHes `profiles`…). The owner report §5 step 2 tells the reader to run them again.

Fix: (1) write the teardown the header of `seed-actors.ps1:2-5` promises — select by `metadata->>'uat_run' is not null` for profiles/auth users, **plus** every `firm_profiles`/`business_profiles`/`*_members`/`service_requests`/`cases`/`notifications` row whose owner or requester is in that id set (the seed script adopts trigger-created entity rows, so the tag alone misses 8 of 10 synthetic firms and all 24 synthetic companies); review it, back up, run it once. (2) Add a shared `scripts/uat/_env.ps1` that parses the project ref out of `NEXT_PUBLIC_SUPABASE_URL` and refuses writes unless the ref is on an explicit test allow-list. (3) Stand up a real second Supabase project for UAT; until then no `verify-*.ps1` may run against this one.

### A3. Any signed-in user can grant themselves Pro for free (C01) — CRITICAL, live
`POST /api/v1/invite/sync` (`src/app/api/v1/invite/sync/route.ts:104-119`) lets any authenticated caller write up to 20 self-chosen codes into `public.invitations` with the **service-role client**, `tier: null`. `POST /api/v1/invite/[code]/accept` (`accept/route.ts:41-95`) never compares `inviter_id` to the caller, and line 79 turns the null tier into `"pro"` (14 days). `grantEntitlement` first **cancels** the user's real active subscription. Two POSTs = a renewable free Pro; rows are stamped `method: "admin_grant"` so they look legitimate in the admin console. `sync/route.ts` has zero callers (its client, `invitationStore.ts`, was deleted on 2026-09-05).

Fix: delete `src/app/api/v1/invite/sync/route.ts`; in `accept/route.ts` add `inviter_id` to the select (line 53) and return 403 «لا يمكن قبول دعوة أنشأتها بنفسك» when it equals `user.id`; stop defaulting a null tier to `pro` (refuse instead); do not cancel an active paid subscription when applying a lower/equal trial.

### A4. Every law page serves zero articles (F01) — CRITICAL, live now
`GET https://nezamy.sa/api/library/laws/public-prosecution-law` returns 200 with `chapters: 1, articles: 0, paywall.totalArticles: 0` while the DB holds 30 articles for that law. Cause: `src/app/api/library/laws/[slug]/route.ts:83-87` embeds `article_regulations (*)` in the articles select; `library.article_regulations` (created by `20260730`, applied 2026-09-21) was never granted to `anon`, `authenticated` **or** `service_role` (the only grant in the repo is the one-shot `grant select on all tables in schema library` at `20260626_legal_library_schema.sql:885-886`, with no default privileges). PostgREST fails the whole embedded query with 42501; line 80 does not read `error`, so the page renders empty with HTTP 200. Same class: `library.v_laws_enactment_status` and the matview `cross_section_search` are ungranted (no live reader today).

Fix, as one migration applied via the SQL Editor (not `db push`):
```sql
grant select on library.article_regulations to anon, authenticated;
grant all    on library.article_regulations to service_role;
grant select on library.v_laws_enactment_status to anon, authenticated, service_role;
grant select on library.cross_section_search   to anon, authenticated, service_role;
alter default privileges in schema library grant select on tables to anon, authenticated;
alter default privileges in schema library grant all on tables, sequences to service_role;
```
Then in the route destructure `error` at line 80 and fail loudly like the `lawError` branch (:88-94). Add a `has_table_privilege('anon','library.article_regulations','SELECT')` gate to `_verify.sql`. The seeder (`scripts/seed-library.ts:813-814`, service-role client) is blocked on the same table until the `grant all` lands (F26).

**Ship F13 in the same commit:** `route.ts:139-160` builds `regulationInstruments` with full `r.text` for every regulation, never consulting `hasFullAccess`/`freeLimit`; `laws/[slug]/page.tsx:857-920` renders it unconditionally in the «regulation-only» tab. Today it is masked by A4; the moment the grant lands, every anonymous visitor reads the full executive-regulation text for free. Omit (not truncate) the instruments of locked articles, mirroring `formatArticleWithPaywall:325`.

### A5. A company owner can add anyone to the roster without consent and read their private requests (F03) — CRITICAL
`POST /api/v1/business/members` (`route.ts:359-372`) inserts `status: 'active'`, `accepted_at: now()` for any account whose e-mail matches and whose type is individual/lawyer/corporate — no invitation step, no notification, and the victim cannot leave (PATCH is owner-only). From then on 20260914's policy «business members read business service requests» plus `service-requests/route.ts:162-169` (which drops the personal filter when `businessId` is set) route the victim's private consultations into the company feed. Anyone can register a corporate account today.

Fix: insert `status: 'invited', accepted_at: null` (CHECK allows it; every read filters `status='active'`, so an invited row grants nothing), notify the invitee, and build the accept/decline PATCH the invited user calls on their own row. Keep `serviceRequestEntityScope.ts` as is (the verifier showed "require explicit scope" would break the corporate intake).

### A6. Any lawyer can self-verify and self-credit (F04) — CRITICAL (latent: 0 verified lawyers today)
`"lawyers update own profile"` (`20260603_phase1_001_profiles.sql:144-147`) is row-scoped with no column list; `authenticated` holds Supabase's default table-level UPDATE. A direct `PATCH /rest/v1/lawyer_profiles?user_id=eq.<me> {"verification_status":"verified","credit_balance":999999}` succeeds. The route allowlist in `profile/route.ts:452-480` is only a convention. `provider_profiles` has the same shape.

Fix — and note the verifier proved a plain column-level `REVOKE` is a **no-op** while the table-level grant exists — one migration:
```sql
begin;
revoke update on public.lawyer_profiles from authenticated, anon;
grant  update (bio_ar, bio_en, headline, slug, office_address, license_issued_on, is_accepting_clients,
               marketplace_visible, show_contact, specialties, languages, education, years_experience,
               consultation_fee, updated_at /* = the PATCH /api/v1/profile allowlist, verify against route.ts:452-480 */)
       on public.lawyer_profiles to authenticated;
revoke insert on public.lawyer_profiles from authenticated, anon;   -- signup inserts run in handle_new_user (definer)
revoke update on public.provider_profiles from authenticated, anon;
grant  update (/* provider self-editable columns */) on public.provider_profiles to authenticated;
commit;
```
Confirm the column list against every RLS-scoped writer before applying; add `has_column_privilege` assertions to `_verify.sql`.

---

## B. Fix before the next deploy

| # | Finding | Where | Fix |
|---|---|---|---|
| B1 (F06) HIGH | `enforce_requester_cancel_lock` exempts a requester who set `assigned_to` to themselves at creation (`service-requests/route.ts:471` copies it from the body), so a delivered AI order can be cancelled via raw PATCH. | `20260917…rpc.sql:410` | Delete the conjunct `and auth.uid() is distinct from old.assigned_to` and re-apply the function (idempotent; the `receiver <> 'ai_workspace'` short-circuit keeps self-tracking rows working). |
| B2 (F07) HIGH | `revoke update (description, metadata)` at `20260917:438` is a no-op (table-level UPDATE grant survives). The "only writable path is the RPC" claim is false. | `20260917:438` | New migration: `revoke update on public.service_requests from authenticated, anon;` then `grant update (status, lawyer_client_id, updated_at) …to authenticated` (`updated_at` is required or `cancel_own_service_request`, SECURITY INVOKER, breaks). Add `has_column_privilege` gates. |
| B3 (F08) HIGH | Edge Gate 2 (`src/proxy.ts:534-563`) decides on `profiles.user_type` only; an individual added as a company member is bounced to `/dashboard/client` before the page renders. `entityMembershipKindForPath` exists but is unwired. | `src/proxy.ts:537` | Inside the failing branch only, call `entityMembershipKindForPath(pathname)`; on firm/business do one RLS read of `*_members` (`status='active'`) or `*_profiles.owner_user_id`; pass if found; fail open on read error; pin in `routeAccess.test.ts`. |
| B4 (F10) HIGH | `isTransportFailure` treats GoTrue **500** and **429** as "anonymous" → signs valid sessions out (and on the refresh path auth-js destroys the stored session). | `src/lib/auth/resolveAuthOutcome.ts:61` | Add `if (typeof error.status === 'number' && (error.status >= 500 \|\| error.status === 429)) return true;` + tests. |
| B5 (F02) MEDIUM | `revoke select on profiles from anon` cascades: policies on `lawyer_profiles`, `provider_profiles`, `micro_profiles`, `articles`, `document_shares`, `receipts` still inline `select 1 from public.profiles … user_type='admin'`, so **every anon read of those tables is 401/42501** (live). No user-visible break today (blog/lawyers use the service client; 0 verified lawyers), but the public lawyer page breaks the day one is verified. | `20260921_01:117` (keep it) | New migration: enumerate policies whose expression matches `from public.profiles` and re-create each admin arm as `using (public.is_admin())` (20260625's definer pattern). Re-run the anon sweep. |
| B6 (F23, F25) MEDIUM | `profiles.email`, `verified_at`, `nafath_verified`, `metadata` are self-writable via PostgREST; invite lookups key on `email` (an attacker sets their email to a colleague's and gets invited in their place); `verified_at` drives the admin users «active» column. | `20260921_01:109-114` | One migration: `revoke update on public.profiles from authenticated, anon; grant update (display_name, display_name_en, phone, avatar_url, language, calendar_type, theme, country_code, city, onboarding_completed, nationality) on public.profiles to authenticated;` (the exact PATCH allowlist). |
| B7 (F11) MEDIUM | `reviews` SELECT policy is `using (status='active')` for everyone with every column, so `reviewer_id`/`request_id` of an anonymous review are readable by REST — the `_redact.ts` DTO is the only guard. | `20260603…005:401` | Column-level: `revoke select (reviewer_id, request_id) on public.reviews from anon, authenticated` after a table-level revoke + re-grant of the other columns, or a `reviews_public` security-invoker view; keep `lawyer_review_stats` reading. |
| B8 (F12) HIGH | Combined search (`section:'all'`, the UI default) 503s when the feqh sub-query hits statement timeout; root cause is `{count:'exact'}` over the FTS match set at `search/route.ts:329` (also :124/:200/:261) while only 6 preview rows are used. | `src/app/api/library/search/route.ts:338` | Drop the exact count on the multi-section path (or `count:'planned'`); return the sections that succeeded with a `degraded` marker instead of failing the whole request (pattern in `library/init/route.ts:77-87`). |
| B9 (F21) HIGH | `?from=` is produced by `proxy.ts:357` and `ServerSessionGate.tsx:67` but **read by nothing** — every deep link is lost after login (live: `/dashboard` → `/login?from=%2Fdashboard`). | `src/app/login/page.tsx` | Extract the guard at `auth/callback/route.ts:67-74` into `safeRedirectPath()`; read `from` via `window.location.search` in an effect; use it at all three destinations and forward through OAuth. |
| B10 (F46) HIGH | Membership lookups use `.limit(1).maybeSingle()` with no order at 5 sites; 16 live users already hold two active `business_members` rows, so roster/settings/request `business_id` pick an arbitrary company. | `business/members/route.ts:138`, `profile/route.ts:120`, `service-requests/route.ts:17-30`, `firmMembershipAccess.ts:45`, `useUser.ts` | Prefer the company the user **owns**, then the explicit `requestedScope`, then `created_at`; apply the same rule at all sites. |
| B11 (F45) HIGH | `service-requests/route.ts:493` returns raw Postgres `message/code/hint` in English; `:464` takes the **primary key from the body** (`id: requestData.id ?? crypto.randomUUID()`) with no validation in `validateServiceRequestCreate`. | `route.ts:464,493` | Always generate the id server-side (or validate uuid + reject collisions as a generic 409); Arabic error map like `business/members/route.ts:198-212`. |
| B12 (F18) MEDIUM | A removed company member can never be re-added: removal is `status='removed'`, the unique index is total, so re-invite → 409 «عضو مسبقاً»; the team page hides the reactivate control for removed rows. | `team/page.tsx:349`, `members/route.ts:377` | Three-state status button (removed → «إعادة التفعيل» → PATCH `active`); on 23505 in POST re-read the row and reactivate instead of 409. |
| B13 (F22) MEDIUM | `20260921_03` adds a `*_members` DELETE arm (owner/admin) that the API deliberately never exposes; an owner's session can hard-delete roster history via PostgREST. Specified and tested in the migration, so it is a **decision**, not a slip. | `20260921_03:85` | Either `revoke delete on public.*_members from authenticated` (keeps the RLS arm for admin/service paths) or add the DELETE handler and update the comment at `[memberId]/route.ts:27-31`. |
| B14 (F24) MEDIUM | `assigned_to` copied from the body at `service-requests/route.ts:471`; three live callers legitimately send **self**. | `route.ts:471` | Clamp to self: `assigned_to === user.id ? user.id : null` (do not drop the column — the lawyer workspace filters on it). |
| B15 (F09) MEDIUM | `useUser.ts:937` ignores `error` from `getUser()` and sets `GUEST_SESSION` on transport failure (and in the catch at :1000); `UserTypeGuard` then renders a hard refusal for a validly signed-in user. | `src/hooks/useUser.ts:937,946,1000` | Destructure `error`, call `resolveAuthOutcome`; on `unavailable` keep the previous logged-in session or expose `authState:'unavailable'` for the guards to render a banner. |
| B16 (F17) MEDIUM | `/contact` submit button is disabled on first paint (`phoneValid` is false for an empty field, `phoneTouched` false so no reason shows) — live SSR contains `disabled=""`. | `src/app/contact/page.tsx:52` | `const phoneValid = !form.phone \|\| phoneResult.ok;` and keep `required` (the server still rejects a non-Saudi number; mandatory phone is the existing product rule). |
| B17 (F14) MEDIUM | `npm run lint` exits 1: 3 `react-hooks/preserve-manual-memoization` errors — `GlobalSearch.tsx:162/189` (new `useCallback`) and `client/page.tsx:332`. `ci.yml:46-71`'s comment names the wrong files. | `eslint.config.mjs:28-35` | Add `"react-hooks/preserve-manual-memoization": "warn"` to the existing `nzamy/react-rules-as-warn` block (its stated intent); fix the ci.yml note. |

### B18. CI on `main` has been red since the workflow was created (my own checks)
GitHub Actions shows every run on `main` failing since `c15da9e` (2026-09-05):
- **Sept 5 → Sept 21 runs:** the "Unit tests" step fails on one timezone-dependent test. Reproduced locally with `TZ=UTC npm run test:unit` → 1430/1431, failing `src/lib/deadlineReminders.test.ts:103`: the test seeds `today = new Date("2026-09-04T00:00:00+03:00")` but `daysUntil()` (`src/lib/services/deadlineEngine.ts:75-80`) counts days in the **machine's local zone**, so on a UTC runner (and on the UTC VPS around midnight Riyadh) the day count is off by one. Fix: compute "today" in `Asia/Riyadh` via `Intl.DateTimeFormat(...).formatToParts` inside `daysUntil`/`parseIsoDate` consumers, or at minimum seed the test with a local-midnight `new Date(2026, 8, 4)`. The engine fix is the right one — the cron on the server runs in UTC.
- **The 2026-09-21 run** fails earlier, at `npm ci`, in both jobs. Reproduced with `npx npm@10 ci --dry-run` (CI's Node 22 ships npm 10): `Invalid: lock file's minimatch@10.2.6 does not satisfy minimatch@10.2.5` — npm 10 rejects the owner's version-keyed `overrides` (`package.json:88-96`); npm 11 here accepts them. Fix: drop the three `minimatch@x.y.z` keys (the parents already require patched `brace-expansion` ranges) or pin `packageManager`/`engines.npm >= 11`; regenerate the lock and verify with `npx npm@10 ci --dry-run`.
- Lint job: B17.

### B19. `npm run type-check` fails on this machine only because the owner's ZIP is extracted inside the repo
1254 errors, all under `nzamy-developer-test-نهائي-2026-09-20/` (git-excluded via `.git/info/exclude`, but `tsconfig.json` includes `**/*.ts` and excludes only `node_modules`, `test`, `native`). `next build`'s type step and `eslint .` walk it too (ESLint spent 899 of 1782 file paths there). Fix: move the folder out of the repo directory (sibling `../`), which fixes tsc, lint noise and F32 at once; do not add machine-local names to the tracked configs.

### B20. `deploy.sh` runs `npx supabase db push`
`README-ORDER.md` states `db push` was never used on this project and cannot be (no `schema_migrations` table, 15 groups of duplicate 8-digit prefixes). `deploy.sh:7`, `DEPLOY_AND_SMOKETEST_RUNBOOK.md:18`, `ARCHITECTURE.md:222` and `REMAINING_WORK.md:31` all still say `db push`. Replace the step with an explicit abort that points at the SQL-Editor apply order, and make README-ORDER the process of record (F16, F49).

---

## C. Content honesty and UI (owner rules: no fabricated data, no «قريباً» outside `DashboardComingSoon`, Arabic only, dark-mode gray trap)

| # | Finding | Fix |
|---|---|---|
| C1 (C05) HIGH | `src/app/academy/certificates/page.tsx:11-22` and `my-courses/page.tsx:11-45` show fabricated certificates («شهاداتي», verification number `NZM-2026-CRT-8821`, instructors «أ. سارة الحربي»/«أ. محمد العتيبي», 75% progress) to any anonymous visitor, live, behind a «جديد» navbar badge. | Replace both bodies with `DashboardComingSoon` (as the six business pages), delete `MY_CERTS`/`MY_COURSES` and the first-person prose; drop the «جديد» badge. |
| C2 (C04) HIGH | `src/app/api/v1/academy/vault-explorer/route.ts:5-6` reads a hardcoded `D:\Data\...\أكاديمية_نظامي\...` path, unauthenticated, and returns `err.message` (the absolute path, English) in a 500 — live: `GET /api/v1/academy/vault-explorer?section=04` → 500 ENOENT with the path. The «مستعرض بنك الأسئلة (16k)» tab in `/academy/quiz` is permanently dead. | Delete the route and the four fetch call sites in `academy/quiz/page.tsx` (:368, :386, :400, :422); fall back to the bundled `src/data/academy/questions.ts`; fixed Arabic error bodies only. |
| C3 (F30) HIGH | Admin «الأمان» (`admin/security/page.tsx:15-42`) renders fabricated duplicate-account suspects, blocked IPs and failed logins as live findings, nav-linked from `AdminSidebar.tsx:71`; `payouts`, `escrow`, `disputes` pages are fixtures with no backing table (`payouts`/`provider_payouts`/`disputes` 404 on prod). | Delete the mock arrays and render the built/unbuilt state honestly, or `DashboardComingSoon` for the four pages (coupons page precedent: no «بيانات تجريبية» caption over fake rows). |
| C4 (F41) HIGH | `globals.css:140-142` makes `--color-gray-200` = 10% white in dark mode; new sites in `admin/ai-usage/page.tsx:179,224`, `laws/page.tsx:1413`, `MyMarketplaceDashboard.tsx:168,181,194,351` use `text-gray-200` on the dark branch (live stylesheet confirmed). 148 dark-branch sites in 74 files repo-wide. | Add a `.dark .text-gray-200 { color: … }` rescue beside the existing `.dark .text-white` block (`globals.css:155-175`, outside `@layer`), then fix the six new sites to `text-gray-300`. |
| C5 (F39) MEDIUM | Four Arabic label maps for the nine business roles; the team page prints one in the roster badge (:302) and another in the same card's `<select>` (:343): «رئيس قسم» vs «مدير قسم», «موظف عام» vs «موظف», «رئيس الشؤون القانونية» vs «مدير الشؤون القانونية». | Build `ROLE_OPTIONS` in `team/page.tsx:78-81` from `BUSINESS_ROLE_LABEL`; then converge the maps (the `settingsReadiness.test.ts:51-57` regex needs string literals, so do not import across). |
| C6 (F28) MEDIUM | Pricing CTAs send `?plan=shield/group/impact/institutional` to `/register/client`, which never reads `plan`; `Step4`'s two activation cards are unreachable, and `plan=shield` is sent by two different products with different prices. | Preferred: delete the dead `intendedPlan` wiring and the two cards. If kept: read `plan` beside `type`, key on `clientType + plan`, and only after the plans become purchasable. |
| C7 (F29) MEDIUM | `src/app/ai/settings/page.tsx:18-21` pre-fills «التعليمات الشخصية» with invented first-person content («أنا محامٍ متخصص في قضايا العمل…») and saves to `localStorage` (`nzamy-ai-settings`) that nothing reads; page is unlinked (URL only). | Blank the seeded content; either persist server-side through a real consumer or remove the page until one exists. Do not route it through `entitySettings` (400 for lawyers/individuals). |
| C8 (F47) LOW | Firm roster emits `displayName: '—'` where the company roster emits `null`; the firm PATCH sibling does the same. | Emit one three-state value from all four DTO sites and update `firmMembersService.ts` + the three firm screens in the same commit (a lone `?? null` crashes `/dashboard/firm/team`). |
| C9 (C08) LOW | `BetaReviewGate.tsx:381-387` renders a second, generic error paragraph under the button (added by `fbf9c58`) beside the specific one at :362-366; currently unreachable (`payload` branch), but wrong. | Delete lines 381-387 (not 380-385 — that orphans the closing `)}`). |
| C10 (F43) MEDIUM | `proxy.ts:350-352` sets `x-nzamy-auth: unavailable` on the **response**, and on that path returns a fresh `nextWithPathname()` instead of `supabaseResponse`, dropping any rotated refresh-token `Set-Cookie`. | Replace the three lines with `return supabaseResponse;`. Never let the marker short-circuit `ServerSessionGate`'s own `getUser()`. |
| C11 (F44) LOW | `proxy.ts:149-154` boot throw can never fire (`isSupabaseMode` is unconditionally true in production); `.env.example:80-83` credits it. | Delete the dead block; name `src/instrumentation.ts:35-43` as the single boot assertion. |

---

## D. Data model, migrations and repo hygiene

| # | Finding | Fix |
|---|---|---|
| D1 (C06) MEDIUM | `20260811_ai_review_requests` was applied for `POST /api/v1/ai-review-requests`, an **unauthenticated service-role INSERT** with no caller (BetaReviewGate now posts to `/api/v1/service-requests`); the table has RLS on and zero policies, so nothing can read it. README-ORDER row 13's justification is false. | Delete the route (keep the empty table); correct README-ORDER:58. |
| D2 (C07) MEDIUM | README-ORDER's ledger does not reconcile: 71 files, 43 applied, 28 unapplied; A+B apply 15, C defers 4 → **9 unclassified**, including `20260823_fts_number_search` and `20260824_articles_number_text_widen` (whose header couples it to the `substring(0,50)` truncation now at `seed-library.ts:722`, not :403). | Add a fourth section listing every unclassified file with an explicit apply/defer decision; fix the stale pointer in the widen migration's header. |
| D3 (F19) LOW | `20260730_article_regulations.sql:67` bare `create trigger` — re-running the "idempotent" file fails with 42710. | Insert `drop trigger if exists trg_article_regulations_updated_at on library.article_regulations;` before :67 in both the repo file and `sql-apply-order/12-…`. Put the grants of A4 in a **new** migration, not here. |
| D4 (F42) LOW | `20260914:18-19` creates `uq_business_members_business_user` duplicating the constraint-backed unique index from `20260603:317`; `20260903` did the same on `firm_members`. | Optional new migration dropping the redundant indexes; never edit an applied migration. |
| D5 (F27) LOW | Court-cost tables FK to `public.cases`, which the product never writes (the 4 live rows are UAT fixtures) — shipped but inert until owner Q9. | Bookkeeping only: keep Q9 open; do not build a second case writer. |
| D6 (F33) MEDIUM | `npm run test:scripts` exits 2 on a plain checkout: `scripts/run-script-tests.mjs:18-27` hard-requires `../corpus/…` (the developer ZIP layout). | Make the corpus gate conditional on `MANIFEST.json` presence (the guard already used at :10) and skip only `parse-precedents.unnamed-details.test.ts` when absent. |
| D7 (F48) LOW | `mobile:*` scripts and four `@capacitor/*` deps with no `capacitor.config.*`, no `android/`/`ios/`; CLI pinned 8.4.3 vs others 8.5.2. | Remove until the mobile track starts (the PWA is the shipped mobile experience), or `npx cap init/add` and commit the scaffold. |
| D8 (F50) LOW | Version-keyed `minimatch@…` overrides — see B18 (they break npm 10). | Same fix as B18; do not replace with a bare top-level `minimatch` override (two incompatible majors are in the tree). |
| D9 | `owner-edits` (6f5fcd8) vs `main`: 91 commits ahead, 3 behind, and `git merge-tree` shows **29 conflicting files** (package.json/lock, parsers, seeder, laws pages, `service-requests/route.ts`, `academy/questions`, `invite/sync`, `globals.css`…). Our sync rule cannot be applied mechanically any more. | Owner decision (question ٦ in the living report): retire `owner-edits` (reset it to `main`, since his package is now `main`) or stop syncing. |
| D10 | Untracked/uncommitted: `docs/audits/2026-09-21-owner-report-profiles.md` (the report sent to the owner — **not in git**), `PROFILES_COMPLETION_PLAN_2026-09-20.md` at repo root (byte-identical duplicate of `docs/plans/…`), `outputs/`, `.agents/skills/`; modified `scripts/uat/seed-actors.ps1` (PS7 compat + `email_exists` retry). | Commit the owner report; delete the root duplicate; add `outputs/` to `.gitignore`; commit the seed-actors fix together with the A2 guard. |

## E. Documentation that now says something false

| # | Where | What | Fix |
|---|---|---|---|
| E1 (F34) MEDIUM | `تقرير_للمالك_الحالة_الكاملة_٢٠٢٦-٠٩-٠٣.md:621`, `رسالة_للمالك_٢٠٢٦-٠٩-٠٥.md:10` | «لم يبقَ عندنا ما يُبنى بلا قرار منك» — a whole new scope (profiles, auth, company members, 4 migrations) was built and deployed without waiting on any of the 21 questions. | Qualify in place («حتى ٥ سبتمبر») and add a dated «٢١ سبتمبر» addendum at the head of §3 pointing at the 2026-09-21 report. The four living files (report, guide, 195-list, cover note) were last touched 2026-09-05. |
| E2 (F36) MEDIUM | `docs/audits/2026-09-20-profiles-uat/WP3-report.md:20,58`, `00-IMPLEMENTATION-REPORT.md:5` | «20260921_04 is not applied anywhere» / «nothing applied to any live database» — false since 2026-09-21 (3 rows carry `metadata.invalid_phone_quarantined`). | Correct in place with the date, as REVIEW-2 MUST FIX 2 did for the same file. |
| E3 (F37) MEDIUM | `قائمة_بنود_المالك_منجز_وغير_منجز_٢٠٢٦-٠٩-٠٤.md:197` | Item ٤١ cites `direction-support/page.tsx:28-42` (hexagon, 5 of 6 sources) — the page is now a 46-line `DashboardComingSoon` gate. | Re-judge item ٤١ against HEAD and repoint the evidence. |
| E4 (F38) LOW | `دليل_اختبار_المالك_٢٠٢٦-٠٩-٠٤.md:365` | Section ح lists the case-file «الملاحظات» tab as «معطَّل بصدق قريباً», while section ل‏١ (:343-347) and §٤ row ٣٠ test it as built. | Strike the clause only (`✓ بُني — القسم ل‏١`), keep the other three ح items. |
| E5 (F35) LOW | `docs/audits/2026-09-21-owner-report-profiles.md:35,44` | Its §4 questions 1-8 collide with the living §٤ ١-٢١; its two bare «القرار N» citations in §3 resolve against different registries. | Tag rows with the plan's `Q1..Q9` ids, and name the document in every «القرار N» citation, before the file is committed. |
| E6 (F16) MEDIUM | `supabase/APPLY_MIGRATIONS_GUIDE.md` («3 SQL migrations», 2026-06-28), `DEPLOY_AND_SMOKETEST_RUNBOOK.md:18` (`db push`) | Two stale runbooks beside the real process (README-ORDER). | Archive the guide with a pointer; fix the runbook line (see B20). |

## F. Refuted or not defects (checked, no change needed)
- F15 `deploy.sh` would sweep the three `_superseded_/_staging_only_` files — no: `db push` ignores non-numeric-prefixed files (the `db push` step is wrong for other reasons, B20).
- F20 `_verify.sql` storage gate requires `roles = {authenticated}` exactly — matches what the Dashboard produces; the live run passed.
- F40 `AddCaseModal` orphaned `lawyer_clients` card — a retry attaches to the existing card; known residue, tracked in REVIEW-2.
- F51 REVIEW-2 SHOULD FIX 5 (`has_legal_dept` collected but unused) — recorded for the owner already (plan Q3 / new report Q3).
- F52 a hand-rolled «قريباً» in `ai/vault/page.tsx` — pre-existing, not introduced by this batch.
- F31 local `node_modules` drift (next 16.2.4 vs locked 16.3.3) — machine-only; re-synced with `npm ci` during this review.
- Migration internals verified clean: matrix vs Phase-2 flows, `handle_new_user` carry-forward, CHECK vs `saudiMobile.ts`, RPC ownership tests, RLS on all new tables, `_verify.sql` vs live catalog, no anon read of `profiles` left in app code, the invite LIKE-escape fix present in both routes.

## G. Suggested order of work
1. **Today:** A1 (ban the UAT admins, rotate, strip the scripts), A2 (guard the UAT scripts; write the teardown), A3 (delete `invite/sync`, guard accept), A4 + F13 (library grants + regulation paywall, one commit + one migration), A5 (`invited` status + accept arm), A6 (lawyer/provider column grants).
2. **Next deploy:** B1–B7 (three small migrations: 20260917 lock + service_requests grants, profiles column grants, dependent-policy definer rewrite, reviews columns), B8–B17 code fixes, B18 CI (tz test + overrides + lint rule), B19 move the ZIP out, B20 deploy.sh.
3. **Same release, honesty:** C1–C4.
4. **Then:** the rest of C, D, E; update the four living owner files (or add the dated addenda) and commit the 2026-09-21 owner report.

Full reviewer evidence, verifier votes and corrected fixes for every id above: `C:\Users\LOQ\AppData\Local\Temp\claude\…\scratchpad\review_result.json` (this session) and `findings_*.txt` beside it.
