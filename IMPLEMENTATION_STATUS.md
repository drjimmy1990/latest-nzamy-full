# NZAMY — Implementation Status (QA-review remediation, round 2)

> **Date:** 2026-07-16 · **Branch:** `main` — **committed + pushed + deployed** (sprint commit `9fe1949` - Library & Blog CMS Sprints) · **Plan:** [`TEST_REVIEW_FIX_PLAN.md`](./OLD/TEST_REVIEW_FIX_PLAN.md) · **Reconciliation:** [`TEST_REVIEW_RECONCILIATION.md`](./OLD/TEST_REVIEW_RECONCILIATION.md)
> **This round** executed the QA-review fixes that do **not** depend on the real seeded library data, per the instruction to "fix all we can, document what's done vs not, and go." The genuinely data-dependent library work (search corpus, book content) is deferred with reasons below.
> **Gates:** `tsc --noEmit` = 0 errors · `eslint .` = 0 errors (warnings only) · `next build` = exit 0.
> **⚠️ Deploy dependency:** this round's code is live, but the lawyer directory (`/api/v1/lawyers`) now `SELECT`s `show_contact` — **apply `supabase/migrations/20260705_lawyer_show_contact.sql`** (plus the 3 other pending migrations after `20260629`) or that route 500s. Confirm with `supabase/migrations/_verify.sql`. Full pending-migration list at the bottom of [`NEXT_STEPS.md`](./NEXT_STEPS.md).

---

## ✅ Round 4 (2026-07-16) — Library Sprint & Blog CMS Sprint

A major dual-sprint build focused on the Legal Library corpus and the Blog CMS system (commit `9fe1949`).
- **Library CLI Toolkit:** Created `library-toolkit/` CLI containing 6 commands: `parse` (Markdown to JSON), `seed` (JSON to Supabase), `clear` (wipe library tables), `verify` (integrity check), `status` (check status/counts), and `reseed` (clear and seed in one step).
- **DB-driven Library & Search:** Connected all secular and Islamic (fiqh) library pages directly to the database via `supabaseLibrary.ts` (resolving table name mismatches). Implemented server-side search and pagination (`POST /api/library/search`) on `/laws` to replace in-memory JS filtering.
- **Library Paywall Enforcement:** Gated locked library items by ensuring the `free: true` bypass is removed and correctly checking `free: !isLocked` relative to subscription status.
- **Smart Folders API:** Wired `SmartFolders` component to persist folders in the `library_folders` table in Supabase (with dual-mode fallback to localStorage for guests).
- **Blog CMS System:** Designed and implemented a DB-driven blog articles schema (31 fields), storage bucket covers, server-side JSON-LD and SEO metadata, GitHub-Flavored Markdown (GFM) alert block renderer, and a command-line `blog-toolkit` for importing and publishing articles.
- **⚠️ Migrations to apply:** `20260716_security_hardening.sql`, `20260716_missing_fk_indexes.sql` (and other pending migrations).

---

## ✅ Round 3 (2026-07-06) — Admin-controlled entitlements + production wiring

A 7-phase build (commits `1497ff6 · e20a44a · 46ae7e0 · c7f29a0 · 597ea04 · 89ab077 · d9aa5ae · 8b4b447`). Full detail + runbook: [`ENTITLEMENTS_AND_WIRING_BUILD_LOG.md`](./ENTITLEMENTS_AND_WIRING_BUILD_LOG.md). **Gates:** `tsc` 0 · `next build` 392/392 · `eslint` 0 · adversarial review 0 findings.
- **Entitlements grant layer (no gateway):** `entitlement_requests` table, `src/lib/entitlements.ts` (`grantEntitlement` → subscriptions/credits/wallet), request+approve APIs, admin **grant editor** + **requests queue** pages, and client paid CTAs (pricing/laws/media/wallet) that file a request instead of dead-ending.
- **Wiring:** `recordNotification` on entitlement/verification/service-request events; killed the community mock-seed merge in supabase mode; draft-cart made dual-mode + lossless (`law_draft_carts.payload`); n8n verification dispatch.
- **Admin console:** tickets, broadcasts, coupons, audit-log, community-moderation, payments wired off their mocks to real admin-gated routes.
- **Content + Blog CMS:** real contact/partners/share-verify/promo/invite writes; `articles` table + public read + admin authoring; blog served from DB.
- **⚠️ Migrations to apply:** `20260706_entitlement_requests.sql`, `20260706_draft_cart_payload.sql`, `20260706_content_and_ops.sql`, `20260706_articles_seed.sql` (plus prior pending). Until applied, new surfaces show mock fallback and writes error gracefully.
- **Deferred (unchanged):** real gateway, Academy LMS, sector dashboards, i18n, provider binary doc upload.

---

## ✅ Implemented this round

### §4.1 — Beta teardown / dev role-switcher out of production (CLIENT-2.7, CRITICAL) — **DONE**
The dev demo/role switchers no longer ship in a production (supabase) build.
- New `src/lib/runtimeMode.ts` — canonical `isDemoUiEnabled` flag (`= !isSupabaseMode`, build-time constant → dead-code-eliminated in prod).
- Gated the "Developer Demo Console" in `settings/.../ProfileTab.tsx` behind `isDemoUiEnabled`.
- Gated the `/login` "Test Accounts (Dev)" link; made `/demo-login` return `notFound()` (404) in prod.
- Gated the firm-layout role switcher (`dashboard/firm/layout.tsx`) on `isDemoUiEnabled`.
- Hardened `useUser.setDemoSession` to no-op in supabase mode (defense in depth).
- Audited the register pages (they call `setDemoSession` only in the demo branch — no visible picker leak) and removed the stray committed `dashboard/lawyer/profile/update_profile.ps1`.
- Excluded `test/` from `tsconfig` (the tester's un-merged reference files were breaking type-check).

### §4.4 — AI tools fabricating output → honest gate (KN-1/LIB-11/LIB-23/LIB-25, HIGH) — **DONE (Part A+B)**
No AI page returns fabricated legal text to a user during beta.
- Registered 4 tool IDs in `betaConfig.ts` (assistant/analyze-strength/communicate/compare; `consult.result` already existed).
- Wrapped all 5 previously-ungated result surfaces in `BetaReviewGate` with `reviewScope="legal-data"` (forces the review overlay for **all** users in beta, clients included): `ai/consult`, `ai/assistant`, `ai/analyze-strength`, `ai/communicate`, `ai/compare/_result-view`.
- (`ai/analyze`, `brief-check`, `case-brief` were already gated — unchanged.)
- **Deferred:** Part C (wire `SubscriptionTab` cards to real `/api/v1/profile` subscription instead of hardcoded `getPlanData`) — see below.

### §4.3 — Lawyer dashboard bugs — **DONE (contained parts)**
- **LAWYER-3.5** misroute: the "استشارة جديدة" quick action now points to `/dashboard/lawyer/consultations?book=1` instead of the non-existent `/consultations/new` (which rendered the "الاستشارة غير موجودة" dead-end). *Deferred polish:* auto-opening the booking modal on `?book=1` (needs a `Suspense`/`useSearchParams` wrapper) — the link now lands on the working consultations list regardless.
- **LAWYER-3.3** dead/misrouted CTAs: "نشر في السوق" → `/dashboard/lawyer/marketplace`; "ترقية الباقة" → `/pricing` (was `/finance`).
- **LAWYER-3.9** post-add sync: the dashboard now re-fetches its summary on the `nzamy-workflow-updated` event (add-case/add-task modals already dispatch it), so KPIs/lists update without a reload.
- **LAWYER-3.14** research-hub sidebar: added a path hint in `ai/layout.tsx` so lawyer-exclusive tools (`/ai/collector`, `/ai/brief-check`) resolve to the lawyer sidebar on a cold/new-tab open (per reviewer, shared tools like `/ai/draft` were **excluded** to avoid a new misroute).
- **LAWYER-4.1** mojibake (defense-in-depth): `api.ts` now sends `Content-Type: application/json; charset=utf-8` on all reads/writes. *Deferred:* the server-side `cleanArabicText` NFC-normalizer + the one-time data-repair migration (the strip regex must preserve ZWNJ/ZWJ and needs explicit `\u` escapes + verification on a DB copy — safer to do deliberately).

### §4.9 — Client UX — **DONE (contained parts)**
- **CLIENT-2.6** settings sidebar overlap: `settings/layout.tsx` is now a pass-through (the settings page already renders its own Navbar + rail + Footer + FloatingButtons; the dashboard wrapper was pure duplication causing the overlap).
- **CLIENT-2.5** library in client sidebar: **no code change (working as designed)** — `/laws` is a public, per-item paywall-gated funnel (our committed §7.3 gating), so the tester's "Pro-only" premise is incorrect. Flagged for owner sign-off only.

### §4.2 — Lawyer profile: contact-PII privacy + edit form + buttons + localization (LAWYER-6.1/6.3/6.2, HIGH) — **DONE**
- **LAWYER-6.1 (PII leak):** the public `/api/v1/lawyers` route no longer `SELECT *` — it uses an explicit projection that **never returns `profiles.phone`/`email`**, and **strips `license_number`** for any lawyer with `show_contact=false`. New migration `20260705_lawyer_show_contact.sql` (opt-in flag, default false) + `show_contact` added to the `database.ts` type and the `/api/v1/profile` PATCH allowlist. Existing specialty/available filters + sort preserved.
- **LAWYER-6.3 (edit form):** built `src/app/dashboard/lawyer/profile/edit/page.tsx` — loads via `apiGet`, saves via `apiMutate` (PATCH), edits bio/specialties/experience/rate/license/city + the visibility & `show_contact` toggles. The existing "تعديل" link now resolves. The dead "تصدير PDF" button is gated (disabled + "قريباً").
- **LAWYER-6.2 (localization):** "رقم النقابة" → "رقم الترخيص" (Egyptian→Saudi term).

---

## ⏳ Deferred — needs the real library data, a live-DB migration, or a larger build

These are fully specified in [`TEST_REVIEW_FIX_PLAN.md`](./TEST_REVIEW_FIX_PLAN.md) (exact code/SQL). They were held because they depend on infrastructure this session can't drive, or are larger features better done deliberately.

| Item | Why deferred |
|------|--------------|
| ~~**§4.6 — Library search + Arabic FTS**~~ (LIB-4/5/KN-4) | ✅ **DONE (2026-07-16):** Server-side FTS search implemented via `POST /api/library/search` with Arabic full-text search. Pagination with "Load More" buttons added to `/laws` page. In-memory JS `.filter()` bypass eliminated. |
| **§4.5 — Book/reference detail** (LIB-19.1/2/3) | 🟡 **PARTIALLY COMPLETE (2026-07-16):** `supabaseLibrary.ts` table name mismatch fixed (`law_chapters`→`chapters`, `law_articles`→`articles`, `law_amendments`→`article_amendments`, removed phantom `law_executive_regs`). `feqh-preview` connected to DB with hardcoded fallback. Civil-procedure and law-metadata-map also connected to DB. Full book detail fetch-by-slug still pending. |
| ~~**§4.7 — Persistence (SmartFolders → DB)**~~ | ✅ **DONE (2026-07-16):** SmartFolders wired to `/api/library/folders` Supabase API — dual-mode: API for authenticated users, localStorage for guests. **Still pending:** notes table + RLS + CRUD, draft persistence. |
| **§4.8 — Merge the tester's 10 modifications** | Careful merge; 2 files conflict with our edits, and 4 hunks would reintroduce fake data we removed. Needs deliberate cherry-picking. |
| ~~§4.2 — Lawyer profile privacy + edit form~~ | ✅ **DONE** (see above) — `show_contact` migration + PATCH allowlist + PII projection/strip + edit page + PDF gate + localization. Apply `20260705_lawyer_show_contact.sql` on deploy. |
| **§4.4 Part C** — subscription cards to real state (AI-3.2/3.1) | Contained; deferred with the profile work. |
| **§4.3** — mojibake data-repair migration + `cleanArabicText`; **§4.3** consult `?book=1` auto-open modal | Data migration needs DB verification; auto-open needs a `Suspense` wrapper (build-risk to validate). |
| **§4.9** — CLIENT-2.1 (new-tab session), CLIENT-2.3 (question handoff), CLIENT-3.1/3.6 (success dead-ends) | Contained; not reached this round. CLIENT-2.1 touches middleware (`proxy.ts`) and needs staging verification. |
| **Cross-cutting hardening** (§7 of the plan) | Rate-limiting + Zod on the new/anon endpoints; PDPL projection of `license_number`. Pre-public-launch. |
| ~~**Library-toolkit CLI**~~ | ✅ **DONE (2026-07-16):** Created `library-toolkit/` with 6 CLI commands: `parse`, `seed`, `clear`, `verify`, `status`, `reseed`. Full parse→seed→verify pipeline for library corpus management. |
| ~~**Paywall enforcement**~~ | ✅ **DONE (2026-07-16):** Fixed paywall bypass — was overridden with `free: true` on all items, now correctly uses `free: !isLocked` to enforce subscription gating. |
| **26 product/UX decisions** (§8 of the plan) | Need your call before building (flow shortcuts, wizard inputs, logo asset, appeal-deadline calculator, etc.). |

---

## Files changed this round

`src/lib/runtimeMode.ts` (new), `src/hooks/useUser.ts`, `src/app/settings/components/tabs/ProfileTab.tsx`, `src/app/login/page.tsx`, `src/app/demo-login/page.tsx`, `src/app/dashboard/firm/layout.tsx`, `src/lib/betaConfig.ts`, `src/app/ai/{consult,assistant,analyze-strength,communicate}/page.tsx`, `src/app/ai/compare/_result-view.tsx`, `src/app/dashboard/lawyer/page.tsx`, `src/app/ai/layout.tsx`, `src/lib/services/api.ts`, `src/app/settings/layout.tsx`, `tsconfig.json`; deleted `src/app/dashboard/lawyer/profile/update_profile.ps1`.

## Not verified here (needs deploy)

Everything runtime: the dev switcher truly absent from a `NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND=supabase` build; the AI review overlay showing instead of fabricated text; the lawyer misroute landing on the real list; the settings overlap gone. Verify on staging.
