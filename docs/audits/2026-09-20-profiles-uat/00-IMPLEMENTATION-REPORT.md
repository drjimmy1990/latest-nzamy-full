# Profiles completion — implementation report (2026-09-20)

**Scope:** everything in `docs/plans/PROFILES_COMPLETION_PLAN_2026-09-20.md` (rev 2), WP-0 through WP-7, executed by seven Opus work-package agents in isolated git worktrees, two independent review agents, and a fix pass.
**Baseline:** the owner's technical package `web/` (2026-09-19, `TECHNICAL_DELIVERY_OFFLINE_VERIFIED`) — tag `baseline`.
**Result:** 76 commits (67 non-merge), 196 files, +15,053 / −4,636. Nothing applied to any live database.

## 1. Gates on the final tree

| Gate | Baseline | Final | How |
|---|---|---|---|
| `npm run type-check` (tsc --noEmit) | 0 errors | **0 errors** | container, next 16.3.3 / TS 5.9.3 from the package lockfile |
| `npm run test:unit` (node --test) | 1219 / 1219 | **1431 / 1431** (+212, 23 new test files) | container |
| RLS harness (`supabase/tests/rls/run-local.sh`, PostgreSQL 16) | 5 chains runnable | **8 chains, all exit 0** — 4 new (profiles lockdown · subscriptions guard · entity recursion for all four entities · phone E.164 + signup clamp) + 4 regressions (phase2 with `_03` appended · phase6 · phase7 · case_notes) | container |
| Staging-order rehearsal (`supabase/tests/rls/rehearse-staging-order.sh`) | — | **`rc=0`**; with `SKIP=20260921_04` → **`rc=3`** on the `_04` gate (proves `_verify.sql` bites) | container |
| Independent review #1 (wave 1 + WP-4/5) | — | 2 MUST FIX → both closed in the fix pass | `REVIEW-1-wave1-wp4-wp5.md` |
| Independent review #2 (wave 2 + fix pass) | — | 2 MUST FIX → both closed (commit `792e8ef`); verdict: deliverable | `REVIEW-2-final.md` |
| `npm run build` | — | **not run — environment limitation** (`@next/swc-linux-x64-gnu`, `sharp`, `lightningcss` native binaries deliberately excluded from the container's `node_modules`; registry blocked). Reproduces on the untouched baseline. **Owed on the developer's machine.** | — |
| ESLint | — | broken in this environment before and after (`eslint-plugin-react` vs ESLint 10, `contextOrFilename.getFilename`) — pre-existing, not touched | — |

## 2. Migrations — what to apply, what never to apply

**New (4), in `supabase/migrations/`:**

| File | Closes | Proven by |
|---|---|---|
| `20260921_01_profiles_rls_lockdown.sql` | UAT-SEC-001 (P0) | `profiles_cross_user_read.test.sql` — injects the live-shaped leaking policy, proves A reads B, applies `_01`, proves A no longer reads B; anon refused (42501) |
| `20260921_02_subscriptions_write_revoke.sql` | UAT-SUB-001 (P0) | `subscriptions_write_guard.test.sql` — INSERT/UPDATE/DELETE refused (42501), read-own intact, `credit_transactions` too |
| `20260921_03_entity_rls_recursion_fix.sql` | UAT-TEAM-001 (P1) | `entity_members_no_recursion.test.sql` — reproduces 42P17 on all four `*_members` AND `*_profiles` tables from the real migration chain, then 34 PASS assertions after `_03`; phase2 regression unchanged |
| `20260921_04_profiles_phone_e164_check.sql` | UAT-REG-002 (P1) | `profiles_phone_e164.test.sql` — backfill normalises `0512…`/`٠٥١٢…`/`00966…`, quarantines garbage into `metadata`, CHECK refuses non-E.164 (23514), `handle_new_user()` clamp exercised through a real `auth.users` insert; function-body diff = 3 phone-only hunks vs `20260827` |

**Existing, correct, confirmed absent on the live DB (probe 2026-09-20) — apply, unchanged:** `20260906_court_costs_and_firm_profile_fields.sql` · `20260906_fix_subscriptions_rls_security.sql` · `20260914_entity_memberships_and_business_requests.sql`.

**Neutralised (renamed with a leading underscore = excluded from `db push`; source kept):** `_superseded_20260916_fix_all_entities_rls_infinite_recursion.sql` and `_superseded_20260916_fix_firm_profiles_and_members_rls_recursion.sql` (42P13 parameter rename ⇒ whole file rolls back; wrong policy names ⇒ recursion survives) · `_staging_only_20260916_enable_test_payment_gateway.sql` (flips the live payment gateway to a stub).

**Manual side-file:** `supabase/storage_policies_documents.sql` (must run as `supabase_storage_admin` / Dashboard — Postgres refuses it as a migration with `42501`). It now prints the live `storage.objects` policies, drops by name every policy that can match bucket `documents` other than the four owner-only ones, creates them, and asserts.

**Deploy assertion:** `supabase/migrations/_verify.sql` now gates all of the above (23 report rows, 5 `DO` gates): objects from the three existing files, `profiles` policy count = 3 and no anon grant, `subscriptions` no write policy/grant, the 8 helper functions and zero inline entity reads, the `_04` constraint validated + `v_phone` clamp + zero violating rows, the four `documents` storage policies, and the §3b fingerprints (a `p_firm_id` helper overload ⇒ a superseded file was run; `payments_gateway` = test/stub ⇒ fatal only when `PGOPTIONS="-c nzamy.env=production"`, a WARNING otherwise).

**Apply order on staging** (backup first; runner stops at first error): `20260906_court_costs` → `20260906_fix_subscriptions_rls` → `20260914` → `20260921_01` → `_02` → `_03` → `_04` → `storage_policies_documents.sql` (as storage admin) → `_verify.sql`. Preflight queries are in `WP1-report.md` §2. Run the read-only `pg_policy` query on `public.profiles` BEFORE `_01` and keep its output — it is the only record of the policy that was leaking (its name is unknown; `_01` drops it by absence from the allow-list).

## 3. What each work package delivered

| WP | Closes | Delivered (report) |
|---|---|---|
| WP-0 | — | baseline = package `web/` + lockfile; 3 forbidden migrations neutralised; `run-local.sh` (Docker-free RLS harness) |
| WP-1 | UAT-SEC-001, SUB-001, STORAGE-001, TEAM-001, BIZ-001, COST-001 | 3 migrations, storage side-file, `_verify.sql` gates, 3 RLS test chains + preludes, harness made idempotent (`WP1-report.md`) |
| WP-2 | UAT-LIVE-SESSION-001, ENV-001, part of LIVE-AI-001 | `resolveAuthOutcome` (transport failure ⇒ **503**, never 401/redirect) applied at 58 gates; `runtimeMode` single source, demo impossible in production, `?? "demo"` gone from 7 derivations; server-component session gate (`/dashboard`, `/settings`); login handshake via `GET /api/v1/auth/session` + full-document navigation; `useUser` no longer demotes a missing profile to «individual»; `ai/layout` ordering; `.env.example` TLS section; `api.ts` credentials; startup Auth health probe (`WP2-report.md`) |
| WP-3 | UAT-REG-001, REG-002, CONTACT-001 | e-mail regex + name requirements at `/register/client`; inline Arabic errors; contact API validation + caps; `_04` migration; format-aware `hasPhone` gate; helper result-shape refactor across 10 call sites; ProfileTab pre-flight (`WP3-report.md`) |
| WP-4 | owner ي‏١–ي‏٤, ك‏١, UAT-LIVE-CASE-001, LIVE-AI-001, GHOST-002 | public-link row, الجنسية for lawyers, «قبول عملاء جدد» tile, one link builder (slug, not UUID), anonymous-review de-anonymisation fixed in BOTH review routes, Phase-7 notice, new-case form: real disabled + silent fallbacks deleted + server validator before the insert + client card always linked; `/ai/direction-support` honest «قريباً», fixture out of the bundle (`WP4-report.md`) |
| WP-5 | decision ٤ (client), ك‏١ individual | dashboard summary is a three-state read (no demo object on failure); «الملف الشخصي» entry point; `/settings?tab=` actually works; stale settings banner narrowed to the two truly local tabs; subject `maxLength` (`WP5-report.md`) |
| WP-6 | owner ك‏٢ (company), UAT-TEAM-001/BIZ-001 app halves, closing-map item 4 | company address/city/phone/email/website via the same jsonb bag the firm uses (**no migration**); both arms in one PATCH; member scope (`businessProfileScope`, read-only UI, Arabic 403); `service_model`/`has_legal_dept` editable; real business members API (GET/POST/PATCH, nine DDL roles, owner-only writes, firm-pattern name lookup); six mock modules out of the bundle; real team page; membership reads merged independently (42P17 no longer wipes the owner); deny-by-default corporate roles with a visible «could not read your role» state; intakes send `entityScope` and name the company (`WP6-report.md`) |
| WP-7 | UAT-GHOST-001 | dashboard search «من محتواك» bound to the account's own documents + requests, three-state read, `MOCK_CONTENT` gone (`WP7-report.md`) |
| Fix pass | review MUST FIX ×4 | `_verify.sql` `_04` gate + §3b fingerprints; committed rehearsal script; startup probe; `proxy.ts` CRLF; business/firm invite lookup: literal e-mail (LIKE wildcards escaped — an enumeration hole, pre-existing in the firm route); WP-2/WP-3 reports |

Owner decisions applied (plan §5 defaults, all confirmed by review #2 §G): Q1 «ر.س»/«بحسب الحالة» kept · Q2 owner-only company writes · Q3 nationality for lawyer + individual · Q4 no address column · Q5 direction-support hidden honestly · Q6 demo files kept but unreachable in production · Q7 members API built.

## 4. Still owed — nothing here is «closed» under the owner's standard yet

The owner's rule: browser proof + API/DB proof + retest after the fix, and an «after» screenshot wherever he had a «before». Everything above is harness + unit + static verification. Outstanding, in order:

1. **On the developer's machine:** sync `main` to the package `web/` (WP-0), apply this branch, `npm ci && npm run type-check && npm run test:unit && npm run build` — `build` has never run on this tree.
2. **Staging DB:** backup → the apply order in §2 → `_verify.sql` → re-run `scripts/uat/verify-auth-and-profile-rls.ps1` (expect `foreignProfileHidden 47/47`), `verify-subscription-rls.ps1`, `verify-document-storage-isolation.ps1`, `verify-entity-membership-rls.ps1` (11/11 no 500), `verify-core-tenant-isolation.ps1` (business checks unblocked), `verify-profile-write-guards.ps1` (malformed phone → 23514), `audit-deployed-migration-objects.ps1` (4/4) — with fresh synthetic actors, never the old `actors.json`.
3. **Browser round** with the owner's manual login hand-over: WP-2 (e) (login → reload → direct URLs → protected POST → egress cut ⇒ 503 not redirect), owner steps ي‏١–ي‏٤ / ك‏١ / ك‏٢ / ز‏١ / ز‏٢, WP-5 and WP-6 flows, WP-7 two-account isolation. Each WP report lists its exact proof items.
4. **Matrix:** new `evidence/uat-<date>/uat-matrix.csv` (never overwrite the 2026-09-15 file) + `docs/audits/<date>-profiles-closure.md` per defect id → commit → proof.

## 5. Known risks and follow-ups (from both reviews; none blocks delivery)

- `AddCaseModal` can leave an orphan `lawyer_clients` card if the card is created and the case POST then fails (retry attaches, does not duplicate).
- `has_legal_dept` / `service_model` are now editable but `featureAccess.ts` still decides the legal-department distinction from the subscription tier — wire it when the owner decides the product rule.
- Invite-by-e-mail is a bounded oracle (201/409 vs 404 tells an owner whether an address belongs to an `individual`/`lawyer`/`corporate` account) — same exposure the firm route has always had; other account types stay invisible.
- Firm role predicates in `settingsReadiness.ts` are still fail-open (WP-6 fixed the corporate ones only).
- Six more business pages (`circuits-emails`, `employee-contracts`, `hearings`, `reports`, `seconded-counsel`, `wallet`) still compile fixtures; not in WP-6's list — one follow-up commit finishes decision ٤ for that folder.
- `public.cases` is never written; applying `20260906_court_costs` clears `PGRST205` but does not make court-cost entry reachable (plan Q9).
- `profiles.email` remains directly PATCH-able via PostgREST (plan Q8) — its own migration when the owner decides.
- A DELETE arm now exists on `*_members` for owner/admin (never existed before; `_superseded_20260916` intended the same).
- Dev demo mode now requires `NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND=demo` explicitly; API clients must handle **503**.
- Two Arabic label maps exist for the nine business roles (`BUSINESS_ROLE_LABEL` vs `CORPORATE_INVITE_ROLES`).
- `npm run lint` is broken in this environment (pre-existing plugin/ESLint mismatch) — verify on the developer's machine.

## 6. Where everything is

`docs/plans/PROFILES_COMPLETION_PLAN_2026-09-20.md` · `docs/audits/2026-09-20-profiles-uat/01…06-*.md` (evidence appendices) · `WP1…WP7-report.md` · `REVIEW-1-wave1-wp4-wp5.md` · `REVIEW-2-final.md` · this file. Harness: `supabase/tests/rls/run-local.sh`, `rehearse-staging-order.sh`, the four new `*.test.sql` and their `prelude_*.sql` chain steps.
