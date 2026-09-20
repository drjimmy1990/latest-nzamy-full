# Profiles Completion Plan — العميل · الشركة · المحامي
### From UAT-20260915 defects to owner acceptance (sections ي / ك / ز)

**Date:** 2026-09-20 · **Source of truth:** owner package `nzamy-developer-test-نهائي-2026-09-20/` (status `TECHNICAL_DELIVERY_OFFLINE_VERIFIED`, built 2026-09-19) · **Binding assignment:** `evidence/uat-20260915/00_دليل_اختبار_المنصة_والتكليف_للمبرمج.md` + `uat-matrix.csv` · **Owner acceptance steps:** `spec/00_سياق_المنصة_والمالك/06_دليل_اختبار_المالك_2026-09-04.md` (ي, ك, ز) · **Owner decisions:** `spec/00_سياق_المنصة_والمالك/00A_إجابات_الأسئلة_وقرارات_التنفيذ_الحالية.md`

**Evidence appendices (read the one for your work package before touching code):**
`docs/audits/2026-09-20-profiles-uat/01-rls-audit.md` · `02-auth-session-audit.md` · `03-registration-phone-audit.md` · `04-lawyer-profile-audit.md` · `05-client-business-audit.md` · **`06-live-db-probe.md`**

> **Revision 2 (2026-09-20, evening).** The live database was probed read-only (appendix 06) and the package's own migration set was re-audited against our repo. Three things changed from revision 1: the new-migration count drops from 8 to **4**; the company's ك‏٢ address/phone needs **no migration at all** (it uses the `metadata.settings` jsonb bag the firm, micro, government and ngo entities already use); and the profile-readiness ranking was wrong — only the **lawyer** profile is wired to a backend. Sections marked ⓡ2 carry the corrected content.

---

## 0. Ground rules (apply to every work package and every subagent)

1. **The code to fix is the package's `web/`, not the current `main`.** The developer's `nzamy-website` repo on `main` is at commit `17a81b9` (2026-09-05) with 51 migrations; the package `web/` has 71 migrations and 55 extra source files (incl. `src/lib/auth/entityMembership.ts`, `serviceRequestEntityScope.ts`, the two `20260916_*` recursion fixes, `20260914_*`, `20260917_*`, `20260919_*`). WP-0 syncs the working tree to the package before anything else.
2. **Closing standard (owner's rule, verbatim):** «لا يُغلق شيء هنا إلا بإثبات متصفح + API/قاعدة بيانات + إعادة اختبار بعد إصلاح المبرمج، وعند وجود لقطة مالك: لقطة «بعد» أيضاً.» A green unit test alone closes nothing. Each WP ends with the proof listed under *Proof to close*.
3. **Never:** use `service_role` to impersonate a user or bypass RLS in a normal read path; disable TLS (`NODE_TLS_REJECT_UNAUTHORIZED=0`); run SQL on production (staging first, backup first — README §6); edit a migration file that may already be applied (forward migrations only); delete mock source files (owner decision ٤: «لا حذف للمصدر قبل قرار مستقل» — replace the page body with an honest `DashboardComingSoon`, keep the source in git history); invent numbers, people or "coming soon" counters.
4. **Every SQL change is a separate, new, dated migration file** under `supabase/migrations/` following `YYYYMMDD_NN_<snake_case>.sql` (the `NN` ordinal fixes same-day ordering, which the tree already relies on). Header of every migration: purpose, UAT id(s) it closes, prerequisites, a read-only *verify* block at the end. The only exception is `storage.objects` (owner-permission `42501`) — that goes in `supabase/storage_policies_documents.sql` + a deploy assertion (see WP-1 C).
5. **GitNexus rule from `CLAUDE.md`:** before editing any function/class/method run `impact({target, direction:"upstream"})` and record the blast radius; before committing run `detect_changes()`. If the GitNexus MCP tools are not available in the subagent's session, do the equivalent by hand (grep every caller, list them in the commit body) and say so explicitly in the report.
6. **Every endpoint change adds a request/response contract note + a route test in the same folder** (02_تعليمات §7). Mobile does not call `/api/v1/profile` or `/api/v1/service-requests` today (verified by grep in `mobile/src`), so no mobile client change is required by this plan.
7. **Arabic copy** for every user-facing message; RTL-safe; no English-only errors.
8. **Baseline gate before any PR:** `npm run type-check && npm run test:unit && npm run build` must pass (package baseline: 1212/1212 unit tests). RLS changes additionally run the Docker harness `bash supabase/tests/rls/run.sh …` (see WP-1 F).
9. Branch: `fix/uat-20260915-profiles` off the synced baseline; one commit per WP item; commit messages reference the UAT id (`UAT-SEC-001: …`).

---

## 1. Where things stand (facts established 2026-09-20)

| Area | Finding | Appendix |
|---|---|---|
| `public.profiles` leak (P0) ⓡ2 | **No permissive policy exists in the repo.** Live probe 2026-09-20: anon gets `[]` with HTTP 200 ⇒ RLS **is enabled** and the offending policy is **not** `TO public`. The leak is scoped to the `authenticated` role — a permissive policy created outside the migration chain. Fix = lockdown migration that drops any policy not in the sanctioned three (dynamically, by absence from the allow-list) + `revoke` from `anon`. | 01 §1, 06 |
| `subscriptions` self-upgrade (P0) | `20260906_fix_subscriptions_rls_security.sql` is correct but **was never deployed**. Add `revoke insert,update,delete` belt-and-braces (+ `credit_transactions`). | 01 §2 |
| `documents` bucket (P0) | Policies live only in `supabase/storage_policies_documents.sql` (manual Dashboard step, never done). A permissive policy is live. | 01 §3 |
| Entity members `42P17` (P1) ⓡ2 | `20260903` fixed self-reference only; the mutual `X_members ↔ X_profiles` cycle remains. **Confirmed live 2026-09-20** on both `firm_members` and `business_members`, for the anon role too ⇒ policy-evaluation-wide. `20260903` is demonstrably applied (phase6 + phase7 are live), which validates the repo analysis. **Both `20260916_*` files are broken** (42P13 param rename ⇒ whole transaction rolls back; wrong policy names ⇒ old recursive policies survive). They must be superseded, not deployed. | 01 §4, 06 |
| `business_id`, court-cost tables (P1) ⓡ2 | `20260914` and `20260906_court_costs…` are correct; **confirmed still absent 2026-09-20** (`42703`, `PGRST205`, plus `firm_profiles.cr_number` missing as an independent check). Nothing has been applied to the live DB since the 2026-09-15 UAT. | 01 §5-6, 06 |
| Payment gateway ⓡ2 | `20260916_enable_test_payment_gateway.sql` flips the **live** `platform_settings.payments_gateway` to `{"status":"test","provider":"stub"}` via `on conflict do update`. Live value is `disabled` ⇒ it was never applied. Keep it marked staging-only so a bulk apply cannot pick it up. | 06 |
| Session → SSR/API (P0) | Cookies are correct on both sides. Two real causes: (H1) every gate collapses `getUser()` *transport failure* into "not signed in" (401/redirect) — the same TLS class as UAT-ENV-001; (H2) `src/proxy.ts:131` `?? "demo"` — if `NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND` ≠ `"supabase"` on the edge, the legacy cookie-name branch redirects every real user to `/login?from=…` (byte-for-byte the observed string). No server-component gate on any dashboard. | 02 |
| Registration phone (P1) | `normalizeSaudiMobile` exists and is wired; email at `/register/client` step 2 is still truthy-only; **no DB CHECK** so a direct PostgREST PATCH still stores garbage (that is exactly what the UAT script did). | 03 |
| Lawyer profile | Phase-7 stack substantially built. Gaps: public link not shown on profile page; no الجنسية field for lawyers; «قبول عملاء جدد» not reflected; dashboard share copies UUID; anonymous-review de-anonymisation via service title; wording «ر.س»/«ريال». | 04 |
| Client profile | No `/dashboard/client/profile`; edited only in `/settings` (5 fields); no address; dashboard summary swallows failures into a demo object. | 05 §1, A |
| Business profile ⓡ2 | `EntitySettingsTab:121` is `isCorporate ? CORPORATE_FIELDS : ENTITY_SETTINGS_FIELDS[userType]` — an **either/or**. Firm, micro, government and ngo all get `address`/`city`/`phone`/`email`/`website` from the `metadata.settings` jsonb bag (`EntitySettingsTab.tsx:47-75`); corporate takes the other branch and gets only the 4 identity columns, so ك‏٢ cannot be performed. **Fix is a code change, not a migration.** Also: members get a blank form + generic 500; no business members API; `has_legal_dept`/`service_model` are dead columns; `useUser` collapses all memberships on one failing query; role defaults fail open; team/requests pages are reachable mock modules. | 05 §3-7, B |

### ⓡ2 Profile readiness — measured, not assumed

Ranked by whether the surface actually calls an API (`grep -c "apiGet\|apiMutate\|fetch("`):

| Profile | Verdict | Evidence |
|---|---|---|
| **المحامي / lawyer** | **Real and nearly complete** | `dashboard/lawyer/profile/page.tsx` 992 lines + `…/edit/page.tsx` 754 lines, **5 real API calls**; `lawyer_profiles` has 31 columns; phase6 + phase7 confirmed live. All remaining gaps are UI-only — **zero migrations** |
| **العميل الفرد / individual** | **Real but minimal** | `/settings` only (no dedicated page); 5 fields, all persisting to real `profiles` columns; `avatar_url` column already exists — only the upload UI is missing |
| **الشركة / corporate** | **Half real** | 4 identity fields persist correctly to `business_profiles`; no address/phone (see above); dashboards are mock |
| **المكتب / firm** | **Mockup** | `dashboard/firm/profile/page.tsx` — 100 lines, **0 API calls**, hardcoded `useState("شركة السند للمحاماة والاستشارات")`, and its own toast admits «محلية فقط حتى Firm/Profile API». Its team/members API *is* real, the profile page is not |
| **مزود الخدمة / provider** | **Mockup** | `dashboard/provider/profile/page.tsx` — 397 lines, **0 API calls** |
| government · ngo · micro | jsonb settings bag only | `ENTITY_SETTINGS_FIELDS` |

Revision 1 of this plan assumed the firm profile was in better shape than the company's. It is not — it simply never uses the string `MOCK_`, so a keyword sweep missed it. Firm and provider profile pages are out of scope here, but they should not be counted as done.

---

## 2. Work packages

Legend — **Closes:** UAT ids / owner steps · **Depends:** must be merged/applied first · **Proof to close:** what the owner's closing standard requires.

### WP-0 · Baseline, environment, DB inventory (developer, before any subagent)

**Steps**
1. In `nzamy-website`: `git status` — commit or stash any local work. Create `fix/uat-20260915-profiles` from `main`.
2. Sync the tracked tree to the package: for each of `src/ supabase/ scripts/ docs/ test/ library-toolkit/ blog-toolkit/ academy-toolkit/ n8n/ public/` and the root config files (`package.json package-lock.json next.config.ts tsconfig.json postcss.config.mjs eslint.config.mjs .env.example`), replace with the package `web/` copy (`rsync -a --delete` per directory). Keep `.git`, `node_modules`, `.env.local`, `deploy.sh`, `ecosystem.config.js` and the root Arabic docs. Commit: `chore: sync working tree to owner technical package 2026-09-19`.
3. `npm ci` → run the mandatory first-run chain from the package README §4: `npm run schema:check-drift` (needs `../spec` — pass `--vault-root` if outside the ZIP), `npm run type-check`, `npm run test:unit`, `bash supabase/tests/rls/run.fail_closed.test.sh`, `npm run build`. Record numbers in `docs/audits/2026-09-20-profiles-uat/00-baseline.md`.
4. **Neutralise the two broken migrations** (do not delete): `git mv supabase/migrations/20260916_fix_all_entities_rls_infinite_recursion.sql supabase/migrations/_superseded_20260916_fix_all_entities_rls_infinite_recursion.sql` and likewise for `20260916_fix_firm_profiles_and_members_rls_recursion.sql`; prepend a header `-- SUPERSEDED by 20260921_03_entity_rls_recursion_fix.sql — DO NOT APPLY (42P13 parameter rename; wrong policy names). See docs/audits/2026-09-20-profiles-uat/01-rls-audit.md §4.` (leading underscore = excluded from `db push`, same convention as `_verify.sql`).
5. **Staging DB inventory (read-only, in a `READ ONLY` transaction; save output to `docs/audits/2026-09-20-profiles-uat/00-db-inventory-staging.md`):**
   ```sql
   -- policies + rls flags on the tables this plan touches
   select c.relname, c.relrowsecurity, p.polname, p.polcmd, p.polroles::regrole[], pg_get_expr(p.polqual,p.polrelid) as using_expr, pg_get_expr(p.polwithcheck,p.polrelid) as check_expr
   from pg_class c left join pg_policy p on p.polrelid = c.oid
   where c.relnamespace = 'public'::regnamespace
     and c.relname in ('profiles','subscriptions','credit_transactions','firm_profiles','firm_members','business_profiles','business_members','government_profiles','government_members','ngo_profiles','ngo_members','service_requests','contact_messages')
   order by c.relname, p.polname;
   select polname, polcmd, pg_get_expr(polqual,polrelid) from pg_policy where polrelid = 'storage.objects'::regclass;
   select grantee, table_name, privilege_type from information_schema.role_table_grants
    where table_schema='public' and table_name in ('profiles','subscriptions','credit_transactions') and grantee in ('anon','authenticated') order by 2,1,3;
   -- deployed objects
   select to_regclass('public.court_cost_notices') is not null as court_costs, to_regclass('public.case_disbursements') is not null as disbursements,
          exists(select 1 from information_schema.columns where table_schema='public' and table_name='service_requests' and column_name='business_id') as business_id,
          to_regprocedure('public.is_active_business_member(uuid)') is not null as biz_helper,
          to_regprocedure('public.is_admin()') is not null as is_admin,
          to_regprocedure('public.handle_updated_at()') is not null as upd_fn,
          exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='nationality') as phase6_profiles,
          exists(select 1 from information_schema.columns where table_schema='public' and table_name='lawyer_profiles' and column_name='slug') as phase7;
   -- which handle_new_user is live (20260827 writes phone/city)
   select position('new.phone' in pg_get_functiondef('public.handle_new_user()'::regprocedure)) > 0 as handle_new_user_has_phone;
   -- phone data quality before WP-3 migration
   select count(*) filter (where phone is null) as no_phone, count(*) filter (where phone ~ '^\+9665[0-9]{8}$') as e164_ok, count(*) filter (where phone is not null and phone !~ '^\+9665[0-9]{8}$') as malformed from public.profiles;
   ```
   The result decides which *existing* migrations still need applying (expected missing: `20260906_fix_subscriptions_rls_security`, `20260906_court_costs_and_firm_profile_fields`, `20260914_entity_memberships_and_business_requests`, possibly `20260827_signup_contact_fields`).
6. Local env: add `NODE_EXTRA_CA_CERTS=<absolute path to the intercepting proxy / corporate root CA .pem>` to `.env.local` (and to the shell that starts `next dev`), re-run `POST /api/v1/contact` with a valid synthetic payload → expect 200, not `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. Closes **UAT-ENV-001** (environment half). Document it in `.env.example` + README (WP-2 item 7).

**Proof to close WP-0:** baseline report + DB inventory committed; the first-run chain green.

---

### WP-1 · Database security & migrations (P0 → P1) — SQL only + RLS tests
**Closes:** UAT-SEC-001, UAT-SUB-001, UAT-STORAGE-001, UAT-TEAM-001, UAT-BIZ-001, UAT-COST-001, UAT-TENANT-003 · **Depends:** WP-0 · **Appendix:** 01

**A. `supabase/migrations/20260921_01_profiles_rls_lockdown.sql`** — exactly the SQL in appendix 01 "Recommended (A)": enable RLS; dynamic loop dropping every policy on `public.profiles` whose name is not one of `users read own profile` / `admins read all profiles` / `users update own profile`; re-create those three `to authenticated`; `revoke select, insert, update, delete on public.profiles from anon`. Verify block: `select count(*) from pg_policy where polrelid='public.profiles'::regclass` = 3 and `relrowsecurity = true`. Before shipping the `revoke`, grep `src/` for any anon-key server read of `profiles` (none expected — `/api/v1/lawyers*` uses the service client).

**B. `supabase/migrations/20260921_02_subscriptions_write_revoke.sql`** — apply the existing `20260906_fix_subscriptions_rls_security.sql` first (unchanged), then this file: `revoke insert, update, delete on public.subscriptions from authenticated, anon;` same for `public.credit_transactions` + `drop policy if exists "users create own credit transactions" on public.credit_transactions;`. Confirm first that no user-scoped route inserts `credit_transactions` (`src/lib/entitlements.ts:193` uses the service client). Also apply the containment in `02_تعليمات §1-ب` if not yet done (invite `sync` off / self-accept blocked) — separate commit, same WP, because it is the same "self-grant" class.

**C. Storage `documents` bucket (manual + assertion).** Update `supabase/storage_policies_documents.sql` so it (1) prints the current `pg_policy` rows for `storage.objects`, (2) drops **by name** every policy that can match `bucket_id='documents'` other than the four owner-only ones (the drop list is built from the read in WP-0 step 5, never guessed), (3) creates the four `documents select/insert/update/delete own` policies with `bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]`. Apply as `supabase_storage_admin` / Dashboard. Add to `supabase/migrations/_verify.sql`: assert exactly those four policy names exist on `storage.objects` (raise if not), so `deploy.sh` stops when the manual step was skipped.

**D. `supabase/migrations/20260921_03_entity_rls_recursion_fix.sql`** — supersedes both `20260916_*`. Structure:
1. `begin;`
2. Clean slate: dynamic loop that drops **every** policy on the 8 tables `firm_profiles, firm_members, business_profiles, business_members, government_profiles, government_members, ngo_profiles, ngo_members` (this removes all the old names listed in appendix 01 §4 and the `20260617` admin policies; all are re-created below).
3. Helpers — `language sql stable security definer set search_path = ''`. **Keep the `20260903` parameter names** so `CREATE OR REPLACE` works without `DROP … CASCADE`: `is_active_firm_member(p_firm uuid)`, `is_active_business_member(p_business uuid)`, `is_active_government_member(p_gov uuid)`, `is_active_ngo_member(p_ngo uuid)`; new owner helpers `is_firm_owner(p_firm uuid)`, `is_business_owner(p_business uuid)`, `is_government_owner(p_gov uuid)`, `is_ngo_owner(p_ngo uuid)` = `exists (select 1 from public.X_profiles where id = p_X and owner_user_id = auth.uid())`. Because step 2 already dropped every dependent policy on the 8 tables, first `drop function if exists public.is_X_owner(uuid)` (no CASCADE) for the four owner helpers only — never drop the member helpers (`20260914`'s `service_requests` policy depends on `is_active_business_member`).
4. Policy matrix, identical for each entity X (members id column `X_id`, owner column `owner_user_id`):
   - `X_profiles` SELECT: `owner_user_id = auth.uid() or public.is_active_X_member(id) or public.is_admin()` · INSERT: `owner_user_id = auth.uid()` · UPDATE: `owner_user_id = auth.uid()` (using + check). (Manager write for business is WP-6 B-2 option b — a separate migration if the owner chooses it.)
   - `X_members` SELECT: `user_id = auth.uid() or public.is_active_X_member(X_id) or public.is_X_owner(X_id) or public.is_admin()` · INSERT/UPDATE/DELETE: `public.is_X_owner(X_id) or public.is_admin()`.
   - No policy expression may reference another of the 8 tables inline — helpers only.
5. Verify block: for each of the 8 tables `select count(*) from pg_policy …` equals the matrix count, and `pg_get_expr(polqual)` contains none of `from public.firm_members|business_members|government_members|ngo_members|firm_profiles|…`. `commit;`
6. Header comment lists the 42 policies it replaces (names + source file:line from appendix 01 §4) so a reviewer can diff intent.

**E. Deploy the existing correct migrations on staging in this order** (after backup; stop at first error): `20260827_signup_contact_fields.sql` (only if WP-0 step 5 shows `handle_new_user_has_phone = false`), `20260906_court_costs_and_firm_profile_fields.sql`, `20260906_fix_subscriptions_rls_security.sql`, `20260914_entity_memberships_and_business_requests.sql`, then `20260921_01`, `20260921_02`, `20260921_03`, storage side-file (C). Preflight before `20260914`: `to_regprocedure('public.is_active_business_member(uuid)') is not null`. Add to `_verify.sql`: `court_cost_notices`, `case_disbursements`, `service_requests.business_id`, the 8 helpers, profile policy count = 3, `subscriptions` has no INSERT/UPDATE policy and no `authenticated` write grant.

**F. RLS tests (Docker harness `supabase/tests/rls/run.sh`)** — new files:
- `profiles_cross_user_read.test.sql` — load the real `20260603_phase1_001_profiles.sql` + `20260625_fix_rls_recursion.sql` + `20260921_01` (not the hand-written stub in `stubs.sql:17`): A reads own = 1, A reads B = 0, admin reads both, `anon` = 0.
- `subscriptions_write_guard.test.sql` — chain `20260603_phase1_003` → `20260906_fix…` → `20260921_02`: A INSERT fails, A `update … set tier='max'` = 0 rows, A reads own = 1, B = 0.
- `entity_members_no_recursion.test.sql` — chain `20260603_phase1_002 → 20260616 → 20260617 → 20260903_phase2 → 20260914 → 20260921_03`; for **all four** entities: owner sees members, member sees co-members, outsider sees 0, member reads `X_profiles` (no 42P17), owner reads `X_members` (no 42P17), business member reads a business `service_request` via `20260914`'s policy.
- Update `stubs.sql` so `firm_members` stubs no longer hard-code the pre-fix recursive policy when the real chain is loaded.

**Proof to close WP-1:** (1) Docker RLS suite green; (2) on staging re-run `scripts/uat/verify-auth-and-profile-rls.ps1` → `foreignProfileHidden = 47/47`; `verify-subscription-rls.ps1` → both write tests fail and tier unchanged; `verify-document-storage-isolation.ps1` → foreign download/delete 403/404; `verify-entity-membership-rls.ps1` → 11/11 no 500, positive (same entity) and negative (other entity) correct; `verify-core-tenant-isolation.ps1` → the two business checks unblocked and passing (B sees B, not A); `audit-deployed-migration-objects.ps1` → 4/4 present. (3) Update `evidence/uat-20260915/uat-matrix.csv` rows `UAT-SEC-001`, `UAT-SUB-001`, `UAT-STORAGE-001`, `UAT-TEAM-001`, `UAT-BIZ-001`, `UAT-COST-001`, `UAT-TENANT-003` with the new date/commit/environment.

---

### WP-2 · Auth session → SSR/API (P0) + protected-route integrity
**Closes:** UAT-LIVE-SESSION-001, UAT-ENV-001 (code half), part of UAT-LIVE-AI-001 · **Depends:** WP-0 · **Appendix:** 02

1. **`src/lib/auth/resolveAuthOutcome.ts`** (pure, tested): `resolveAuthOutcome(user, error) → "ok" | "anonymous" | "unavailable"` — `unavailable` when `error` is an `AuthRetryableFetchError` / has no HTTP `status` / is a network error; `anonymous` when no user and the error is a definitive auth error (or no error); `ok` when user present. Unit tests for all three + the "user present but stale error" case.
2. **Apply it at every gate** (list from appendix 02 §3): `src/proxy.ts:172-175` (API branch) and `:270-280` (page branch) — destructure `error`; on `unavailable` **do not redirect / do not 401**: API branch → `503 {"error":"تعذّر التحقق من الجلسة حالياً، حاول بعد قليل"}`; page branch → `NextResponse.next()` with a `x-nzamy-auth: unavailable` header and a `console.error` (fail-open like the profile read at `:392`, but logged). `src/app/api/v1/service-requests/route.ts:118-126,244-253`, `src/app/api/v1/profile/route.ts:117-126,286-295`, `src/app/api/v1/settings/route.ts:7-16,57-66`, `src/lib/auth/assertRole.ts:19-33`, `src/lib/access-control.ts:109-128` → 503 on `unavailable`, 401 only on `anonymous`. Grep for every other `authError || !user` (`grep -rn "authError || !user" src/app/api`) and convert them all in one sweep.
3. **Kill the demo default.** `src/lib/runtimeMode.ts` becomes the single source: `BACKEND_MODE = process.env.NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND ?? "supabase"`; demo only when the value is exactly `"demo"` **and** `NODE_ENV !== "production"`; any other value throws at module load. Replace the five independent derivations (`src/proxy.ts:131`, `src/hooks/useUser.ts:406-410`, `src/lib/services/api.ts:15-18`, `src/app/login/page.tsx:34`, `src/app/register/client/page.tsx:38`) with imports. **Delete the legacy branch** `src/proxy.ts:486-497` and the `isSupabaseMode` conditionals at `:153` and `:245` — the Supabase path becomes unconditional. In `src/instrumentation.ts` drop the `NEXT_RUNTIME !== 'nodejs'` and `NODE_ENV !== 'production'` early returns for the backend-mode assertion (keep them only for things that truly cannot run on edge), and add a startup probe `GET ${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health` that logs loudly (not throws) on failure.
4. **Server-component gate for dashboards.** New `src/app/dashboard/layout.tsx` (async server component): `createClient()` → `getUser()` → `resolveAuthOutcome`; `anonymous` → `redirect(\`/login?from=${path}\`)`; `unavailable` → render children with an inline Arabic banner «تعذّر التحقق من الجلسة، بعض البيانات قد لا تظهر»; `ok` → children. Same gate for `src/app/settings/layout.tsx` and `src/app/ai/layout.tsx`'s protected prefixes (or a shared `requireSessionOrRedirect()` helper used by all three).
5. **Login handshake.** In `src/app/login/page.tsx:190-207` after `signInWithPassword` succeeds: call `GET /api/v1/auth/session` (new tiny route: returns `{ userId, userType }` from the *server* client, 401/503 via the same helper). If it returns 200 → `window.location.assign(dest)` (full document load so SSR sees the cookies; not `router.push`). If 503 → show «تعذّر تأكيد الجلسة مع الخادم — تحقق من الاتصال» and stay. If 401 → the cookie was not accepted by the server → show a specific message and log `document.cookie` names (not values) to console for diagnosis. Route test for `/api/v1/auth/session`.
6. **`useUser` demotion.** `src/hooks/useUser.ts:689-692`: a `missing` `profiles.user_type` for a signed-in user must not become `"individual"`; expose `userType: null` + `profileState: "missing"` and let `UserTypeGuard` render «ملفك غير مكتمل — أكمل التسجيل» with a link to `/onboarding` instead of «صلاحيات غير كافية». `src/app/ai/layout.tsx:114-117`: move the `!user.isLoggedIn` escape (`:147-149`) **above** the `LAWYER_AI_PREFIXES` block so a guest gets the login redirect. Delete the demo block `src/hooks/useUser.ts:412-520` (`⚠️ DEMO BLOCK START`), `src/lib/test-credentials.ts`, `src/lib/demo-accounts.ts`, `src/app/demo-login/page.tsx` **only if** `runtimeMode` no longer allows demo in production builds and the owner has not asked to keep a demo mode (owner decision Q6 below); otherwise leave them behind the hardened `runtimeMode`.
7. **Environment docs.** `.env.example`: add `NODE_EXTRA_CA_CERTS=` with a comment; README «متطلبات التشغيل» / «أول تشغيل إلزامي»: the TLS paragraph (fix the trust chain; never disable verification). `src/lib/services/api.ts:51-55`: explicit `credentials: "same-origin"` and `cache: "no-store"` on `apiMutate`.
8. **Tests:** `resolveAuthOutcome.test.ts`; `runtimeMode.test.ts` (never defaults to demo; throws on unknown in production); route test for `/api/v1/auth/session`; `proxy` logic stays untestable by design — extract the "what to do with an auth outcome for path X" decision into `src/lib/auth/routeAccess.ts` (already the pattern) and test it there.

**Proof to close WP-2:** on staging with a real lawyer UAT account (owner hands over the manual login — «المطلوب الآن من المالك»): (a) login → dashboard; (b) reload; (c) direct URL `/dashboard/lawyer`, `/ai/draft`, `/settings`; (d) `GET /api/v1/profile` and `POST /api/v1/service-requests` with a valid case → 200 and the row exists; (e) kill egress to Supabase from the server for 30 s → API returns 503 with the Arabic message, no redirect to `/login`; restore → works without re-login. Evidence: `evidence/uat-<date>/live-browser-lawyer.json` re-run + HAR of (d). Update matrix rows `UAT-LIVE-SESSION-001`, `UAT-ENV-001`.

---

### WP-3 · Registration & phone (P1) — client + server + DB
**Closes:** UAT-REG-001, UAT-REG-002, UAT-CONTACT-001 · **Depends:** WP-0 (DB part after WP-1 order) · **Appendix:** 03

1. `src/app/register/client/page.tsx:69-85` — `canNext()` step 2: add `EMAIL_RE` (same as provider `:222`), required name for individual / `entityName` for government / `ngoName` for ngo (see appendix 03 (b) for the exact block).
2. `src/app/register/client/components/Steps.tsx:335-356` — email + phone inline validation: `sanitizePhoneDigits` on change, `aria-invalid`, red border, Arabic hint under each field (copy the provider pattern `register/provider/components/Steps.tsx:300-315`).
3. `src/app/api/v1/contact/route.ts` after `:49` — optional phone must normalise (400 with `saudiMobileMessage`), caps `name ≤ 120`, `subject ≤ 200`, `message ≤ 5000`; store `phone: e164`; forward the normalised value to n8n (`:88`). Mirror client-side in `src/app/contact/page.tsx:259` and `src/app/partners/page.tsx:440`. Route test.
4. **`supabase/migrations/20260921_04_profiles_phone_e164_check.sql`** — exactly appendix 03 (d): blank→NULL, normalise salvageable shapes, quarantine the rest into `metadata.invalid_phone_quarantined`, `add constraint profiles_phone_e164_saudi_mobile check (phone is null or phone ~ '^\+9665[0-9]{8}$') not valid` then `validate`, `comment on constraint`. **In the same file** re-create `public.handle_new_user()` carrying the body forward **byte-for-byte from `20260827_signup_contact_fields.sql`** (its ⚠ carry-forward warning is binding — losing the `v_sub_role` / `v_rep_capacity` clamps breaks provider/corporate signup) changing only the phone expression to a clamp (normalise if it matches `^(00966|966|0)?5[0-9]{8}$` after Arabic-digit translation, else `NULL`, never raise). Verify block: the three counts query from appendix 03 (d) + `select pg_get_functiondef('public.handle_new_user()'::regprocedure) like '%v_phone%'`.
5. `src/proxy.ts:412` → `hasPhone: normalizeSaudiMobile(profile?.phone).ok` (format-aware) + test beside `onboardingGate.test.ts:54`.
6. Result-shape refactor of `src/lib/services/saudiMobile.ts` to `{ ok, e164 } | { ok:false, reason }` + `saudiMobileMessage()` + back-compat `saudiMobileOrNull()`; switch the 10 call sites listed in appendix 03 (a); extend `saudiMobile.test.ts` with per-reason assertions; add `src/app/api/v1/profile/route.test.ts` (malformed → 400; Arabic-Indic → 200 normalised; `email` in body dropped).
7. `ProfileTab.tsx` `handleSave` (`:196`): pre-flight phone check with field-level error (no round trip for an obviously bad number).

**Proof to close WP-3:** browser at `/register/client`: (`not-an-email`, `abc@example.com` in phone) cannot pass step 2 and both fields show the Arabic reason; accepted forms `05…`, `+9665…`, `009665…`, `٠٥…` all register with `profiles.phone = +9665…` (DB query); rejected forms (letters, email, `+96605…`, 9/11 digits) refused. Re-run `scripts/uat/verify-profile-write-guards.ps1` → direct PostgREST PATCH with `letters-and-email@example.test` returns `23514` (`invalidPhonePersisted: false`). Reload `/settings` → phone pre-filled; `/onboarding` not re-asked. `POST /api/v1/contact` with a bad phone → 400, with a good one → 200 (needs WP-0 step 6). Matrix rows `UAT-REG-001`, `UAT-REG-002`, `UAT-CONTACT-001`.

---

### WP-4 · Lawyer profile & lawyer flows (owner ي‏١–ي‏٤, ك‏١, ز‏١, G)
**Closes:** owner ي‏١.1 (public link), ك‏١.1 (الجنسية), ك‏١.5, dashboard share link, review anonymity defect, UAT-LIVE-CASE-001, UAT-LIVE-AI-001 (link/mock half) · **Depends:** WP-2 (a save must reach the API) · **Appendix:** 04 + 02 §5-6

1. **G1** `src/app/dashboard/lawyer/profile/page.tsx` — read-only «رابط ملفك العام» row after `:782` when `slug` is set (origin via `useEffect`), beta sentence when `BETA_MONOPOLY_MODE`; share *button* stays gated.
2. **G2** `src/lib/services/profileSettingsFields.ts:43-51` — add `nationality` to the lawyer field list (and to `firm`/`corporate` if owner decision Q3 says so); extend `profileSettingsFields.test.ts`.
3. **G3** `profile/page.tsx` — carry `is_accepting_clients` through `EMPTY_PROFILE`, `ProfileApiResponse.roleProfile`, `load()`, and render a 4th status tile «يستقبل موكلين جدد» / «لا يستقبل موكلين جدداً حالياً».
4. **G4** new `src/lib/services/publicProfileLink.ts` (`buildPublicProfileUrl(origin, slug, userId)`, `canShareProfile`, `copyToClipboard`) used by `dashboard/lawyer/page.tsx:309-363` and `profile/page.tsx:191-198,401-412`; unit test for `slug || userId` fallback.
5. **G5** wording — apply owner decision Q1 («ريال» vs «ر.س», «حسب الطلب» vs «بحسب الحالة») in `lawyerProfileFields.ts:106-132` + tests.
6. **G6** `src/app/api/v1/reviews/route.ts:100-121` — exclude anonymous rows from `requestIds`; `serviceTitleAr = null` for anonymous; unit test for the redaction.
7. **G7** `edit/page.tsx:298,555,620` — one-line notice when `"slug" in roleProfile` is false («حقول الملف المهني تحتاج ترحيل 20260907 على هذه القاعدة»).
8. **UAT-LIVE-CASE-001** `src/app/dashboard/lawyer/_components/AddCaseModal.tsx`: real `disabled` on «التالي» (`:229-246`), re-validate in `handleSave` (`:95-101`), **delete** the silent fallbacks at `:109` and `:115`; require a `lawyer_clients` pick or create the card so `lawyer_client_id` is always set. Server: new pure validator `src/lib/services/serviceRequestIntake.ts` (`title` non-empty ≤ 200, `description` ≤ 5000, `requester` object shape, `lawyerClientId` uuid when present) called in `src/app/api/v1/service-requests/route.ts` before the insert at `:443` → 400 with Arabic copy; tests beside it (house style: pure function + `node --test`).
9. **UAT-LIVE-AI-001 (link/mock half)** — per owner decision Q5: default = hide honestly. `src/app/ai/direction-support/page.tsx` body → `DashboardComingSoon` (source kept; `direction-support.data.ts` no longer imported anywhere → out of the bundle); remove/mark the links at `src/app/dashboard/lawyer/_data/mockData.ts:105` (drop `badge: "جديد"`), `src/constants/navigation.sidebars.legal.ts:98,336`, `src/constants/lawyerAiCatalog.ts:192-193` (mark `comingSoon: true`). The real feature (داعم الاتجاه + المدقق التشريعي, backend contract in the UAT guide «مطلب منتج موثق») is **out of this plan** — it needs its own spec per owner decision ٥.

**Proof to close WP-4:** owner steps ي‏١.1–4, ي‏٢.1–3, ي‏٣, ي‏٤.1–4, ك‏١.1, ك‏١.5 executed in the browser with a verified lawyer account + a second lawyer (slug collision) + a client account with a completed assigned request; each with DB evidence (`lawyer_profiles`, `lawyer_services`, `reviews` rows). New case with empty client/title cannot be submitted; a valid case appears after reload and `service_requests` row has `lawyer_client_id`. `/ai/direction-support` shows an honest «قريباً», no link carries a «جديد» badge. Matrix rows `UAT-LIVE-CASE-001`, `UAT-LIVE-AI-001`, `UAT-GHOST-002`.

---

### WP-5 · Client (individual) profile
**Closes:** owner ك‏١ for individuals (address if Q4 = yes), decision ٤ on the client dashboard, ز‏٢ · **Depends:** WP-2, WP-3 · **Appendix:** 05 §1-2, A

1. **C-1 — dropped ⓡ2.** No address column for individuals: `city` exists and ك‏٢'s «العنوان» refers to the entity, not the person. Revisit only if the owner asks for it explicitly (Q4).
2. **C-2** `src/lib/services/dashboardService.ts:71` — `getDashboardSummary()` must not swallow failures into `DEMO_SUMMARY`; return a three-state read like `getDocuments()`; `src/app/dashboard/client/page.tsx:270-273` renders the "unreadable + retry" branch (same as documents card `:935-960`).
3. **C-3** add a «الملف الشخصي» entry point (`/settings?tab=profile`) in the client dashboard header/plan card; leave avatar upload as-is (honest «غير متاح بعد»).
4. **C-4** `src/constants/settingsReadiness.ts:4-5` — delete/narrow `SETTINGS_BACKEND_READY_MESSAGE` (it now lies: ProfileTab/EntitySettingsTab persist server-side).
5. **C-5** ops: confirm `20260827` is applied (WP-0 inventory `handle_new_user_has_phone`); if not, it is in the WP-1 E order.
6. ز‏٢ «الخطة والحدود» for individuals already implemented — only re-test.

**Proof to close WP-5:** individual account: register → `/settings` shows name/phone/email(read-only)/city/nationality(+address) pre-filled; edit → «تم الحفظ» → persists after reload and from a private window; `/dashboard/client` shows real name and plan, and a forced summary failure shows the retry state, not "no cases". ي‏٤ review flow from `/dashboard/client/requests` (shared with WP-4).

---

### WP-6 · Business (corporate) profile & membership
**Closes:** owner ك‏٢ (company), UAT-TEAM-001 (app half), UAT-BIZ-001 (app half), closing-map item 4 («الشركة بلا/بإدارة قانونية»), decision ٤ for `/dashboard/business/*` · **Depends:** WP-1 D+E (recursion fix + `business_id`), WP-2 · **Appendix:** 05 §3-7, B

1. **B-1 ك‏٢ blocker — code only, no migration ⓡ2.** `src/app/settings/components/tabs/EntitySettingsTab.tsx:121` is `const fields = isCorporate ? CORPORATE_FIELDS : ENTITY_SETTINGS_FIELDS[userType ?? ""] ?? EMPTY_FIELDS;` — corporate never reaches the jsonb bag. Fix: (i) add a `corporate` entry to `ENTITY_SETTINGS_FIELDS` (`:47-75`) with `address` (span 2), `city`, `phone` («رقم التواصل», placeholder `05X XXX XXXX`), `email`, `website` — same keys the firm uses so the bag stays uniform; (ii) change `:121` so corporate renders **both** arms: the 4 identity columns (`CORPORATE_FIELDS`, saved via the `businessProfile` PATCH key) followed by the jsonb fields (saved via the `entitySettings` PATCH key — `entityProfileTableFor("corporate")` already resolves to `business_profiles`, and `route.ts:638` already merges `metadata.settings` for any entity type); (iii) `handleSave` sends both keys in one PATCH; (iv) phone in the bag is validated client-side with `normalizeSaudiMobile` and server-side in the `entitySettings` arm of `route.ts:477-490` (add a `phone` check there — it currently accepts any string for every entity type, which is a pre-existing gap for the firm too); (v) test: `entitySettingsFields.test.ts` asserting corporate gets the contact keys and that the split routes them to `entitySettings`, not `businessProfile`.
2. **B-2 / B-3 member scope (owner decision Q2; default = option a, read-only for members):** in `/api/v1/profile` GET resolve the caller's business via `business_members` (same shape as `resolveActiveEntityIds` in `service-requests/route.ts:13-88`) and return `businessProfile` for members too, plus an explicit `businessProfileScope: "owner" | "member" | "none"`; PATCH stays owner-only but returns a specific 403 «تعديل بيانات الشركة متاح لمالك الحساب فقط» instead of `AR.saveFailed`; `EntitySettingsTab.tsx` disables inputs + Save when scope ≠ owner and shows who can edit. If the owner later chooses option b (managers may write) — **not planned, no file reserved** ⓡ2 — it would be a new migration using a `security definer` helper `public.is_business_manager(p_business uuid)` (roles `owner, legal_manager`) — **never** an inline `exists (select … from business_members)` inside a `business_profiles` policy (that is the 42P17 shape), and PATCH filter `.eq("id", resolvedBusinessId)`.
3. **B-4 legal-department flag:** expose the real columns: `serviceModel` select («إدارة قانونية داخلية» `internal` / «تفويض خارجي» `external` / «مختلط» `hybrid`) + `hasLegalDept` toggle in `CORPORATE_FIELDS`, mapped through the same `businessProfile` PATCH arm (CHECK-constrained → `<select>`); collect at signup (`_corporateIdentity.ts:161-178` `corporateSignupMetadata` + a question in `Steps.tsx`); replace `can("team-legal-department")` at `business/team/page.tsx:285,410` with the company's own `has_legal_dept`. **No signup-trigger change ⓡ2:** do not touch `handle_new_user()` for this. The company sets `service_model`/`has_legal_dept` from the entity settings tab after signup (defaults `internal`/`false` already exist on the columns). If the owner insists on collecting it at signup, that is a later forward migration carrying the body from `20260921_04`.
4. **B-5 business members API (owner decision Q7 — «الأعضاء الحقيقيون» in ك‏٢ + UAT-TEAM-001 require real memberships; decision ٥ forbids fake CRUD, not real):** `src/app/api/v1/business/members/route.ts` (GET list, POST invite by email → creates `business_members` row `status='invited'` or `active` if the account exists; roles restricted to the DDL's nine), `.../[memberId]/route.ts` (PATCH role/status incl. `removed`), `src/lib/services/businessMembersService.ts` mirroring `firmMembersService.ts`; RLS write policies already exist after WP-1 D (`is_business_owner`). Point `TeamManagementTab.tsx:112` corporate branch at it and fix its copy (it currently claims `business_members` does not exist); add `compliance_officer`, `seconded` to `CORPORATE_INVITE_ROLES` (`settingsReadiness.ts:78-85`). Route tests + `serviceRequestEntityScope.test.ts` (six branches) + `entityMembership.test.ts` extension.
5. **B-6 mock modules out of the bundle:** replace the bodies of `src/app/dashboard/business/{team,requests,consultations,governance,health-check,kanban,reviews}/page.tsx` with `DashboardComingSoon` exactly like `departments/page.tsx:37-41` (source stays in git; `MOCK_*` arrays leave the bundle). **Exception:** once B-5 ships, `team/page.tsx` becomes the real team page (reuse the firm team page structure) and is added to `VISIBLE_BUSINESS_ROUTES` (`navigation.sidebars.business.ts:322-325`).
6. **B-7** `BusinessProfileReadinessPanel.tsx:230-240` — empty-state link → `/settings?tab=entity` (keep `/contact` secondary); fix the comment.
7. **B-8** `src/hooks/useUser.ts:559-630` `readEntityMemberships` — evaluate the four reads independently (mirror `resolveActiveEntityIds`); an owner's `business_profiles`-derived membership survives a failed `business_members` read; return `unavailable` only when every read failed. Unit tests (none exist).
8. **B-9** `settingsReadiness.ts:120-130` — `role ?? "owner"` becomes deny-by-default (`role ?? null` → false) with an explicit "could not read your role" state; pair with B-8 so real owners are not locked out.
9. **B-10** the three corporate intake paths (`dashboard/client/requests/new/page.tsx`, `dashboard/client/consultation/new/page.tsx`, `dashboard/business/_components/AddCaseModal.tsx`) send `scope: "business"` explicitly and show «سيُقدَّم هذا الطلب باسم <اسم الشركة>»; `serviceRequestEntityScope.test.ts` covers all six branches.

**Proof to close WP-6:** corporate owner: register (company name, CR, representative capacity, service model) → `/settings` «إعدادات الكيان» shows all fields → edit address/phone → «تم الحفظ» → persists after reload/private window (DB row). Corporate member (`legal_manager`, added via the new API) logs in → sees the company data read-only (or editable per Q2) with a clear message; `/dashboard/business` loads without 500 on a **cold** tab; creates a request → `service_requests.business_id` set; a member of company B does not see it (re-run `verify-core-tenant-isolation.ps1` business checks). `/dashboard/business/{requests,consultations,governance,health-check,kanban,reviews}` show an honest «قيد الإعداد» and `grep -r MOCK_ .next/server/app/dashboard/business` is empty. Matrix rows `UAT-TEAM-001`, `UAT-BIZ-001`, `UAT-TENANT-003`, closing-map item 4.

---

### WP-7 · Adjacent ghost surfaces named in the UAT (decision ٤)
**Closes:** UAT-GHOST-001 · **Depends:** none · Not profile-specific but listed in the same closing map — keep small.
`src/components/.../GlobalSearch.tsx` `MOCK_CONTENT` for personal content → either bind to the account's real data (documents/requests via existing APIs) or remove the "personal" section with a clear label; test with two different accounts. Everything else in `surface-inventory.json` stays as-is pending the owner's route-by-route decision.

---

### WP-8 · Verification, evidence, closure (independent verifier agent — must not be the one that wrote the fix)
1. Fresh staging snapshot restore → apply the WP-1 E order with a runner that stops at the first error; save the session log + SHA.
2. Run: `bash supabase/tests/rls/run.sh …` for every test file; `npm run type-check`, `npm run test:unit`, `npm run build`; all `scripts/uat/verify-*.ps1` + `audit-deployed-migration-objects.ps1` against staging with **fresh synthetic UAT actors** (`seed-actors.ps1`; never the old `actors.json`, never real accounts, never a service-role magic link).
3. Browser round with the owner's manual login handover: WP-2 (e), WP-4 ي/ك steps, WP-5, WP-6 flows; capture «بعد» screenshots for every item that has an owner «قبل» screenshot in `docs/audits/2026-09-14-screenshot-reconciliation.md`.
4. Update `evidence/uat-<new date>/uat-matrix.csv` (never overwrite the 2026-09-15 file — the owner's rule: a rerun is bound to a new commit/environment/date) and write `docs/audits/2026-09-2x-profiles-closure.md`: per defect id → commit → proof file → status.
5. `detect_changes({scope:"compare", base_ref:"main"})` (GitNexus) on the final branch; attach the report.

---

## 3. ⓡ2 Migrations — the real list

The package carries **10 migrations that are not in our repo** (`main` = 51, `owner-edits` = 61 = main + 10 library files, package = 71). Those 10 are the owner's post-2026-09-05 work and were audited one by one. Live state was verified 2026-09-20 (appendix 06).

### 3a. Existing files to APPLY (correct as written; confirmed absent on the live DB)

| File | Closes | Live evidence | Preflight |
|---|---|---|---|
| `20260906_court_costs_and_firm_profile_fields.sql` | UAT-COST-001 | `court_cost_notices` → `PGRST205`; `firm_profiles.cr_number` → `42703` | `is_admin()`, `handle_updated_at()`, `public.cases` exist |
| `20260906_fix_subscriptions_rls_security.sql` | UAT-SUB-001 | `subscription-rls.json` (2026-09-15) `persistedTier:"max"`; not re-probeable without a user token | — |
| `20260914_entity_memberships_and_business_requests.sql` | UAT-BIZ-001 / UAT-TENANT-003 | `service_requests.business_id` → `42703` | `to_regprocedure('public.is_active_business_member(uuid)') is not null` |

Note `20260906` is **three** files on the same day: `phase6_settings_out_of_browser` is applied (`profiles.nationality` live), the other two are not. Verify per file, never per date — this project has no `schema_migrations` table.

### 3b. Existing files that must NEVER be applied

| File | Why |
|---|---|
| `20260916_fix_all_entities_rls_infinite_recursion.sql` | `42P13` (parameter rename in `CREATE OR REPLACE`) ⇒ whole transaction rolls back; `DROP POLICY IF EXISTS` on names that never existed ⇒ recursion survives. Superseded by `20260921_03`. Rename to `_superseded_…` |
| `20260916_fix_firm_profiles_and_members_rls_recursion.sql` | Second attempt at the same problem; conflicts with the first on `is_firm_owner`'s parameter name. Superseded. Rename to `_superseded_…` |
| `20260916_enable_test_payment_gateway.sql` | Flips the **live** payment gateway to a stub. Staging-only. Rename to `_staging_only_…` or move to `supabase/one-time/` |

### 3c. Existing files out of scope for this plan (library / requests, not profiles)

`20260911_library_laws_enactment_gazette_schema.sql` · `20260917_service_request_client_actions_rpc.sql` (476 lines, needs its own review) · `20260919_laws_parent_linkage_columns.sql` · `20260919_private_precedent_details.sql`

### 3d. NEW migrations to write — **four**, not eight

| # | File | WP | Closes | Notes |
|---|---|---|---|---|
| 1 | `20260921_01_profiles_rls_lockdown.sql` | 1A | UAT-SEC-001 | leak is `authenticated`-scoped (anon already blocked); drop every policy not in the allow-list of three, dynamically; `revoke … from anon` as belt-and-braces |
| 2 | `20260921_02_subscriptions_write_revoke.sql` | 1B | UAT-SUB-001 | idempotently re-does `20260906_fix_subscriptions_rls_security` **and** revokes the `INSERT/UPDATE/DELETE` grants from `authenticated`/`anon` (+ `credit_transactions`) — the policy drop alone leaves the grant in place |
| 3 | `20260921_03_entity_rls_recursion_fix.sql` | 1D | UAT-TEAM-001 | clean-slate policy matrix for the 8 entity tables, helper functions only; keeps `20260903` parameter names so no `DROP … CASCADE` |
| 4 | `20260921_04_profiles_phone_e164_check.sql` | 3 | UAT-REG-002 | backfill + quarantine + CHECK; `handle_new_user()` phone clamp with body carried byte-for-byte from `20260827` |

**Dropped from revision 1** (with the reason, so nobody re-adds them):
- ~~`_05_profiles_address`~~ — the individual has `city`; ك‏٢'s «العنوان» is the *entity's* address, not the person's.
- ~~`_06_business_profiles_contact_fields`~~ — the firm/micro/government/ngo already store address/city/phone/email/website in `metadata.settings` (jsonb). Corporate just needs the same branch enabled (WP-6 B-1). Adding real columns for one entity type only would make the company the odd one out.
- ~~`_07_business_profiles_manager_update_rls`~~ — owner-only stays the default; only revisit on an explicit owner decision (Q2).
- ~~`_08_handle_new_user_business_service_model`~~ — `service_model`/`has_legal_dept` can be set from the entity settings tab after signup; no need to touch `handle_new_user()` a second time.

Non-migration SQL that still has to happen: `supabase/storage_policies_documents.sql` (manual, owner-permission `42501`) + assertions in `supabase/migrations/_verify.sql` for every object in 3a/3d.

**Apply order on staging** (backup first; runner stops at first error): `20260906_court_costs` → `20260906_fix_subscriptions_rls` → `20260914` → `20260921_01` → `_02` → `_03` → `_04` → storage side-file → `_verify.sql`.

---

## 4. Sequencing

```
WP-0 baseline ─┬─► WP-1 DB security (A,B,C,D,E,F) ──► WP-6 business (needs D+E) ─┐
               ├─► WP-2 auth/session ──► WP-4 lawyer ──────────────────────────────┼─► WP-8 verify & close
               ├─► WP-3 registration/phone (code first; migration 04 in the WP-1 E window) ─► WP-5 client ─┘
               └─► WP-7 ghost surfaces (any time)
```
Parallelisable by subagents: WP-1, WP-2, WP-3 (code parts), WP-7 immediately after WP-0; WP-4/5/6 after their dependencies merge. Every subagent works on its own branch off `fix/uat-20260915-profiles` and rebases before the PR.

---

## 5. Owner decisions required (ask before the dependent step; default in bold if silent)

| # | Question | Affects | Default |
|---|---|---|---|
| Q1 | Price unit «ريال» or «ر.س»; pricing kind «حسب الطلب» or «بحسب الحالة» | WP-4 G5 | **keep «ر.س»/«بحسب الحالة»** (already tested), change only if he insists |
| Q2 | May a corporate `legal_manager` edit company data, or owner only? | WP-6 B-2, migration 07 | **owner only; members read-only with a clear message** |
| Q3 | Should الجنسية also appear for firm/corporate accounts? | WP-4 G2 | **lawyer + individual only** |
| Q4 | Does the individual need a free-text العنوان (ك‏٢ names it for the entity, not the individual)? | WP-5 C-1, migration 05 | **no — city only** |
| Q5 | `/ai/direction-support`: honest «قريباً» now, real feature later under its own spec? | WP-4 item 9 | **hide honestly now** |
| Q6 | Keep any demo/test-credentials mode in non-production builds? | WP-2 item 6 | **remove from production builds; keep behind hardened `runtimeMode` in dev** |
| Q7 | Build the real business members API (invite/role/remove) now, as ك‏٢ «الأعضاء الحقيقيون» implies? | WP-6 B-5 | **yes — it is the only way UAT-TEAM-001 can be proven positively for a company** |
| Q8 | `profiles.email` direct-PATCH hole: revoke column update or add an `auth.users` sync trigger? | WP-1/WP-3 follow-up | **revoke `update (email, user_type, verification_status)` from `authenticated` in a later migration** |
| Q9 | `public.cases` is never written; court-cost tables FK to it (02_تعليمات §7-أ) | WP-1 E note | out of scope; raise |

---

## 6. Subagent assignment prompts (Opus 5) — copy each into its own agent

Common preamble for every prompt:
> You are working in the `nzamy-website` repo on branch `fix/uat-20260915-profiles` (already synced to the owner package — do not resync). Read `PROFILES_COMPLETION_PLAN_2026-09-20.md` §0 and your WP section, then the appendix named in it under `docs/audits/2026-09-20-profiles-uat/`. Follow `CLAUDE.md`: run GitNexus `impact()` before editing any symbol and `detect_changes()` before committing; if the GitNexus tools are unavailable, grep every caller and list them in the commit body and say so in your report. Constraints: no `service_role` in user read paths; no TLS disabling; do not edit existing migration files; do not delete mock source files (replace page bodies with `DashboardComingSoon`); Arabic user-facing copy; every endpoint change gets a route test in the same folder; `npm run type-check && npm run test:unit` must pass before each commit. Work on a sub-branch `fix/uat-…/wp-N`, one commit per numbered item, message prefixed with the UAT id or owner step. Finish with a report: what changed (file:line), what you could not do and why, exact commands you ran, and the proof still owed under *Proof to close*.

- **Agent WP-1 (DB):** «Implement WP-1 A–F. Deliverables: `20260921_01`, `_02`, `_03` migrations with header + verify blocks; updated `storage_policies_documents.sql`; `_verify.sql` assertions; the three new RLS test files and the `stubs.sql` change; the `_superseded_` renames if WP-0 did not do them. Run every RLS test through `supabase/tests/rls/run.sh` (Docker) and paste the output. For `_03`, put the full policy matrix (8 tables) in the header and prove with the verify block that no policy expression references another entity table inline. Do NOT apply anything to a live database.»
- **Agent WP-2 (auth):** «Implement WP-2 items 1–8. Start with `resolveAuthOutcome` + tests, then the gate sweep (`grep -rn "authError || !user" src/app/api` must return zero afterwards), then `runtimeMode` consolidation and the proxy demo-branch removal, then the dashboard/settings/ai server gates, then the login handshake route + full-load navigation, then `useUser` demotion + `ai/layout.tsx` ordering, then env docs. Keep `src/proxy.ts` logic-free where possible by extracting decisions into `src/lib/auth/routeAccess.ts` with tests.»
- **Agent WP-3 (registration/phone):** «Implement WP-3 items 1–7 in the listed order. Migration `20260921_04` must carry `handle_new_user()` forward byte-for-byte from `20260827_signup_contact_fields.sql` and change only the phone expression; include the verify block. Add `src/app/api/v1/profile/route.test.ts` and a contact route test.»
- **Agent WP-4 (lawyer):** «Implement WP-4 items 1–9 (apply owner answers Q1, Q5 if given; otherwise the defaults in §5). Item 8 requires a pure validator with tests beside `intakeGuard.ts`. Do not touch `direction-support.data.ts` except to stop importing it.»
- **Agent WP-5 (client):** «Implement WP-5 items 2–4. Item 1 is dropped; do not add an address column.»
- **Agent WP-6 (business):** «Implement WP-6 items 1–9 with defaults Q2 = owner-only, Q7 = yes. **This WP writes no migration** — item 1 is the jsonb-bag code change, item 3 uses the existing columns via the settings tab. Requires WP-1 D+E applied on staging (recursion fix + `business_id`) before the proof round. Mirror `firmMembersService.ts` / `api/v1/firm/members` for the business API and constrain roles to the DDL list.»
- **Agent WP-7 (ghost):** «Implement WP-7 only.»
- **Agent WP-8 (verifier — different agent from all of the above):** «Execute WP-8 steps 1–5 on staging. You may not modify product code; you may only add evidence files under `evidence/uat-<date>/` and `docs/audits/`. Report every red item back with the defect id.»

---

## 7. Closing checklist (matrix rows to update)

| UAT id / owner step | WP | Proof file(s) |
|---|---|---|
| UAT-SEC-001 | 1A | `verify-auth-and-profile-rls` → 47/47 hidden; RLS test |
| UAT-SUB-001 | 1B | `verify-subscription-rls` → both writes fail; RLS test |
| UAT-STORAGE-001 | 1C | `verify-document-storage-isolation` → foreign download/delete denied; `_verify.sql` |
| UAT-TEAM-001 | 1D + 6 | `verify-entity-membership-rls` → 11/11 no 500; RLS test; business member browser round |
| UAT-BIZ-001 / UAT-TENANT-003 | 1E + 6 | `verify-core-tenant-isolation` business checks; `audit-deployed-migration-objects` |
| UAT-COST-001 | 1E | `audit-deployed-migration-objects`; note Q9 |
| UAT-LIVE-SESSION-001 | 2 | live lawyer round (a)–(e) + HAR |
| UAT-ENV-001 | 0 + 2 | contact API 200 locally; 503 semantics test |
| UAT-REG-001 / 002 | 3 | browser + DB + `verify-profile-write-guards` |
| UAT-CONTACT-001 | 3 | route test + API round |
| UAT-LIVE-CASE-001 | 4 | browser + `service_requests` row |
| UAT-LIVE-AI-001 / GHOST-002 | 4 | «قريباً» page; no badge links |
| UAT-GHOST-001 | 7 | two-account search test |
| Owner ي‏١–ي‏٤, ك‏١, ك‏٢, ز‏١, ز‏٢ | 4, 5, 6 | browser steps with «بعد» screenshots + DB rows |
