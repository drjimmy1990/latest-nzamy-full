# NZAMY — Implementation Status (QA-review remediation, round 2)

> **Date:** 2026-07-05 · **Branch:** `main` (uncommitted at time of writing) · **Plan:** [`TEST_REVIEW_FIX_PLAN.md`](./TEST_REVIEW_FIX_PLAN.md) · **Reconciliation:** [`TEST_REVIEW_RECONCILIATION.md`](./TEST_REVIEW_RECONCILIATION.md)
> **This round** executed the QA-review fixes that do **not** depend on the real seeded library data, per the instruction to "fix all we can, document what's done vs not, and go." The genuinely data-dependent library work (search corpus, book content) is deferred with reasons below.
> **Gates:** `tsc --noEmit` = 0 errors · `eslint .` = 0 errors (warnings only) · `next build` = exit 0.

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

---

## ⏳ Deferred — needs the real library data, a live-DB migration, or a larger build

These are fully specified in [`TEST_REVIEW_FIX_PLAN.md`](./TEST_REVIEW_FIX_PLAN.md) (exact code/SQL). They were held because they depend on infrastructure this session can't drive, or are larger features better done deliberately.

| Item | Why deferred |
|------|--------------|
| **§4.6 — Library search + Arabic FTS** (LIB-4/5/KN-4) | **Needs the real seeded library corpus** to test + the riskiest live-DB migration (drops/recreates 5 `fts` columns + a materialized view). This is the "library needs its real data files" dependency you called out. |
| **§4.5 — Book/reference detail** (LIB-19.1/2/3) | The code fix (remove the 2-slug hardcode → fetch by slug, fix the hydration crash, fix شرعي/وضعي label) is buildable, but "working well" needs the **real book data seeded** to verify. Specced, not yet applied. |
| **§4.7 — Persistence (folders/notes/drafts → DB)** | Large feature (~22h): notes table + RLS + CRUD, atomic SmartFolders API wiring, draft persistence. |
| **§4.8 — Merge the tester's 10 modifications** | Careful merge; 2 files conflict with our edits, and 4 hunks would reintroduce fake data we removed. Needs deliberate cherry-picking. |
| **§4.2 — Lawyer profile privacy + edit form** (LAWYER-6.1/6.3/6.2) | HIGH but needs a `show_contact` migration + PATCH-allowlist change + a new edit-form page. Specced; not yet built. |
| **§4.4 Part C** — subscription cards to real state (AI-3.2/3.1) | Contained; deferred with the profile work. |
| **§4.3** — mojibake data-repair migration + `cleanArabicText`; **§4.3** consult `?book=1` auto-open modal | Data migration needs DB verification; auto-open needs a `Suspense` wrapper (build-risk to validate). |
| **§4.9** — CLIENT-2.1 (new-tab session), CLIENT-2.3 (question handoff), CLIENT-3.1/3.6 (success dead-ends) | Contained; not reached this round. CLIENT-2.1 touches middleware (`proxy.ts`) and needs staging verification. |
| **Cross-cutting hardening** (§7 of the plan) | Rate-limiting + Zod on the new/anon endpoints; PDPL projection of `license_number`. Pre-public-launch. |
| **26 product/UX decisions** (§8 of the plan) | Need your call before building (flow shortcuts, wizard inputs, logo asset, appeal-deadline calculator, etc.). |

---

## Files changed this round

`src/lib/runtimeMode.ts` (new), `src/hooks/useUser.ts`, `src/app/settings/components/tabs/ProfileTab.tsx`, `src/app/login/page.tsx`, `src/app/demo-login/page.tsx`, `src/app/dashboard/firm/layout.tsx`, `src/lib/betaConfig.ts`, `src/app/ai/{consult,assistant,analyze-strength,communicate}/page.tsx`, `src/app/ai/compare/_result-view.tsx`, `src/app/dashboard/lawyer/page.tsx`, `src/app/ai/layout.tsx`, `src/lib/services/api.ts`, `src/app/settings/layout.tsx`, `tsconfig.json`; deleted `src/app/dashboard/lawyer/profile/update_profile.ps1`.

## Not verified here (needs deploy)

Everything runtime: the dev switcher truly absent from a `NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND=supabase` build; the AI review overlay showing instead of fabricated text; the lawyer misroute landing on the real list; the settings overlap gone. Verify on staging.
