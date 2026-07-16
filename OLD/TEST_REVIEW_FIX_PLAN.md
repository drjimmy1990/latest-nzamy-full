# NZAMY — QA-Review Remediation Plan (Round 2)

> **Date:** 2026-07-05 · **Scope:** the open work surfaced by the QA tester's production review, reconciled in [`TEST_REVIEW_RECONCILIATION.md`](./TEST_REVIEW_RECONCILIATION.md). This is the *fix plan* for the 37 still-open findings + the 10 tester modifications, on top of our already-committed `PRODUCTION_FIX_PLAN.md` work.
> **How it was produced:** 9 per-workstream remediation agents read the **actual current code**, then an adversarial pass checked correctness, completeness, and cross-file sequencing. Every spec below is grounded in real file:line references; reviewer corrections are folded in as ⚠️ callouts.
> **Trust note:** file:line refs were accurate at generation time — re-verify with GitNexus `context()`/`impact()` before editing.

---

## 1. Executive summary

The tester's review was validated: after removing non-issues and product decisions, **~9 engineering workstreams (~85.5h)** of real remediation remain, plus a set of owner UX decisions.

**Do-first, non-negotiable:** 🔴 **P0 — the dev role-switcher is live in production** (`CLIENT-2.7`). It ships in four places (settings console, `/demo-login`, the `/login` test-credential fallback, the firm-layout switcher), all bypassing Supabase auth. This is a launch blocker and the top of the plan.

**Then the HIGH bugs the tester caught that our first pass didn't touch:** the public lawyer profile leaks contact PII, several lawyer buttons are broken (incl. the still-missing edit form), the AI tools fabricate output via `setTimeout`, book-detail pages crash / hardcode 2 slugs, and library search + Arabic normalization (our own deferred §7.2). Then persistence (drafts/folders/notes → DB), merging the tester's library-UX modifications, and the client-UX bugs.

**Effort by workstream:**

| # | Workstream | Effort | Fix-risk |
| :--- | :--- | :---: | :---: |
| §4.1 | P0: Beta teardown / remove dev role-switcher from production | 5h | MED |
| §4.2 | Lawyer profile — contact privacy | 7h | MED |
| §4.3 | Lawyer dashboard bugs — misroute + mojibake + dead links + sync + sidebar | 9h | MED |
| §4.4 | AI tools fabricate output — honest gating | 7h | LOW |
| §4.5 | Library book/reference detail bugs | 10h | MED |
| §4.6 | library-search | 14h | MED |
| §4.7 | Library persistence | 22h | MED |
| §4.8 | Merge tester's 10 proposed modifications | 6h | MED |
| §4.9 | Client-side UX bugs | 5.5h | LOW |
| | **Total** | **85.5h** | |

Plus the cross-cutting hardening the reviewer flagged (§7: rate-limiting, Zod, MV refresh) and **26 product/UX decisions** (§8) that need *your* call before building.

---

## 2. Global sequencing & file-conflict map

The reviewer produced an explicit order. The golden rules: **migrations before the code that reads them; security/teardown first; never edit a shared file from two workstreams in parallel.**

RECOMMENDED GLOBAL ORDER (migrations-before-code enforced within each):

PHASE 0 — standalone, no deps, ship first to de-risk:
1. Beta-teardown/CLIENT-2.7 (create src/lib/runtimeMode.ts FIRST, then all gate edits). No migration. Highest-severity CRITICAL, no cross-file conflicts. Blocking dep: runtimeMode.ts before every consumer edit.
2. Client-UX bugs (CLIENT-2.1/2.3/2.5/2.6/3.1/3.6). All independent, no migration. CLIENT-2.5 gated on product decision (default no-op). CLIENT-2.1 must be verified on STAGING (supabase auth) not demo.

PHASE 1 — migrations (run in a maintenance window, in this order; all are additive/idempotent but the FTS one is heavy):
3. Lawyer show_contact migration (rename to 20260702_+) — MUST precede the /api/v1/lawyers projection change AND the profile PATCH allowlist edit (both reference show_contact). ALSO must add show_contact to profile/route.ts lawyerFields (correction above) or the edit toggle no-ops.
4. Mojibake repair migration (20260705_repair_task_title) — ship the write-side cleanArabicText+charset in the tasks route BEFORE running the backfill so new rows stay clean during backfill.
5. Feqh type-correction migration (20260706) — coordinate id/slug with any §7.2 book-seed to avoid double-insert; reduce to update-only if seed owns the insert.
6. Library-notes migration (20260705_library_notes) — before notes API deploy.
7. Arabic-FTS-normalization migration (rename to 20260702+ to sort after committed 20260701 migrations) — RISKIEST: drops+recreates 5 generated fts cols + cross_section_search MV. Own maintenance window. Confirm backfill row counts. Frontend search wiring (Part C) is INERT until this lands.

PHASE 2 — code on top of migrations:
8. Lawyer-profile spec (edit page + route projection + PII strip + PDF gate + localization) — after step 3. FIX the missing show_contact allowlist entry.
9. Lawyer-dashboard bugs (3.5/4.1/3.3/3.9/3.14) — 4.1 write-side after step 4 migration ordering above; 3.14 SHIP INDEPENDENTLY and DROP /ai/draft + /ai/contracts from LAWYER_AI_PREFIXES (they are shared/business tools — see correction).
10. AI-gating spec (register 4 toolIds THEN wrap 5 surfaces; Part C subscription independent). No migration. Note consult/page.tsx is ALSO touched by client-UX 2.3 (useSearchParams seed) and by lawyer-dashboard 3.5 pattern — sequence consult edits so the Suspense wrapper is added ONCE (2.3 owns it) and the BetaReviewGate wrap (AI-gating) layers on top. CONFLICT: consult/page.tsx.
11. Book-detail spec (LIB-19.x) — API reshape + page guards TOGETHER (either alone leaves shape mismatch). error.tsx additive. Type-detection after step 5.
12. Library-search Part B+C — ONLY after step 7 migration AND after §7.1/§7.3 security gates (already committed). CONFLICT: laws/page.tsx (also edited by merge-mods B2 sort + book-detail LIB-19.2 type detection).
13. Library-persistence (folders/notes/drafts) — after step 6 migration. foldersRepo.ts shared by SmartFolders + FolderSelectionModal.
14. Merge-tester-mods — do LAST. Explicitly REJECT the 4 regression reverts (LawsTabContent gate, orders demo-data import, judgment DEMO_PRECEDENTS, laws/page init/autocomplete delete). CONFLICT: laws/page.tsx, MyNotesSection.tsx, OrdersTabContent.tsx.

CRITICAL FILE CONFLICTS (same file, multiple specs — must be sequenced/hand-merged, never parallel):
- laws/page.tsx: library-search (Part C server-search state + filtered* swaps) + book-detail (LIB-19.2 type detection ~line 437-497) + merge-mods (B2 sortedLaws/sortedOrders + props). ORDER: book-detail type-detection first (isolated to the mapping block), then library-search Part C (adds usingServerSearch gating on filtered*), then merge-mods B2 sort ON TOP of the server-search filtered* (sort the server OR demo result). The merge-mods B2 sort is a NO-OP for laws/orders (no .year) — resolve that first.
- consult/page.tsx: client-UX 2.3 (Suspense + useSearchParams seed) + AI-gating (BetaReviewGate wrap of AI bubbles). ORDER: 2.3 first (owns the Suspense/rename to Inner), AI-gating layers the gate inside the map. Also drop the misleading متصل pill (AI-gating) — coordinate with 2.3's seed effect.
- consultations/page.tsx: lawyer-dashboard 3.5 (Suspense + ?book=1) — already has showBooking + nzamy-workflow-updated listener (verified), only useSearchParams/Suspense missing.
- MyNotesSection.tsx: library-persistence (DB load/delete branch) + merge-mods A4 (grid mode + map extension). ORDER: merge-mods A4 UI first (layout/state names), then persistence DB branch on top. Keep grouped view (A4 correction).
- OrdersTabContent.tsx / LawsTabContent.tsx: merge-mods B1/B3 (sort bar + props) — must follow laws/page.tsx B2 plumbing.
- src/lib/services/api.ts: lawyer-dashboard 4.1 (charset=utf-8 on GET+mutate) — behavior-neutral but api.ts is the highest-blast-radius symbol (every dashboard). Isolate + detect_changes.
- betaConfig.ts: AI-gating (register 4 ids) — no conflict, additive.

MIGRATION FILENAME COLLISION: three specs propose 20260701_* or same-date files while 20260701_smart_folder_items_display_cols.sql + 20260701_client_workflow_rls_assert.sql ALREADY EXIST. Rename ALL new migrations to 20260702+ ascending to guarantee replay order after committed 20260701 set.

BLOCKING DEPS SUMMARY: show_contact col → lawyers route + profile PATCH allowlist edit; FTS migration → search frontend; notes migration → notes API; §7.1+§7.3 (committed) → library-search frontend flip (new enumeration surface); runtimeMode.ts → all beta-teardown edits; write-side mojibake hardening → repair backfill.

---

## 3. Migration ordering (rename past the committed set)

⚠️ **Three specs proposed `20260701_*` filenames, but `20260701_smart_folder_items_display_cols.sql` and `20260701_client_workflow_rls_assert.sql` are already committed.** Rename **all** new migrations to `20260702_*` and up so replay order is unambiguous on a fresh DB. Apply order (maintenance window, staging first):

1. `20260702_lawyer_show_contact.sql` (privacy toggle column) — **before** the `/api/v1/lawyers` projection change **and** the profile PATCH allowlist edit.
2. `20260702_repair_task_title.sql` (mojibake) — ship the write-side charset+clean fix **before** running the backfill.
3. `20260703_feqh_type_correction.sql` — coordinate id/slug with any §7.2 book seed to avoid double-insert.
4. `20260703_library_notes.sql` — before the notes API deploys.
5. `20260704_arabic_fts_normalization.sql` — **the riskiest DDL** (drops/recreates 5 `fts` columns + the `cross_section_search` MV). Own maintenance window; confirm backfill row counts; the frontend search wiring stays inert until this lands.

---

## 4. Detailed remediation specs

Each spec has root cause (file:line), exact proposed code/SQL, acceptance, verification, effort, risk, and GitNexus pre-edit targets. **⚠️ Reviewer-correction callouts** amend the spec directly below it — apply them.

### §4.1 — P0 — Beta teardown / remove dev role-switcher from production (CLIENT-2.7)
_Effort: 5h · Fix-risk: MED_

#### Beta teardown: gate every dev role/account switcher + /demo-login out of the production build
**Finding refs:** CLIENT-2.7  ·  **Severity:** CRITICAL  ·  **Effort:** 5h  ·  **Risk of fix:** MED

**Root cause** — four independent demo surfaces render in a production (supabase-mode) build because they are gated on nothing, or on `DEMO_BYPASS_KEYS`, not on backend mode:

1. `src/app/settings/components/tabs/ProfileTab.tsx:381-433` — the "Developer Demo Console" (`منطقة ديمو التطوير`) renders unconditionally. It maps every `DEMO_ACCOUNTS` entry into a `<select>` that calls `handleSwitchAccount` → `setDemoSession(acc.session, key)` (line 204-214), i.e. it writes a fully-privileged fabricated session (admin/max/9999 credits) to localStorage on a live account:
```tsx
// ProfileTab.tsx:398-408 — no isSupabaseMode / NODE_ENV guard
<select value={activeDemoKey} onChange={(e) => handleSwitchAccount(e.target.value)} ...>
  {DEMO_ACCOUNTS.map((acc) => (
    <option key={acc.key} value={acc.key}>{acc.label} ...</option>
  ))}
</select>
```
2. `src/app/login/page.tsx:637-647` — a permanent `<a href="/demo-login">` "Test Accounts (Dev)" link in the login form, plus `handleLogin` (line 195-205) falls through to `authenticateTest(identifier, "Nzamy@2026")` whenever `BACKEND_MODE !== "supabase"`. The `/login` password box accepts the shared test password.
3. `src/app/demo-login/page.tsx` — the whole page (`export default function DemoLoginPage`) renders `DEMO_ACCOUNTS` group buttons and is reachable at `/demo-login`; it is only "internal by convention" (`betaConfig.ts:60`). No route guard, no env gate → ships and is crawlable in prod.
4. `src/app/dashboard/firm/layout.tsx:270-388` — `canDemoSwitchRole = user.userType === "admin" || !user.affiliation || ...` gates the firm role switcher on affiliation, not on backend mode → a real supabase firm user with no affiliation sees a "Switch Role (Demo)" dropdown that calls `setDemoSession` (line 360).

Already correctly gated (leave as-is, cite as the pattern to copy): `src/app/dashboard/business/page.tsx:112` — `const canShowQaRoleSwitcher = process.env.NODE_ENV !== "production" && businessRole === "owner";`.

Cookie note — no server route trusts `nzamy_demo_role`. The only reader is `src/proxy.ts:157-158` inside the **demo** branch (`req.cookies.has("nzamy_demo_role")`), which merely lets page navigation through when not in supabase mode. In supabase mode (`proxy.ts:61-153`) auth is Supabase-session only; the cookie is never consulted. So the cookie cannot escalate a prod request — but we still stop writing it in supabase mode for hygiene (`useUser.setDemoSession:468`, `logout:487`).

**Remediation** — env-gate, do NOT delete the shared files (`demo-accounts.ts`, `test-credentials.ts`, `useUser.setDemoSession` are imported by `register/client`, `register/provider`, `login`, `pricing`, `business` — deleting breaks the build). Add one shared flag and gate each render site; dead-strip the demo path so a supabase build tree-shakes the account arrays out of the rendered UI.

1. **Add a canonical client flag** mirroring the existing `useUser.ts:398` pattern. New file `src/lib/runtimeMode.ts`:
```ts
// Single source of truth for "are we in demo/dev mode?"
// Production (supabase) builds must ship NO demo switchers.
export const BACKEND_MODE =
  process.env.NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND ?? "demo";
export const isSupabaseMode = BACKEND_MODE === "supabase";
/** Demo UI (role switchers, /demo-login, test-credential login) is allowed only here. */
export const isDemoUiEnabled = !isSupabaseMode;
```

2. **ProfileTab.tsx** — wrap the Developer Demo Console block (lines 381-433) so it renders only in demo mode. Add import and a guard constant:
```tsx
// add near line 16
import { isDemoUiEnabled } from "@/lib/runtimeMode";
```
```tsx
// replace line 381 opening of the block
{/* Developer Demo Console — DEMO MODE ONLY, absent from supabase build */}
{isDemoUiEnabled && (
  <div className="bg-amber-500/[0.03] ...">
    {/* ...existing 382-433 content unchanged... */}
  </div>
)}
```
Because `isDemoUiEnabled` is a module-const derived from `process.env.NEXT_PUBLIC_*`, Next inlines it at build time and the `&& (...)` subtree is dead-code-eliminated in a supabase build.

3. **login/page.tsx** — gate both the test-credential fallback and the `/demo-login` link. Import the flag (line ~29) and guard the link block (lines 637-647):
```tsx
import { isDemoUiEnabled } from "@/lib/runtimeMode";
```
```tsx
{/* ── Dev: link to full demo-login page (demo mode only) ── */}
{isDemoUiEnabled && (
  <motion.div variants={itemVariants} className="mt-6 text-center">
    <a href="/demo-login" ...>{isAr ? "حسابات تجريبية للاختبار" : "Test Accounts (Dev)"}</a>
  </motion.div>
)}
```
The `authenticateTest` fallback in `handleLogin` (line 195-205) is already dead in prod because it runs only when `BACKEND_MODE !== "supabase"`; leave logic but the block is unreachable in supabase mode. (Optional hardening: wrap it in `if (isDemoUiEnabled) { ... }` for clarity.)

4. **demo-login/page.tsx** — make the whole route a 404 in supabase mode. Add at the top of the component body (after `const router = useRouter();`, line 86):
```tsx
import { notFound } from "next/navigation";
import { isDemoUiEnabled } from "@/lib/runtimeMode";
// ...inside DemoLoginPage, before any hooks that must not run in prod:
export default function DemoLoginPage() {
  if (!isDemoUiEnabled) notFound(); // 404 in production/supabase build
  const router = useRouter();
  // ...
```
Note: `notFound()` before hooks is fine here because the check is a build-time constant (same value every render), so hook order stays stable. This renders the app's 404 for `/demo-login` in prod.

5. **firm/layout.tsx** — add backend-mode to the gate so real supabase firm users never see the switcher:
```tsx
// add import
import { isDemoUiEnabled } from "@/lib/runtimeMode";
// line 270 — change:
const canDemoSwitchRole =
  isDemoUiEnabled && (
    user.userType === "admin" ||
    !user.affiliation ||
    /* ...existing remaining conditions... */
  );
```

6. **useUser.ts** — stop writing the demo cookie in supabase mode (hygiene; the register/login flows only call `setDemoSession` in demo mode, but ProfileTab/firm-layout also call it). Guard the cookie write at line 468 and the clear at 487:
```ts
// setDemoSession (line 464-470)
export function setDemoSession(session: UserSession, key: string = ""): void {
  if (typeof window === "undefined") return;
  if (isSupabaseMode) return; // no demo writes in production
  localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(session));
  localStorage.setItem(DEMO_KEY_STORAGE, key);
  document.cookie = "nzamy_demo_role=true; path=/";
  notifyAll();
}
```
(`logout()` already branches on `BACKEND_MODE === "supabase"` at line 477 and returns before the cookie clear, so it is correct.)

7. **business/page.tsx** — already correctly gated (`NODE_ENV !== "production"`, line 112). For consistency, additionally require demo mode so a `next dev` run against supabase does not show it:
```tsx
import { isDemoUiEnabled } from "@/lib/runtimeMode";
const canShowQaRoleSwitcher =
  isDemoUiEnabled && process.env.NODE_ENV !== "production" && businessRole === "owner";
```

No migration required — this is a build/config gate only. No SQL.

**Files touched**
- `src/lib/runtimeMode.ts` (new)
- `src/app/settings/components/tabs/ProfileTab.tsx`
- `src/app/login/page.tsx`
- `src/app/demo-login/page.tsx`
- `src/app/dashboard/firm/layout.tsx`
- `src/hooks/useUser.ts`
- `src/app/dashboard/business/page.tsx`
- (unchanged, confirmed safe to keep: `src/lib/demo-accounts.ts`, `src/lib/test-credentials.ts`, `src/constants/demoAccountsData.ts`, `src/app/register/client/page.tsx`, `src/app/register/provider/page.tsx`, `src/app/pricing/page.tsx`, `src/proxy.ts`)

**Acceptance criteria**
- [ ] With `NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND=supabase`, a production build renders `/settings` ProfileTab with NO "منطقة ديمو التطوير" console.
- [ ] `/demo-login` returns HTTP 404 in a supabase build.
- [ ] `/login` shows no "حسابات تجريبية للاختبار / Test Accounts (Dev)" link, and `Nzamy@2026` does not authenticate.
- [ ] A supabase firm user (no affiliation) sees no "Switch Role (Demo)" dropdown in the firm dashboard header.
- [ ] `setDemoSession` writes nothing (no localStorage, no `nzamy_demo_role` cookie) when `isSupabaseMode`.
- [ ] `next build` succeeds — no unresolved imports from removed symbols (nothing was deleted).
- [ ] With `NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND` unset/`demo`, all demo surfaces still work (dev workflow preserved).

**Verification steps**
1. `NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND=supabase npm run build` then grep the emitted client chunks for demo strings: `grep -rl "منطقة ديمو التطوير\|Test Accounts (Dev)\|Nzamy@2026\|DEMO_ACCOUNTS" .next/static` → expect zero hits (dead-code eliminated by the build-time constant).
2. `NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND=supabase npm start`, then `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/demo-login` → `404`.
3. Load `/settings` as a supabase user → confirm the amber console is absent (DOM has no `select` bound to `handleSwitchAccount`).
4. On `/login` submit `admin@nzamy.test` / `Nzamy@2026` in supabase mode → "Invalid credentials" (goes through `supabase.auth.signInWithPassword`, not `authenticateTest`).
5. Re-run steps 1-4 with the flag unset → all demo surfaces reappear (regression guard for dev).
6. Confirm cookie: DevTools → Application → Cookies after any settings save in supabase mode → no `nzamy_demo_role`.

**Ordering / dependencies**
- Create `src/lib/runtimeMode.ts` first; all other edits import it.
- No RLS interaction — this is a client build/nav gate. Server auth already runs entirely through the supabase proxy branch (`proxy.ts:61-153`); the `nzamy_demo_role` cookie is only read in the demo branch (`proxy.ts:158`), which is never reached when `isSupabaseMode`. Do NOT remove that demo-branch cookie read (it keeps dev navigation working); it is inert in prod.
- Independent of the STILL-DEFERRED library-search and lawyer-profile-edit work; can ship standalone.
- Full teardown (physically deleting `demo-accounts.ts`/`test-credentials.ts`/`/demo-login`) is a later cleanup once supabase auth is the only mode — deferred because `register/*`, `login`, `pricing`, `business` still import from them; env-gating is the safe pre-launch step.

**GitNexus pre-edit** — run `impact({direction:'upstream'})` on: `setDemoSession`, `authenticateTest`, `useUser`, `DEMO_ACCOUNTS`, and the `ProfileTab` component before editing (setDemoSession has the widest blast radius — login, register/client, register/provider, firm/layout, ProfileTab).

> **⚠️ Reviewer corrections for §4.1 (apply these):**
>
> - Files-touched note claims profile dir contains 'page.tsx + _data/'. VERIFIED FALSE for the lawyer profile dir (it contains page.tsx + update_profile.ps1, no _data/). Minor, but the LAWYER spec (not this one) makes the same '_data/' claim about src/app/dashboard/lawyer/profile/ — that is wrong; there is a stray update_profile.ps1 script committed in that dir -> flag/remove the .ps1 and correct the 'only page.tsx + _data/' assertion.
>
> - The runtimeMode.ts BACKEND_MODE uses process.env.NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND, but useUser.ts:394-396 gates that env read behind a typeof-window/other guard and the canonical value is computed there. Two independent module-level reads of the same NEXT_PUBLIC var is fine for tree-shaking, BUT setDemoSession lives in useUser.ts and the spec's Step 6 adds `if (isSupabaseMode) return` referencing useUser's OWN isSupabaseMode (line 398) — NOT the new runtimeMode export. VERIFIED useUser.ts:464-470 setDemoSession currently has NO guard. -> Ensure Step 6 uses useUser.ts's local isSupabaseMode (line 398), not an import cycle from runtimeMode.ts (useUser must not import runtimeMode if runtimeMode is trivial; acceptable, but state it to avoid a circular import).


---

### §4.2 — Lawyer profile — contact privacy (LAWYER-6.1), edit-form UI (LAWYER-6.3), localization (LAWYER-6.2)
_Effort: 7h · Fix-risk: MED_

#### Lawyer profile — contact-info privacy + edit-form UI + broken buttons + localization
**Finding refs:** LAWYER-6.1 (contact privacy), LAWYER-6.3 (edit form / broken buttons), LAWYER-6.2 (localization)  ·  **Severity:** HIGH (6.1, 6.3) / LOW (6.2)  ·  **Effort:** ~7h  ·  **Risk of fix:** MED

**Root cause**

1. **Contact-info leak (LAWYER-6.1)** — The `/dashboard/lawyer/profile` page is the lawyer's *own* (owner-only) view, so the contact chips at `src/app/dashboard/lawyer/profile/page.tsx:324-337` are fine *for the owner*. The real leak is the **public** directory endpoint, which returns every `profiles.*` + `lawyer_profiles.*` column (phone, email, license_number, hourly_rate…) to any anonymous caller with no field projection:
   ```ts
   // src/app/api/v1/lawyers/route.ts:23-28
   let query = supabase
     .from("profiles")
     .select("*, lawyer_profiles!inner(*)", { count: "exact" })   // ← leaks phone/email/license
     .eq("user_type", "lawyer")
     .eq("lawyer_profiles.verification_status", "verified")
   ```
   There is currently **no per-lawyer toggle** controlling whether contact details are public. `lawyer_profiles` has `marketplace_visible` and `is_accepting_clients` but no `show_contact` column (`supabase/migrations/20260603_phase1_001_profiles.sql:92-115`; `is_accepting_clients` added later in `20260616_production_readiness_fixes.sql:11-13`).

2. **Dead edit route + broken buttons (LAWYER-6.3)** — The header links to a route that does not exist:
   ```tsx
   // src/app/dashboard/lawyer/profile/page.tsx:297-300
   <Link href="/dashboard/lawyer/profile/edit"  // ← no page.tsx at this path → 404
     className="...">
     <PencilSimple size={13} /> تعديل
   </Link>
   ```
   `ls src/app/dashboard/lawyer/profile/` contains only `page.tsx` + `_data/` — no `edit/`. The PATCH backend is already wired (`src/app/api/v1/profile/route.ts:105-116` dual allowlist accepts `bio_ar, specialties, years_experience, hourly_rate, license_number, bar_association, city, marketplace_visible, is_accepting_clients`), so only the UI is missing. The **تصدير PDF** button is a no-op — it has no `onClick`:
   ```tsx
   // src/app/dashboard/lawyer/profile/page.tsx:291-293
   <button className="...">
     <FilePdf size={13} /> تصدير PDF   {/* ← no handler; does nothing */}
   </button>
   ```

3. **Egyptian term (LAWYER-6.2)** — Saudi lawyers hold a *ترخيص* (license), not نقابة membership:
   ```tsx
   // src/app/dashboard/lawyer/profile/page.tsx:335
   <SealCheck ... /> رقم النقابة: {profileData.barNumber}
   ```

**Remediation**

**Step 1 — Migration: add `show_contact` (recommended over owner-only, because the leak is on the public route, not the owner page).** Mirror the `ADD COLUMN IF NOT EXISTS` pattern from `supabase/migrations/20260616_production_readiness_fixes.sql:11-13`. New file `supabase/migrations/20260705_lawyer_show_contact.sql`:
```sql
-- ============================================================
-- Migration: 20260705_lawyer_show_contact.sql
-- Purpose:  LAWYER-6.1 — per-lawyer contact-info privacy flag.
--           Public directory (/api/v1/lawyers) must NOT expose
--           phone/email/license unless the lawyer opts in.
--           Default false = private (opt-in disclosure).
-- ============================================================
begin;

alter table public.lawyer_profiles
  add column if not exists show_contact boolean not null default false;

comment on column public.lawyer_profiles.show_contact
  is 'When true, the public marketplace may expose phone/email/license. Default false.';

commit;
```
Add the type field in `src/types/database.ts` next to `is_accepting_clients` (line 107):
```ts
  is_accepting_clients: boolean;
  show_contact: boolean;
```

**Step 2 — Gate contact fields in the PUBLIC route.** Replace the `select("*")` blanket projection in `src/app/api/v1/lawyers/route.ts:23-28` with an explicit column list that omits raw PII, then post-filter contact fields by `show_contact`:
```ts
let query = supabase
  .from("profiles")
  .select(
    "id, display_name, display_name_en, avatar_url, city, user_type, " +
    "lawyer_profiles!inner(user_id, specialties, years_experience, hourly_rate, " +
    "bio_ar, bio_en, verification_status, is_accepting_clients, marketplace_visible, " +
    "show_contact, bar_association, license_number)",
    { count: "exact" },
  )
  .eq("user_type", "lawyer")
  .eq("lawyer_profiles.verification_status", "verified")
  .eq("lawyer_profiles.marketplace_visible", true)  // mirror the RLS "public read" predicate
  .range(offset, offset + limit - 1);
```
Then strip PII when the lawyer has not opted in, before returning (`route.ts:55-61`):
```ts
const { data, count, error } = await query;
if (error) return NextResponse.json({ error: error.message }, { status: 500 });

const lawyers = (data ?? []).map((row: Record<string, unknown>) => {
  const lp = (Array.isArray(row.lawyer_profiles) ? row.lawyer_profiles[0] : row.lawyer_profiles) as Record<string, unknown> | null;
  const showContact = lp?.show_contact === true;
  if (!showContact && lp) {
    // license_number is credential PII — never public unless opted in
    delete (lp as Record<string, unknown>).license_number;
  }
  return row;
});

return NextResponse.json({ lawyers, total: count });
```
Note: `profiles.phone`/`profiles.email` are already NOT in the projection above, so they are omitted unconditionally; `show_contact` gating is applied to `license_number`. (If a future contact-card feature needs phone/email publicly, add them to the projection only inside the `showContact` branch.)

**Step 3 — Build the edit page.** New file `src/app/dashboard/lawyer/profile/edit/page.tsx`, mirroring the direct-`fetch` PATCH pattern from `src/app/dashboard/admin/users/[id]/page.tsx:244-265` (`handleChangePlan`) — same loading/msg/finally shape:
```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, CheckCircle, SpinnerGap, Warning } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { apiGet, isSupabaseMode } from "@/lib/services/api";

type Form = {
  bio_ar: string;
  specialties: string;          // comma-separated in the input, split on submit
  years_experience: string;
  hourly_rate: string;
  license_number: string;
  bar_association: string;
  city: string;
  marketplace_visible: boolean;
  is_accepting_clients: boolean;
  show_contact: boolean;
};

const EMPTY: Form = {
  bio_ar: "", specialties: "", years_experience: "", hourly_rate: "",
  license_number: "", bar_association: "", city: "",
  marketplace_visible: false, is_accepting_clients: true, show_contact: false,
};

type ProfileApiResponse = {
  profile: { city?: string | null } | null;
  roleProfile: {
    bio_ar?: string | null; specialties?: string[] | null;
    years_experience?: number | null; hourly_rate?: number | null;
    license_number?: string | null; bar_association?: string | null;
    city?: string | null; marketplace_visible?: boolean | null;
    is_accepting_clients?: boolean | null; show_contact?: boolean | null;
  } | null;
};

export default function LawyerProfileEditPage() {
  const { isDark } = useTheme();
  const router = useRouter();
  const [form, setForm] = useState<Form>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!isSupabaseMode) { setLoading(false); return; }
    try {
      const res = await apiGet<ProfileApiResponse>("/api/v1/profile");
      const r = res.roleProfile;
      if (r) setForm({
        bio_ar: r.bio_ar ?? "",
        specialties: (r.specialties ?? []).join("، "),
        years_experience: r.years_experience != null ? String(r.years_experience) : "",
        hourly_rate: r.hourly_rate != null ? String(r.hourly_rate) : "",
        license_number: r.license_number ?? "",
        bar_association: r.bar_association ?? "",
        city: (r.city ?? res.profile?.city) ?? "",
        marketplace_visible: r.marketplace_visible ?? false,
        is_accepting_clients: r.is_accepting_clients ?? true,
        show_contact: r.show_contact ?? false,
      });
    } catch { setMsg({ type: "err", text: "تعذّر تحميل بيانات الملف" }); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true); setMsg(null);
    try {
      const body = {
        bio_ar: form.bio_ar,
        specialties: form.specialties.split(/[،,]/).map(s => s.trim()).filter(Boolean),
        years_experience: form.years_experience ? parseInt(form.years_experience, 10) : 0,
        hourly_rate: form.hourly_rate ? Number(form.hourly_rate) : null,
        license_number: form.license_number,
        bar_association: form.bar_association,
        city: form.city,
        marketplace_visible: form.marketplace_visible,
        is_accepting_clients: form.is_accepting_clients,
        show_contact: form.show_contact,
      };
      const res = await fetch("/api/v1/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "فشل حفظ التعديلات");
      setMsg({ type: "ok", text: "تم حفظ التعديلات بنجاح" });
      setTimeout(() => router.push("/dashboard/lawyer/profile"), 800);
    } catch (err) {
      setMsg({ type: "err", text: err instanceof Error ? err.message : "حدث خطأ" });
    } finally { setSaving(false); }
  };

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";
  const input = `w-full px-3 py-2 rounded-xl text-[13px] border transition-colors ${
    isDark ? "bg-zinc-800 border-white/[0.06] text-zinc-200 placeholder:text-zinc-600"
           : "bg-slate-50 border-slate-200 text-slate-700 placeholder:text-slate-400"}`;
  const label = `text-[11px] font-bold mb-1 block ${isDark ? "text-zinc-400" : "text-slate-500"}`;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm(f => ({ ...f, [k]: v }));

  if (loading) return <div className="max-w-2xl mx-auto p-10 text-center" dir="rtl"><SpinnerGap size={24} className="animate-spin mx-auto text-zinc-400" /></div>;

  return (
    <div className="max-w-2xl mx-auto space-y-5" dir="rtl">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <Link href="/dashboard/lawyer/profile"
          className={`h-10 w-10 rounded-xl flex items-center justify-center ${isDark ? "bg-zinc-800 text-zinc-400 hover:bg-zinc-700" : "bg-slate-100 text-slate-500 hover:bg-slate-200"} transition-colors`}>
          <ArrowLeft size={16} />
        </Link>
        <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-slate-800"}`}>تعديل الملف المهني</h1>
      </motion.div>

      <div className={`${card} p-5 space-y-4`}>
        <div>
          <label className={label}>نبذة تعريفية</label>
          <textarea rows={4} value={form.bio_ar} onChange={e => set("bio_ar", e.target.value)} className={input} placeholder="نبذة عن خبرتك ومجالات عملك" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className={label}>التخصصات (افصل بفاصلة)</label>
            <input value={form.specialties} onChange={e => set("specialties", e.target.value)} className={input} placeholder="قانون تجاري، قانون عمل" /></div>
          <div><label className={label}>المدينة</label>
            <input value={form.city} onChange={e => set("city", e.target.value)} className={input} /></div>
          <div><label className={label}>سنوات الخبرة</label>
            <input type="number" min="0" value={form.years_experience} onChange={e => set("years_experience", e.target.value)} className={input} /></div>
          <div><label className={label}>سعر الساعة (ر.س)</label>
            <input type="number" min="0" value={form.hourly_rate} onChange={e => set("hourly_rate", e.target.value)} className={input} /></div>
          <div><label className={label}>رقم الترخيص</label>
            <input value={form.license_number} onChange={e => set("license_number", e.target.value)} className={input} placeholder="رقم ترخيص المحاماة" /></div>
          <div><label className={label}>جهة الترخيص</label>
            <input value={form.bar_association} onChange={e => set("bar_association", e.target.value)} className={input} placeholder="الهيئة السعودية للمحامين" /></div>
        </div>

        <div className="space-y-3 pt-2">
          {([
            ["marketplace_visible", "الظهور في دليل المحامين"],
            ["is_accepting_clients", "أستقبل موكلين جدد"],
            ["show_contact", "إظهار بيانات التواصل في الدليل العام"],
          ] as const).map(([k, lbl]) => (
            <label key={k} className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form[k]} onChange={e => set(k, e.target.checked)} className="accent-[#0B3D2E] w-4 h-4" />
              <span className={`text-[12px] ${isDark ? "text-zinc-300" : "text-slate-600"}`}>{lbl}</span>
            </label>
          ))}
        </div>

        {msg && (
          <div className={`text-[12px] font-bold px-3 py-2 rounded-xl flex items-center gap-2 ${msg.type === "ok" ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"}`}>
            {msg.type === "ok" ? <CheckCircle size={14} /> : <Warning size={14} />} {msg.text}
          </div>
        )}

        <div className="flex items-center gap-2 pt-2">
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-bold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors disabled:opacity-40">
            {saving ? <SpinnerGap size={14} className="animate-spin" /> : <CheckCircle size={14} />} حفظ التعديلات
          </button>
          <Link href="/dashboard/lawyer/profile"
            className={`px-4 py-2 rounded-xl text-[12px] font-bold transition-colors ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}`}>
            إلغاء
          </Link>
        </div>
      </div>
    </div>
  );
}
```
The existing `تعديل` link (`page.tsx:297-300`) already points at `/dashboard/lawyer/profile/edit`, so no change is needed there once the page exists.

**Step 4 — Honestly gate the تصدير PDF button.** It has no handler. Cheapest honest fix is `disabled` + a "قريباً" affordance (mirrors the app's "coming soon" gating pattern used elsewhere). Replace `page.tsx:291-293`:
```tsx
<button
  disabled
  title="قريباً"
  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold border transition-all cursor-not-allowed opacity-50 ${isDark ? "border-white/[0.08] text-zinc-500" : "border-slate-200 text-slate-400"}`}>
  <FilePdf size={13} /> تصدير PDF <span className="text-[9px]">(قريباً)</span>
</button>
```

**Step 5 — Localize the barNumber chip (LAWYER-6.2).** Replace `page.tsx:335`:
```tsx
<SealCheck size={11} className="text-[#C8A762]" /> رقم الترخيص: {profileData.barNumber}
```
Also relabel the field concept in the edit form (already done in Step 3: "رقم الترخيص" / "جهة الترخيص"). Note the underlying `EMPTY_PROFILE.barNumber` (`page.tsx:58`) maps from `license_number` (`page.tsx:173`) — leave the JS key `barNumber` as-is (internal only); only the visible Arabic string changes.

**Files touched**
- `supabase/migrations/20260705_lawyer_show_contact.sql` (new)
- `src/types/database.ts` (add `show_contact` to lawyer_profiles type)
- `src/app/api/v1/lawyers/route.ts` (explicit projection + show_contact PII strip)
- `src/app/dashboard/lawyer/profile/edit/page.tsx` (new)
- `src/app/dashboard/lawyer/profile/page.tsx` (PDF button gate + "رقم الترخيص" relabel)

**Acceptance criteria**
- [ ] `GET /api/v1/lawyers` response contains NO `phone`/`email` for any lawyer, and NO `license_number` for lawyers with `show_contact=false`.
- [ ] A lawyer with `show_contact=true` still surfaces `license_number` in the public list.
- [ ] Only `verification_status='verified'` AND `marketplace_visible=true` lawyers appear in the public list.
- [ ] `/dashboard/lawyer/profile/edit` renders (no 404); the `تعديل` button reaches it.
- [ ] Submitting the edit form issues `PATCH /api/v1/profile` with the 10 allowlisted fields; on 200 it shows "تم حفظ التعديلات" and returns to the profile page.
- [ ] Reloading the profile page reflects the saved bio/specialties/city/rate/license and the verified seal logic is unchanged.
- [ ] `تصدير PDF` is visibly disabled with a "(قريباً)" affordance and performs no action.
- [ ] The text "رقم النقابة" no longer appears anywhere in the lawyer profile UI; "رقم الترخيص" appears instead.

**Verification steps**
1. Apply migration; `\d public.lawyer_profiles` shows `show_contact boolean not null default false`.
2. `curl -s "$APP/api/v1/lawyers" | jq '.lawyers[0]'` → assert no `email`/`phone` keys; `license_number` absent unless that row's `show_contact` is true (toggle one lawyer via SQL and re-curl).
3. Log in as a lawyer (supabase mode), open `/dashboard/lawyer/profile`, click `تعديل` → edit page loads with current values; change bio + toggle "إظهار بيانات التواصل"; save; confirm redirect + persisted value via `GET /api/v1/profile`.
4. `grep -R "رقم النقابة" src/app/dashboard/lawyer` → no matches.
5. `npm run lint && npm run build` clean.

**Ordering / dependencies**
- Migration (Step 1) MUST be applied **before** deploying the route change (Step 2) and edit form (Step 3) — both reference `show_contact`; a missing column makes the `select(...)` and the PATCH 500.
- RLS: `lawyer_profiles` policy `"public read verified lawyers"` (`20260603_phase1_001_profiles.sql:131-133`) already restricts anon SELECT to `verification_status='verified' AND marketplace_visible=true`, so Step 2's added `.eq("marketplace_visible", true)` aligns app-filter with RLS (defense in depth) and does not fight it. The PATCH path relies on the existing `"lawyers update own profile"` UPDATE policy (`:144-147`) — `show_contact` is a plain column on that same row, so no new policy is needed.
- Step 4 (PDF) and Step 5 (localization) are independent, no ordering constraints.

**GitNexus pre-edit** — run `impact({direction:'upstream'})` on: `GET` (the `/api/v1/lawyers` route handler — confirm consumers of the `lawyers[]` shape don't read `phone`/`email`), `PATCH` (the `/api/v1/profile` handler), and `LawyerProfilePage` (the profile page component) before editing.

> **⚠️ Reviewer corrections for §4.2 (apply these):**
>
> - The current /api/v1/lawyers route (route.ts:40-52) sorts via .order('hourly_rate'/'years_experience', {referencedTable:'lawyer_profiles'}). The spec's replacement projection is fine, BUT the spec's rewritten handler DROPS the specialty filter (.contains lawyer_profiles.specialties), the available filter, AND the entire sort switch that currently exists (route.ts:38-53). VERIFIED those exist in current code. -> The remediation must PRESERVE the specialty/available filters and the sort switch; the spec only shows the select+range+map and would regress filtering/sorting if applied literally.
>
> - response shape change. Current route returns {lawyers: data, total: count}. Spec's map returns `row` unchanged (still nested lawyer_profiles array) and re-wraps {lawyers, total: count}. The GitNexus pre-edit note says 'confirm consumers of lawyers[] don't read phone/email' — but the deeper risk is consumers reading lawyers[].lawyer_profiles as an ARRAY vs object; the map does not flatten. -> Confirm the directory UI consumer shape before shipping; the map leaves lawyer_profiles as an array-or-object union which the spec's own code handles inconsistently (Array.isArray check for strip, but returns raw row).
>
> - show_contact is added to the DB + database.ts type + edit form, but the /api/v1/profile PATCH allowlist (route.ts:105-115) does NOT include show_contact. VERIFIED the lawyerFields array has exactly 10 fields ending is_accepting_clients — show_contact is ABSENT. -> The edit form's show_contact toggle will be SILENTLY DROPPED by the PATCH allowlist (server ignores unknown keys). MUST add 'show_contact' to lawyerFields in profile/route.ts or the toggle is a no-op. This is a real correctness bug — the spec's ADR-DONE note claims the PATCH 'already accepts' the dual allowlist but show_contact is a NEW column not yet in it.


---

### §4.3 — Lawyer dashboard bugs — misroute + mojibake + dead links + sync + sidebar
_Effort: 9h · Fix-risk: MED_

#### Lawyer dashboard bugs — misroute, mojibake, dead links, post-add sync, research sidebar
**Finding refs:** LAWYER-3.5, LAWYER-4.1, LAWYER-3.3, LAWYER-3.9, LAWYER-3.14  ·  **Severity:** HIGH (3.5, 4.1) / MED (3.3, 3.9, 3.14)  ·  **Effort:** 9h  ·  **Risk of fix:** MED

---

#### LAWYER-3.5 — "استشارة جديدة" misroutes to a broken consultation-detail page (HIGH)

**Root cause** — `src/app/dashboard/lawyer/page.tsx:368` — the quick-action links to a route that does not exist:
```tsx
{ label: "استشارة جديدة", icon: CalendarCheck, href: "/dashboard/lawyer/consultations/new", shortcut: "C", accent: false },
```
There is no `src/app/dashboard/lawyer/consultations/new/` directory (verified: `ls` → No such file). Next.js App Router therefore matches the dynamic segment `consultations/[id]/page.tsx` with `id = "new"`, which renders `DashboardComingSoon` (`consultations/[id]/page.tsx:13-20`) — the tester saw the red "الاستشارة غير موجودة"/coming-soon dead-end. Meanwhile the real, working booking flow already exists as `BookingModal` inside `consultations/page.tsx:98` and is opened by local `showBooking` state (`consultations/page.tsx:465, 509, 522-526`). The dashboard just points at the wrong place.

**Remediation** — reuse the existing modal by deep-linking with a query param; do not build a new page.

1. Point the quick action at the consultations list with a `book` flag (`page.tsx:368`):
```tsx
{ label: "استشارة جديدة", icon: CalendarCheck, href: "/dashboard/lawyer/consultations?book=1", shortcut: "C", accent: false },
```
2. Make `ConsultationsPage` auto-open `BookingModal` when `?book=1` is present, then strip the param so refresh/back doesn't re-open it. Mirror the existing `showBooking` state (`consultations/page.tsx:465`). Add `useSearchParams`/`useRouter` from `next/navigation` (the page is already `"use client"`):
```tsx
// consultations/page.tsx — imports
import { useSearchParams, useRouter, usePathname } from "next/navigation";

// inside ConsultationsPage(), after existing state
const searchParams = useSearchParams();
const router = useRouter();
const pathname = usePathname();

useEffect(() => {
  if (searchParams.get("book") === "1") {
    setShowBooking(true);
    router.replace(pathname, { scroll: false }); // drop ?book=1
  }
}, [searchParams, pathname, router]);
```
3. `useSearchParams` requires a Suspense boundary in App Router. Because the whole page is already client-rendered under the lawyer dashboard layout, wrap the default export in `<Suspense>` (or split the param-reading into a child). Minimal approach — rename the component to `ConsultationsInner` and add:
```tsx
import { Suspense } from "react";
export default function ConsultationsPage() {
  return <Suspense fallback={null}><ConsultationsInner /></Suspense>;
}
```

**Acceptance criteria**
- [ ] Clicking "استشارة جديدة" on `/dashboard/lawyer` lands on `/dashboard/lawyer/consultations` with the booking modal already open.
- [ ] No navigation to `/dashboard/lawyer/consultations/new`; no "الاستشارة غير موجودة" screen.
- [ ] After the modal opens, the URL is back to `/dashboard/lawyer/consultations` (param stripped); browser refresh does not re-open the modal.
- [ ] `next build` succeeds (no `useSearchParams` Suspense error).

**Verification steps** — dashboard → click "استشارة جديدة" → modal opens; confirm URL bar drops `?book=1`; complete a booking and confirm the new item appears (it already dispatches `nzamy-workflow-updated` at `consultations/page.tsx:140`).

---

#### LAWYER-4.1 — Mojibake Arabic (`ىءورىءور`) in task cards (HIGH)

**Root cause** — Not a corrupted source literal. All in-repo Arabic is clean UTF-8: seed data `tasks/_data.ts` is fine; `TaskCard.tsx:121` renders `{task.title}` verbatim; `VoiceInput.tsx:62-63` passes the transcript through untouched; and the API round-trip does not re-encode — `apiMutate` sends `JSON.stringify(body)` (`src/lib/services/api.ts:53-54`) and `POST /api/v1/lawyer/tasks` stores `title.trim()` and reads it straight back (`route.ts:120-121, 152, 178-180`). The garble is byte-level corruption of already-stored Arabic (UTF-8 interpreted as Windows-1256 / double-encoding) surfacing from production data, plus a missing explicit charset. This is a data-integrity finding: add defense-in-depth on write, sanitize on read, and repair existing rows.

**Remediation**

1. Send an explicit charset on all JSON writes (`src/lib/services/api.ts:53` and the GET header at `:35`):
```tsx
headers: { "Content-Type": "application/json; charset=utf-8" },
```
2. NFC-normalize and strip control/non-character code points from the title server-side before insert (`route.ts`, just before `if (!title || !title.trim())` at line 131). Add a small helper at top of the file:
```ts
// route.ts — normalize + strip C0/C1 controls, BOM, and replacement chars
function cleanArabicText(input: string): string {
  return input
    .normalize("NFC")
    // eslint-disable-next-line no-control-regex
    .replace(/[ --﻿�]/g, "")
    .trim();
}
```
Then apply it:
```ts
const safeTitle = title ? cleanArabicText(title) : "";
if (!safeTitle) {
  return NextResponse.json({ error: "title required" }, { status: 400 });
}
// ...use safeTitle in .insert({ title: safeTitle, ... }) and the response payload
```
Apply the same `cleanArabicText` to `notes`/`caseRef` before they enter `metadata`.
3. Defensive read-side guard so any already-corrupt rows don't render raw — in the GET mapper (`route.ts:86`) and the client mapper (`tasks/page.tsx:87`), normalize on the way out:
```ts
title: cleanArabicText(req.title || "مهمة بدون عنوان"),
```
(export `cleanArabicText` or duplicate a 3-line client copy — keep it identical).
4. One-time data repair migration for existing rows. New file `supabase/migrations/20260705_repair_task_title_mojibake.sql` (mirror the idempotent begin/commit style of the existing `supabase/migrations/*` files):
```sql
BEGIN;

-- Repair NFC + strip control/replacement chars from service_requests titles.
-- Idempotent: re-running normalizes already-clean rows to themselves.
UPDATE public.service_requests
SET title = regexp_replace(
      normalize(title, NFC),
      '[ --﻿�]',
      '',
      'g'
    )
WHERE title IS NOT NULL
  AND title ~ '[ --﻿�]';

COMMIT;
```
> NOTE: `normalize(...)` / `\uXXXX` regex classes require the DB to run a Postgres/ICU build that supports them (Supabase does). If a specific corrupted row is genuine double-encoding (UTF-8→latin1→UTF-8), NFC alone will not fix it; flag such rows for manual review rather than guessing a reverse transcode. Verify on a copy first.

**Files touched (4.1)** — see combined list below.

**Acceptance criteria**
- [ ] New tasks created with Arabic titles (typed and via voice) render correctly in list and Kanban cards.
- [ ] JSON write requests carry `charset=utf-8`.
- [ ] `cleanArabicText` strips BOM/`U+FFFD`/control chars but preserves all Arabic letters, diacritics, and ZWNJ used in shaping (`U+200C/U+200D` are NOT in the stripped range — confirm).
- [ ] Migration runs idempotently and only touches rows matching the corruption regex.

**Verification steps** — create a task titled "صياغة لائحة اعتراضية"; confirm exact glyphs in the card and in the DB row. Insert a deliberately BOM-prefixed title via the API and confirm it is stored clean. Re-run the migration twice; second run updates 0 rows.

---

#### LAWYER-3.3 — Header "نشر في السوق" + banner "ترقية الباقة" go to the wrong destinations (MED)

**Root cause** — Both are already `<Link>` (not truly dead) but semantically misrouted:
- `src/app/dashboard/lawyer/page.tsx:258` — "نشر في السوق" → `href="/dashboard/lawyer/profile"` (generic profile), not the marketplace. A dedicated marketplace page exists: `marketplace/page.tsx:3` → `<MyMarketplaceDashboard userType="lawyer" />`.
- `src/app/dashboard/lawyer/page.tsx:300-305` — "ترقية الباقة" → `href="/dashboard/lawyer/finance"`, which is an invoices/wallet dashboard (`finance/page.tsx:19`, tabs = overview/invoices/expenses), NOT a plan-upgrade view. Canonical pricing route is `/pricing`; an inline `UpgradeModal` also exists (`src/components/UpgradeModal.tsx:98`, props `{ open, onClose, featureBlocked }`).

**Remediation**

1. Repoint the marketplace CTA (`page.tsx:258`):
```tsx
<Link href="/dashboard/lawyer/marketplace"
  className={/* unchanged classes */}>
  <Storefront size={16} weight="duotone" /> نشر في السوق
</Link>
```
2. Repoint the upgrade CTA. Preferred UX: open the inline `UpgradeModal` (no context loss). Add state near the other `useState`s (`page.tsx:84`):
```tsx
const [showUpgrade, setShowUpgrade] = useState(false);
```
Convert the banner `<Link>` (`page.tsx:300-305`) to a button:
```tsx
<button
  onClick={() => setShowUpgrade(true)}
  className="shrink-0 flex items-center gap-1.5 rounded-xl bg-[#0B3D2E] px-4 py-2 text-xs font-bold text-[#C8A762] hover:bg-[#155e41] transition-colors">
  ترقية الباقة <ArrowRight size={12} />
</button>
```
Render it in the Modals block (`page.tsx:767`):
```tsx
import UpgradeModal from "@/components/UpgradeModal";
// ...
{showUpgrade && <UpgradeModal open={showUpgrade} onClose={() => setShowUpgrade(false)} />}
```
(If the product prefers a full page over a modal, use `href="/pricing"` instead — but confirm `UpgradeModal`'s `PLAN_MAP` covers the lawyer tiers first.)

**Acceptance criteria**
- [ ] "نشر في السوق" opens `/dashboard/lawyer/marketplace` (MyMarketplaceDashboard).
- [ ] "ترقية الباقة" opens the UpgradeModal (or `/pricing`), never the invoices page.
- [ ] No console/router error; both controls keyboard-focusable.

**Verification steps** — click each; confirm destination and that back button returns to the dashboard cleanly.

---

#### LAWYER-3.9 — Board doesn't refresh after adding a case/task (MED)

**Root cause** — `src/app/dashboard/lawyer/page.tsx:90-97` fetches `getLawyerDashboardSummary()` once inside `useEffect(..., [])` and never re-fetches. The add modals already broadcast the refresh event — `AddCaseModal.tsx:73` and `AddTaskModal`/tasks flow dispatch `new CustomEvent("nzamy-workflow-updated")` — but the dashboard has **no listener**, so `dashboardData` (and the derived `stats`, `recentCases`, `activityTimeline`) never updates. Additionally `AddCaseModal` accepts a `user` prop (`AddCaseModal.tsx:10-15`) that the dashboard does not pass (`page.tsx:768`), so the created request's requester is a placeholder.

**Remediation**

1. Extract the fetch into a reusable callback and subscribe to the event (`page.tsx:89-97`):
```tsx
const loadSummary = useCallback(() => {
  getLawyerDashboardSummary()
    .then((data) => { setDashboardData(data); setLoading(false); })
    .catch(() => setLoading(false));
}, []);

useEffect(() => {
  loadSummary();
  const handler = () => loadSummary();
  window.addEventListener("nzamy-workflow-updated", handler);
  return () => window.removeEventListener("nzamy-workflow-updated", handler);
}, [loadSummary]);
```
(Add `useCallback` to the `react` import at `page.tsx:3`.)
2. Pass the real user context into `AddCaseModal` (`page.tsx:768`). Destructure the fields it needs from `useUser()` (already imported, `page.tsx:81`):
```tsx
{showAddCase && (
  <AddCaseModal
    onClose={() => setShowAddCase(false)}
    isDark={isDark}
    user={{ userId, name, userType, tier: userTier }}
  />
)}
```
Add the missing fields to the destructure at `page.tsx:81`: `const { userId, name, userType, tier: userTier } = useUser();`.
3. (Optional, tighter UX) also call `loadSummary()` in the modal `onClose` so the refresh happens even if the event is missed.

**Acceptance criteria**
- [ ] Adding a case via the dashboard modal updates "القضايا النشطة" KPI and the recent-cases list without a manual page reload.
- [ ] The listener is removed on unmount (no leak / duplicate fetch).
- [ ] Created case's requester reflects the logged-in lawyer, not a placeholder.

**Verification steps** — note the active-cases count → add a case → confirm the count and recent list update immediately; check network tab shows exactly one extra `summary` fetch per add.

---

#### LAWYER-3.14 — Sidebar disappears on the research collector page (MED)

**Root cause** — The "المجمّع البحثي" sidebar entry points to `/ai/collector` (`src/constants/navigation.sidebars.legal.ts:35,273`), and the page renders inside `src/app/ai/layout.tsx`, which chooses the dashboard sidebar **only** from `user.userType` (steps 1), path prefix (step 2), or the `nzamy_last_dashboard` localStorage stamp (step 3), falling back to Business (step 4). `/ai/collector` has no `/ai/lawyer/` path prefix, so when a lawyer opens it in a **fresh session / new tab / hard navigation** where `user.userType` is not yet resolved and the `nzamy_last_dashboard` stamp is unset (the stamp is only written on mount of a dashboard layout — `lawyer/layout.tsx:17-19`), the layout resolves to a wrong/empty sidebar and the lawyer nav vanishes. (`/ai/collector` itself has no local layout — verified no `ai/collector/layout.tsx`.)

**Remediation** — make the layout resolution deterministic for the collector and add a path hint so a lawyer AI tool never falls through to Business.

1. Add an explicit path-based hint for lawyer-only AI tools in `ai/layout.tsx` step 2 (after the existing `/ai/corp`, `/ai/gov` blocks, ~`:76-93`). The collector and other legal tools are lawyer-facing:
```tsx
// Lawyer-facing AI tools (collector, draft, brief-check, contracts, ...) → lawyer sidebar
const LAWYER_AI_PREFIXES = ["/ai/collector", "/ai/draft", "/ai/brief-check", "/ai/contracts"];
if (LAWYER_AI_PREFIXES.some(p => pathname === p || pathname.startsWith(p + "/"))) {
  return <LawyerDashboardLayout>{children}</LawyerDashboardLayout>;
}
```
> This is a targeted, low-risk hint that only fires when the session is otherwise unresolved (session-based checks at step 1 still win for non-lawyer roles who somehow reach these routes). Confirm the prefix list against the lawyer catalog before finalizing so a shared tool (e.g. `/ai/legal-opinion`, used by multiple roles) is NOT added here.

2. Belt-and-braces: keep the `nzamy_last_dashboard` step-3 branch (already present, `:103-105`). No change needed there; step-2 hint covers the fresh-session gap.

**Acceptance criteria**
- [ ] Opening `/ai/collector` directly (new tab, no prior dashboard visit) as a lawyer shows the lawyer SharedSidebar.
- [ ] Clicking "المجمّع البحثي" from the lawyer sidebar keeps the sidebar visible.
- [ ] Non-lawyer roles are unaffected (session check at step 1 still governs).

**Verification steps** — cold-open `/ai/collector` in a fresh incognito lawyer session → sidebar present. Navigate from the lawyer dashboard → sidebar persists. Repeat as a corporate user on a corporate AI tool → business sidebar still correct.

---

**Files touched**
- `src/app/dashboard/lawyer/page.tsx` (3.5 href, 3.3 marketplace/upgrade CTAs, 3.9 refetch + user prop)
- `src/app/dashboard/lawyer/consultations/page.tsx` (3.5 `?book=1` auto-open + Suspense)
- `src/app/api/v1/lawyer/tasks/route.ts` (4.1 `cleanArabicText` on POST/GET)
- `src/lib/services/api.ts` (4.1 `charset=utf-8` on GET+mutate)
- `src/app/dashboard/lawyer/tasks/page.tsx` (4.1 read-side normalize)
- `src/components/UpgradeModal.tsx` (3.3 — import only; no edit unless plan map needs lawyer tiers)
- `src/app/ai/layout.tsx` (3.14 lawyer AI path hint)
- `supabase/migrations/20260705_repair_task_title_mojibake.sql` (4.1 one-time repair)

**Ordering / dependencies**
- 4.1: ship the write-side hardening (`cleanArabicText` + charset) **before** running the repair migration, so newly created rows stay clean while the backfill runs. The migration touches `service_requests.title` — verify no RLS blocks the migration (it runs as the migration/service role, so RLS is bypassed; no policy change needed). No new columns.
- 3.9 depends on the existing `nzamy-workflow-updated` event bus (already emitted by `AddCaseModal.tsx:73` and the tasks flow from the n8n-glue work). No RLS impact — read-only summary refetch.
- 3.5, 3.3, 3.14 are pure client-routing/layout changes: no DB, no RLS.
- Do 3.14's path-hint change independently of the others (isolated to `ai/layout.tsx`) to keep its regression surface (all `/ai/*` routes) reviewable on its own.

**GitNexus pre-edit** — run `impact({direction:'upstream'})` on: `getLawyerDashboardSummary`, `apiMutate`, `apiGet` (shared by every dashboard — high blast radius; the charset change is behavior-neutral but confirm no consumer asserts exact header string), `AILayout` (wraps all `/ai/*` pages), `AddCaseModal`, the tasks `POST` handler. Treat `apiGet`/`apiMutate` and `AILayout` as the highest-risk symbols and re-run `detect_changes()` before commit.

> **⚠️ Reviewer corrections for §4.3 (apply these):**
>
> - proposed LAWYER_AI_PREFIXES = ['/ai/collector','/ai/draft','/ai/brief-check','/ai/contracts']. VERIFIED /ai/draft AND /ai/contracts appear in navigation.sidebars.business.ts (draft?mode=report/minutes/reply at :135-137; /ai/contracts gateKey ngo-ai at :241) — they are SHARED tools, not lawyer-only. -> A fresh-session NGO/business user hitting /ai/draft or /ai/contracts would be force-routed to the LAWYER sidebar by this hint, a NEW misroute. The spec's own warning says to confirm the list — the correct fix is to include ONLY genuinely lawyer-exclusive routes (/ai/collector, /ai/brief-check) and DROP /ai/draft and /ai/contracts from the prefix list.
>
> - the cleanArabicText and SQL regex use a literal character-class range that renders as garbled control chars in the spec ('[ --﻿�]'). VERIFIED intent is C0/C1 + BOM + U+FFFD. -> The literal as pasted is unreliable across editors/encodings; specify the range with explicit \u escapes (JS) and chr()/U&'' escapes (Postgres) so the class is unambiguous. Also the acceptance criterion requires ZWNJ/ZWJ (U+200C/200D) be PRESERVED — confirm the range's upper bound does not include U+200C-200D (a range up to U+206F WOULD strip them). This is a correctness hazard for Arabic shaping.


---

### §4.4 — AI tools fabricate output — honest gating (KN-1/LIB-11/LIB-23/LIB-25) + real subscription cards (AI-3.2/AI-3.1)
_Effort: 7h · Fix-risk: LOW_

#### Honestly gate fabricating AI pages via BetaReviewGate + wire subscription cards to real state
**Finding refs:** KN-1, LIB-11, LIB-23, LIB-25, LIB-KN-1, AI-3.2, AI-3.1  ·  **Severity:** HIGH (fabrication) / MED (subscription cards)  ·  **Effort:** 7h  ·  **Risk of fix:** LOW

**Recommendation: Option (b) — honest gate, NOT wire-to-n8n now.** The honest-gating mechanism already exists and is the project's sanctioned pattern (`src/components/BetaReviewGate.tsx`). It flips on `BETA_REVIEW_MODE` (`src/lib/betaConfig.ts:40` = `true`), and **three of the eight flagged pages already use it** with `toolId`s already registered in `LEGAL_DATA_REVIEW_GATED_TOOLS`:
- `analyze/_components/SmartAnalyzer.tsx:226` → `analyze.smart.result` (registered `betaConfig.ts:131`)
- `brief-check/page.tsx:171` → `brief-check.result` (registered `betaConfig.ts:133`)
- `case-brief/page.tsx:331` → `case-brief.result` (registered `betaConfig.ts:132`)

So `ai/analyze`, `brief-check`, `case-brief` (LIB-23, part of LIB-25) are **already honest under the existing gate** — the reconciliation flagged them because the QA tester hit *live prod* (pre-a5b10c3) and the sweep never checked for the wrapper. **The genuine gap is five ungated pages.** Wiring 8 bespoke n8n webhooks now (option a) is far more effort and defers behind §7.8 n8n workflows that don't exist yet; the gate is the same guarantee (no fabricated legal output reaches a user) at a fraction of the cost, and is trivially removed per-tool when the real n8n flow lands (each registry entry already carries a `teardown` note).

**Root cause** — five result surfaces render canned output behind a `setTimeout`, with NO `BetaReviewGate` wrapper (unlike their three sibling pages):

1. `src/app/ai/consult/page.tsx:200-210` — `consult.result` IS registered (`betaConfig.ts:135`) but the page never imports the gate:
```tsx
await new Promise(r => setTimeout(r, 1800));
const { text: aiText, sources } = getMockResponse(q);   // line 54 hardcoded Arabic
const aiMsg: Message = { id: ..., role: "ai", text: aiText, time: now(), sources };
setMessages(prev => [...prev, aiMsg]);
```
2. `src/app/ai/assistant/page.tsx:365-376` — not registered, not gated:
```tsx
await new Promise(r => setTimeout(r, 1800 + Math.random() * 1000));
const { content: respContent, sources } = getMockResponse(content, context); // line 52
```
3. `src/app/ai/analyze-strength/page.tsx:46-52` — `analyze()` flips `analyzed=true` after a timer; the whole `analyzed` branch renders static `ANALYSIS`/`OPPONENT_MOVES`/`RISKS_MATRIX`/`DEVIL_ADVOCATE` imports from `./data` (lines 262-547). Not registered, not gated.
4. `src/app/ai/communicate/page.tsx:62-69` — outputs the module-level `MOCK_LETTER` constant (line 26):
```tsx
await new Promise(r => setTimeout(r, 2000));
setOutput(MOCK_LETTER);
```
5. `src/app/ai/compare/_result-view.tsx:22-32,140-151` — renders `MOCK_DIFFS`/`MOCK_ISSUES` and a hardcoded Arabic verdict ("المستند ب أضعف قانونياً…"). Not registered, not gated.

For **AI-3.2**: `src/app/settings/components/tabs/SubscriptionTab.tsx:19-103` `getPlanData(userType)` returns hardcoded `name/price/renewal/usage` per user type (e.g. lawyer "٧٤٠/١٠٠٠ نقطة", firm "٣٦,٠٠٠ ر.س"), and invoices (`:112-116`) are fabricated from `plan.price`. It renders `<BackendReadyNotice/>` (`:120`) so it is *disclaimed*, but the numbers are invented. `/api/v1/profile` GET (`src/app/api/v1/profile/route.ts:57-65`) **already returns** `subscription` with a joined `subscription_plans(*)` — the real state exists and is unused here.

**Remediation**

**Part A — register the two missing toolIds** in `src/lib/betaConfig.ts` (append to `LEGAL_DATA_REVIEW_GATED_TOOLS`, mirroring existing entries like `consult.result` at `:135`):
```ts
{ id: "assistant.result", route: "/ai/assistant", label: "AI legal assistant answer", risk: "rag", teardown: "Remove the message-level BetaReviewGate wrapper from assistant page after assistant citations are production-verified." },
{ id: "analyze-strength.result", route: "/ai/analyze-strength", label: "Case strength and opponent analysis", risk: "legal-data", teardown: "Remove the result BetaReviewGate wrapper after strength-analysis QA is live." },
{ id: "communicate.result", route: "/ai/communicate", label: "Legal communication drafting", risk: "legal-data", teardown: "Remove the output BetaReviewGate wrapper after communication drafting QA is live." },
{ id: "compare.result", route: "/ai/compare", label: "Document comparison legal verdict", risk: "legal-data", teardown: "Remove the ResultView BetaReviewGate wrapper after compare-verdict QA is live." },
```
(`consult.result` is already present — no change there.)

**Part B — wrap each of the five result surfaces.** Mirror `brief-check/page.tsx:171` exactly (`reviewScope="legal-data"` forces the gate for ALL users during beta, per `BetaReviewGate.tsx:80-83`, so client-facing consult/assistant/communicate/compare are covered even though the `BETA_GATED_ROLES` list is lawyer/firm-only).

*consult/page.tsx* — this is a chat stream, so gate the AI bubble at render, not the send. Add import and wrap the AI bubble body. Simplest faithful edit: wrap the AI branch inside `AIMessageBubble` — but to avoid touching that shared component, instead gate at the message map (`:280-287`). Replace the `<AIMessageBubble/>` call for `role==="ai"` messages:
```tsx
// top of file:
import BetaReviewGate from "@/components/BetaReviewGate";
// in the messages.map (line ~281):
msg.role === "ai" ? (
  <BetaReviewGate key={msg.id} toolId="consult.result" toolName="الاستشارة القانونية الذكية" reviewScope="legal-data">
    <AIMessageBubble msg={msg} isDark={isDark} isLatest={i === messages.length - 1 && msg.role === "ai"} />
  </BetaReviewGate>
) : (
  <AIMessageBubble key={msg.id} msg={msg} isDark={isDark} isLatest={false} />
)
```
Also drop the misleading "متصل" (connected) header pill at `:234-236` to plain "وضع المراجعة" to avoid a live-connection claim.

*assistant/page.tsx* — same chat pattern; wrap non-thinking assistant bubbles in the map (`:480`):
```tsx
import BetaReviewGate from "@/components/BetaReviewGate";
// :480
messages.map(msg =>
  msg.role === "assistant" && !msg.thinking ? (
    <BetaReviewGate key={msg.id} toolId="assistant.result" toolName="نظامي أسيستنت" reviewScope="legal-data">
      <MessageBubble msg={msg} isDark={isDark} />
    </BetaReviewGate>
  ) : <MessageBubble key={msg.id} msg={msg} isDark={isDark} />
)
```

*analyze-strength/page.tsx* — wrap the entire `analyzed` result block. The block is the `) : (` branch opening at `:262` and closing at `:547`. Import the gate and wrap that block's inner `<div className="space-y-5">` (`:263`):
```tsx
import BetaReviewGate from "@/components/BetaReviewGate";
// replace <div className="space-y-5"> at :263 with:
<BetaReviewGate toolId="analyze-strength.result" toolName="محلل الموقف والخصم" reviewScope="legal-data">
  <div className="space-y-5">
    {/* …existing tabs/result… */}
  </div>
</BetaReviewGate>
```

*communicate/page.tsx* — wrap the output render branch (`:186-198`, the `<>…</>` that shows `<pre>{output}</pre>` + `AiResultActions`):
```tsx
import BetaReviewGate from "@/components/BetaReviewGate";
// wrap the final ": (" branch content (:186):
<BetaReviewGate toolId="communicate.result" toolName="المتحدث الذكي" reviewScope="legal-data">
  <div className={`rounded-2xl p-5 ...`}><pre ...>{output}</pre></div>
  <AiResultActions text={output ?? ""} filename={`communicate-${commType}`} showVault showHumanReview className="justify-start mt-2" />
</BetaReviewGate>
```

*compare/_result-view.tsx* — wrap the whole returned `<motion.div>` body (`:42`). Import gate, add wrapper just inside the outer motion.div so scores/tabs/verdict are all hidden:
```tsx
import BetaReviewGate from "@/components/BetaReviewGate";
return (
  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
    <BetaReviewGate toolId="compare.result" toolName="المقارنة الذكية للمستندات" reviewScope="legal-data">
      {/* …existing scores row through verdict tab… */}
    </BetaReviewGate>
  </motion.div>
);
```

No migration needed for Part A/B — purely client wrappers over an existing config.

**Part C — AI-3.2 subscription cards → real state.** Drive `SubscriptionTab` from `/api/v1/profile`. Add a fetch, keep `getPlanData` only as a *labels/defaults* fallback, and render a locked state when `subscription` is null.
```tsx
// SubscriptionTab.tsx — add:
import { useEffect, useState } from "react";
interface ApiSubscription {
  status: string; current_period_end: string | null;
  subscription_plans: { name_ar?: string; name?: string; price?: number; billing_cycle?: string;
    limits?: Record<string, number> } | null;
  usage?: Record<string, number>;
}
// inside component:
const [sub, setSub] = useState<ApiSubscription | null>(null);
const [loaded, setLoaded] = useState(false);
useEffect(() => {
  fetch("/api/v1/profile").then(r => r.ok ? r.json() : null)
    .then(d => setSub(d?.subscription ?? null)).catch(() => {}).finally(() => setLoaded(true));
}, []);
```
Render logic:
1. `!loaded` → show a skeleton (reuse the pulse pattern from `analyze/_components/SmartAnalyzer.tsx:105-115`).
2. `loaded && !sub` → **locked/no-subscription state**: render `<DashboardComingSoon title="لا يوجد اشتراك نشط" description="لم يتم ربط باقة فعّالة بحسابك بعد. فعّل باقة لعرض تفاصيل الاستخدام والفواتير." />` (import from `@/components/ui/DashboardComingSoon`) — honest, no invented numbers.
3. `loaded && sub` → build the card from `sub.subscription_plans` (name/price/cycle) and `sub.current_period_end` (renewal). Build usage meters from `sub.usage` × `sub.subscription_plans.limits` when present; if `usage` is absent, **omit the usage block entirely** (do NOT fall back to hardcoded numbers — that's the exact defect). Keep `<BackendReadyNotice/>` only for the still-mock invoices, or replace invoices with the locked state until a billing endpoint exists.

Since the real `subscription_plans` column names are backend-defined, gate each field access with optional chaining and Arabic-label fallbacks from the existing `getPlanData(userType)` (keep the function purely as static UI labels — never as usage source of truth). Guarding on `sub.subscription_plans?.name ?? getPlanData(userType).name` keeps the card populated while making usage strictly real-or-absent.

**Files touched**
- `src/lib/betaConfig.ts` (register 4 toolIds: assistant/analyze-strength/communicate/compare; consult already present)
- `src/app/ai/consult/page.tsx`
- `src/app/ai/assistant/page.tsx`
- `src/app/ai/analyze-strength/page.tsx`
- `src/app/ai/communicate/page.tsx`
- `src/app/ai/compare/_result-view.tsx`
- `src/app/settings/components/tabs/SubscriptionTab.tsx`
- (no new migration)

**Acceptance criteria**
- [ ] With `BETA_REVIEW_MODE = true`, none of consult/assistant/analyze-strength/communicate/compare renders fabricated legal text to a normal user — each shows the "تم إعداد … / إرسال للمراجعة الذكية" overlay (`BetaReviewGate`).
- [ ] `analyze`, `brief-check`, `case-brief` remain gated (regression: unchanged, still wrapped).
- [ ] Every `toolId` passed to a `BetaReviewGate` exists in `LEGAL_DATA_REVIEW_GATED_TOOL_IDS` (grep each id against `betaConfig.ts`).
- [ ] Demo-bypass sessions (`user.isDemoBypass`, `BetaReviewGate.tsx:89`) still see raw output — internal preview preserved.
- [ ] `SubscriptionTab` with no active subscription shows the locked "لا يوجد اشتراك نشط" state, NOT hardcoded usage bars.
- [ ] `SubscriptionTab` with an active subscription shows plan name/price/renewal from `/api/v1/profile`; usage meters appear ONLY when real usage data is present.
- [ ] No hardcoded number from `getPlanData` (e.g. "٧٤٠", "٣٦,٠٠٠", "٦٢٠٠") renders when the API returns a real subscription without usage.

**Verification steps**
1. `grep -rn "BetaReviewGate" src/app/ai/consult src/app/ai/assistant src/app/ai/analyze-strength src/app/ai/communicate src/app/ai/compare` → 5 hits.
2. Run each page in a browser as a non-demo user; submit → confirm the review-overlay card, not canned Arabic legal text.
3. Temporarily set `BETA_REVIEW_MODE = false` → confirm children render (proves zero-side-effect teardown path) then revert.
4. `npx tsc --noEmit` + `npm run lint` clean.
5. For subscription: (a) mock `/api/v1/profile` returning `subscription: null` → locked state; (b) returning a `subscription` with `subscription_plans` but no `usage` → card populated, no usage bars; (c) with `usage` → real meters.
6. `detect_changes()` before commit — expect only the 7 files above; no service-layer or migration drift.

**Ordering / dependencies**
- Part A (register toolIds) MUST land before/with Part B (a `toolId` not in the registry with `reviewScope="legal-data"` still gates — the registry only adds the id-based path — but registering keeps teardown discoverable and matches the sibling pattern; do them together).
- Part C is independent of A/B. It reads `/api/v1/profile` GET which already joins `subscriptions → subscription_plans` under existing RLS (`subscriptions` is `.eq("user_id", user.id)` + `status="active"`, so RLS on `subscriptions` must allow self-select — already relied on by the profile route; no new RLS). No writes, no policy changes.
- No interaction with the §7.8 n8n flip (server-side `service_request.*` events only) — this spec is intentionally decoupled from it.

**GitNexus pre-edit** — run `impact({direction:'upstream'})` on: `BetaReviewGate` (component — confirms no prop-shape break for the 3 existing callers), `LEGAL_DATA_REVIEW_GATED_TOOLS` / `LEGAL_DATA_REVIEW_GATED_TOOL_IDS` (betaConfig consumers), `getPlanData` and `SubscriptionTab` (settings consumers), and `getMockResponse` (consult + assistant — verify no other importer before leaving the mock generators in place as dead-until-teardown code).

> **⚠️ Reviewer corrections for §4.4 (apply these):**
>
> - SubscriptionTab reads /api/v1/profile GET which returns subscription with subscription_plans(*). VERIFIED (profile/route.ts:58-60 selects '*, subscription_plans(*)' on subscriptions eq user_id). Correct. But the spec's ApiSubscription type assumes subscription_plans has name_ar/limits — the actual subscription_plans(*) columns are unverified here; the spec correctly gates with optional chaining, so this is safe. No correction, just confirm column names before rendering price/cycle to avoid showing undefined.


---

### §4.5 — Library book/reference detail bugs (LIB-19.1, LIB-19.2, LIB-19.3)
_Effort: 10h · Fix-risk: MED_

#### Fix library book reader: DB-backed slugs, hydration crash, and شرعي/وضعي mislabel
**Finding refs:** LIB-19.1, LIB-19.3, LIB-19.2  ·  **Severity:** HIGH (19.1/19.3), MED (19.2)  ·  **Effort:** 10h  ·  **Risk of fix:** MED

**Root cause**

There are three distinct defects. All three trace to a shape mismatch between the API and the client interface plus an unseeded table.

1. **LIB-19.1 — two-slug hardcode.** `src/app/book/[slug]/page.tsx:223-242`. The API is tried first, but when the `library.feqh_books` table is empty every slug 404s, and the fallback only knows two slugs:
```tsx
// page.tsx:223-242
if (slug === "rawd-al-murbi") {
  setBook(DEMO_RAWD);
  ...
} else if (slug === "sources-of-right-1") {
  const data = await import("@/constants/sources-of-right-1.json");
  ...
} else {
  setLoading(false);          // ← any other slug: book stays null → not-found block 258-268
}
```
The not-found block at `page.tsx:258-268` then renders «عفواً، الكتاب غير موجود». So the root cause is (a) an unseeded `feqh_books` table and (b) a fallback that only covers 2 slugs.

2. **LIB-19.3 — "This page couldn't load" render crash.** The API *does* return data for a seeded book, but its shape does not match the `FeqhBookSystem` the reader consumes. The API (`src/app/api/library/books/[slug]/route.ts:90-148`) returns a **flat top-level `blocks[]`** and `chapters[].sections[]` **without** `blocks`:
```ts
// route.ts:101-134 — chapters carry sections but NO blocks; blocks are a sibling flat array
chapters: (chapters||[]).map(ch => ({ id, title, volumeNumber, sections: [{ id, title }] })),
blocks: (blocks||[]).map(b => ({ id, topic, vol, page, matn, sharh, hashiyah, sectionId, locked })),
```
But the client interface (`src/app/laws/data.ts:103-122`) is nested and has no `blocks` at book level:
```ts
export interface FeqhSection { title: string; blocks: FeqhBlock[]; }
export interface FeqhChapter { title: string; sections: FeqhSection[]; }
export interface FeqhBookSystem { id; title; author; school; investigator; publisher; totalVolumes; chapters: FeqhChapter[]; }
```
The reader then does, at `page.tsx:212`:
```tsx
if (apiData.chapters?.[0]?.sections?.[0]?.blocks?.[0]) {  // sections[0].blocks is undefined → guard passes as false, activeBlockId never set
```
and unconditionally at `page.tsx:289` / `276-286` walks `sec.blocks.find(...)` where `sec.blocks` is `undefined` → **`TypeError: Cannot read properties of undefined (reading 'find')`** during render = the hydration/render crash. `apiData.publisher` is also `undefined` (API never returns `publisher`; DB has no such column) which surfaces later in `handleCopyCitation`/IdentityPanel. The reader is `"use client"` with **no `error.tsx` boundary** in `src/app/book/[slug]/`, so the crash bubbles to the Next.js default error screen.

3. **LIB-19.2 — شرعي/وضعي mislabel.** The type badge is NOT on the detail page — it is on the listing card, `src/app/laws/components/FeqhTabContent.tsx:249-253` and `321`, driven by `book.type`. `book.type` is computed in `src/app/laws/page.tsx:435-497` by keyword auto-detection:
```tsx
// laws/page.tsx:437,444-480
let type = b.type || "sharia";
if (title.includes("كشاف القناع") || title.includes("الروض المربع") || title.includes("زاد المستقنع")
    || title.includes("المغني") || title.includes("المقنع")) { type = "sharia"; ... }
...
} else { /* defaults — trusts b.type */ }
```
`منتهى الإرادات` (a Hanbali fiqh matn, `sharia`) matches **none** of the keyword branches, so it falls to the `else` default and shows whatever `b.type` the DB row holds — which for the tester's seed was `wadi`/wrong → «قانوني وضعي». The DB `CHECK` constraint (`20260626_legal_library_schema.sql:362`) only allows `('sharia','comparative','wadi')`, confirming type is a stored enum that must be seeded correctly, and the keyword map is the client-side safety net that currently omits several sharia matns.

**Remediation**

1. **Fix the API↔client shape mismatch by nesting blocks into sections in the route** (single source of truth; the reader already expects nesting). Edit `src/app/api/library/books/[slug]/route.ts`. Add `publisher` handling (DB has none → surface investigator/`—`) and fold `blocks` into their `section`:
```ts
// route.ts — replace the response builder (lines 90-148)
// Build a sectionId → blocks[] map first
const blocksBySection = new Map<string, any[]>();
for (const b of (blocks || []) as Record<string, unknown>[]) {
  const sid = b.section_id as string;
  const isLocked = !hasFullAccess && freeLimit !== -1 && (b.order_index as number) >= freeLimit;
  const arr = blocksBySection.get(sid) || [];
  arr.push({
    id: b.id,
    topic: b.topic ?? '',
    vol: (b.volume_number as number) ?? 1,
    page: (b.page_number as number) ?? 0,
    matn: isLocked && typeof b.matn === 'string' ? b.matn.substring(0, 100) + (b.matn.length > 100 ? '…' : '') : (b.matn ?? ''),
    sharh: isLocked && typeof b.sharh === 'string' ? b.sharh.substring(0, 100) + (b.sharh.length > 100 ? '…' : '') : (b.sharh ?? ''),
    // hashiyah is jsonb; the client interface types it string[] — coerce defensively
    hashiyah: isLocked ? [] : (Array.isArray(b.hashiyah) ? b.hashiyah : []),
    locked: isLocked,
    order_index: b.order_index,
  });
  blocksBySection.set(sid, arr);
}

const response = {
  id: book.id,
  title: book.title ?? '',
  author: book.author ?? '—',
  school: book.school ?? '',
  type: book.type ?? 'sharia',               // ← expose real DB type for detail-side use
  category: book.category ?? '',
  investigator: book.investigator ?? '',
  publisher: book.investigator ?? '—',       // DB has no publisher col; use investigator so citations render
  totalVolumes: book.total_volumes ?? 1,
  totalPages: book.total_pages ?? 0,
  chapters: (chapters || [])
    .sort((a: any, b: any) => (a.order_index as number) - (b.order_index as number))
    .map((ch: Record<string, unknown>) => {
      const sections = (ch.feqh_sections as Record<string, unknown>[]) || [];
      return {
        title: ch.title ?? '',
        sections: sections
          .sort((a, b) => (a.order_index as number) - (b.order_index as number))
          .map((s) => ({
            title: s.title ?? '',
            blocks: (blocksBySection.get(s.id as string) || [])
              .sort((a, b) => (a.order_index as number) - (b.order_index as number)),
          })),
      };
    }),
  paywall: { isWhitelisted, freeLimit, hasFullAccess, totalItems: totalBlocks || 0 },
  hasAccess: hasFullAccess,
  pagination: { page, limit, total: totalBlocks || 0, totalPages: Math.ceil((totalBlocks || 0) / limit) },
};
```
Note: paywall gating logic (order_index-based `isLocked`) is preserved verbatim — do not regress the a5b10c3 paywall fix. This mirrors the DEMO_RAWD nested literal already in `page.tsx:51-96`, so the client needs no interface change.

2. **Harden the reader against undefined nesting + set active block correctly.** Edit `src/app/book/[slug]/page.tsx`. Replace the API success handler (`page.tsx:209-217`) and add null-guards:
```tsx
// page.tsx:209-217 — pick first block defensively (works for both nested-API and demo shapes)
if (res.ok) {
  const apiData = await res.json();
  setBook(apiData as FeqhBookSystem);
  const firstBlock = apiData?.chapters?.[0]?.sections?.[0]?.blocks?.[0];
  if (firstBlock?.id) setActiveBlockId(firstBlock.id);
  setLoading(false);
  return;
}
```
Guard every `sec.blocks` walk (`page.tsx:276-292`):
```tsx
// page.tsx:276-292
for (const ch of book.chapters ?? []) {
  for (const sec of ch.sections ?? []) {
    const found = (sec.blocks ?? []).find(b => b.id === activeBlockId);
    if (found) { activeBlock = found; activeChapterTitle = ch.title; break; }
  }
  if (activeBlock) break;
}
if (!activeBlock && book.chapters?.[0]?.sections?.[0]?.blocks?.[0]) {
  activeBlock = book.chapters[0].sections[0].blocks[0];
  activeChapterTitle = book.chapters[0].title;
}
```
Also guard `filteredChapters` (`page.tsx:135-146`) with `(sec.blocks ?? [])` and `handleQuickJump` (`page.tsx:167`) with `(sec.blocks ?? [])`.

3. **Add a route-level error boundary** so any residual render error degrades gracefully instead of the raw Next crash. Create `src/app/book/[slug]/error.tsx`, mirroring the not-found block styling from `page.tsx:258-270`:
```tsx
"use client";
import Link from "next/link";
import { useEffect } from "react";
export default function BookError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => { console.error("[BookReader] render error:", error); }, [error]);
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-gray-50 dark:bg-[#0c0f12] text-gray-900 dark:text-white" dir="rtl">
      <h1 className="text-xl font-black mb-2">تعذّر عرض الكتاب</h1>
      <p className="text-xs text-slate-500 dark:text-zinc-400 mb-4">حدث خطأ أثناء تحميل هذا المرجع. حاول مرة أخرى.</p>
      <div className="flex gap-2">
        <button onClick={reset} className="px-4 py-2 bg-[#0B3D2E] text-white text-xs font-bold rounded-xl">إعادة المحاولة</button>
        <Link href="/laws" className="px-4 py-2 border text-xs font-bold rounded-xl">العودة للمكتبة</Link>
      </div>
    </div>
  );
}
```

4. **Fix the شرعي/وضعي type detection.** In `src/app/laws/page.tsx:444`, extend the sharia keyword branch to cover the missing Hanbali/fiqh matns and make DB `type` authoritative when present (only auto-detect when `b.type` is null):
```tsx
// laws/page.tsx — replace line 437 and the sharia branch condition at 444
let type = b.type || "";                      // do NOT default to sharia yet
const title = b.title || "";
const detectOnly = !b.type;                    // trust explicit DB type; auto-detect only when absent
// ...
if (detectOnly && (title.includes("كشاف القناع") || title.includes("الشرح الكبير")
    || title.includes("الروض المربع") || title.includes("زاد المستقنع") || title.includes("المغني")
    || title.includes("المقنع") || title.includes("منتهى الإرادات") || title.includes("منتهى الارادات")
    || title.includes("دليل الطالب") || title.includes("أخصر المختصرات") || title.includes("عمدة الفقه"))) {
  type = "sharia"; /* ...existing category logic... */
}
// at the final else default (line 468), if type is still empty fall back to 'sharia'
type = type || "sharia";
```
This makes explicit DB `type` win (so a correctly-seeded row is never overridden) while the keyword net now catches منتهى الإرادات and siblings when the DB type is missing.

5. **Correct the seed.** The tester's منتهى الإرادات row had the wrong `type`. Add a dated idempotent migration under `supabase/migrations/` that upserts the canonical fiqh matns with correct `type`, mirroring the begin/commit + `on conflict do update` idioms of `20260626_legal_library_schema.sql`. File `supabase/migrations/20260706_feqh_books_type_correction.sql`:
```sql
-- Correct feqh_books.type mislabels (LIB-19.2). Idempotent.
begin;

-- Fix any existing rows that are Hanbali/sharia matns wrongly typed as wadi/comparative.
update library.feqh_books
   set type = 'sharia'
 where (title like '%منتهى الإرادات%' or title like '%منتهى الارادات%'
        or title like '%دليل الطالب%' or title like '%أخصر المختصرات%'
        or title like '%عمدة الفقه%' or title like '%المقنع%'
        or title like '%كشاف القناع%')
   and type is distinct from 'sharia';

-- Ensure منتهى الإرادات exists and is correctly classified (upsert; adjust id/slug to your seed convention).
insert into library.feqh_books (id, title, author, school, type, category, investigator, total_volumes, total_pages)
values ('muntaha-al-iradat', 'منتهى الإرادات في جمع المقنع مع التنقيح وزيادات',
        'تقي الدين محمد بن أحمد الفتوحي (ابن النجار)', 'المذهب الحنبلي',
        'sharia', 'mutun', '—', 1, 0)
on conflict (id) do update
   set type = 'sharia', school = 'المذهب الحنبلي', category = 'mutun';

commit;
```
(If the real seed for منتهى الإرادات uses a different `id`, run only the first `update` and drop the `insert`; confirm the seed source in §7.2's book-seed task to avoid double-seeding.)

**Files touched**
- `src/app/api/library/books/[slug]/route.ts` — nest blocks into sections; add `type`/`publisher`/defensive coalescing (preserve order_index paywall gating).
- `src/app/book/[slug]/page.tsx` — defensive `?? []` guards on `sec.blocks`; robust first-block selection; safe `filteredChapters`/`handleQuickJump`.
- `src/app/book/[slug]/error.tsx` — NEW route error boundary.
- `src/app/laws/page.tsx` — keyword-detection map: add منتهى الإرادات + siblings; make DB `type` authoritative.
- `supabase/migrations/20260706_feqh_books_type_correction.sql` — NEW idempotent type-correction/upsert.
- (dependency, not owned here) `feqh_books`/`feqh_chapters`/`feqh_sections`/`feqh_blocks` seed — coordinate with §7.2 task #8.

**Acceptance criteria**
- [ ] Navigating to `/book/<any-seeded-slug>` (not just rawd-al-murbi / sources-of-right-1) renders the reader with matn/sharh/hashiyah, no «عفواً، الكتاب غير موجود».
- [ ] A DB book whose API returns nested `chapters[].sections[].blocks[]` renders without any console `TypeError: ... reading 'find'` and without the "This page couldn't load" screen.
- [ ] `/book/<unknown-slug>` still shows the graceful not-found block (404 path), and any thrown render error shows `error.tsx`, not the raw Next crash.
- [ ] منتهى الإرادات shows «نوع المرجع: شرعي / شرعي إسلامي» on the listing card (both grid and list layouts).
- [ ] Paywall behavior unchanged: guest sees locked blocks past `freeLimit` (order_index gate intact); Pro/whitelisted sees full content.
- [ ] Citation/copy (`handleCopyCitation`, `handleCopyBlock`) render a non-`undefined` publisher string.

**Verification steps**
1. Apply migration; seed at least one non-hardcoded fiqh book with chapters/sections/blocks. `curl -s localhost:3000/api/library/books/<slug> | jq '.chapters[0].sections[0].blocks[0]'` → non-null block object (proves nesting).
2. Visit `/book/<slug>` in a browser; open DevTools console → zero errors; matn/sharh visible; sidebar TOC navigates blocks.
3. Visit `/book/does-not-exist` → not-found block (Arabic), HTTP path returns 404 from route.
4. On `/laws` Feqh tab, locate منتهى الإرادات card → «شرعي إسلامي» badge, purple/amber (sharia) styling, not blue (وضعي).
5. As a guest, confirm blocks beyond the free limit remain truncated/locked (paywall regression check).
6. `npm run build && npm run lint` clean; `detect_changes({scope:'compare', base_ref:'main'})` shows only the 5 expected files.

**Ordering / dependencies**
- Do the API route reshape (step 1) and page guards (step 2) together — either alone leaves a shape mismatch. Steps 1-3 fix 19.1+19.3 and are independent of the seed.
- Step 4 (client detection) works immediately; step 5 (migration) makes it fully correct and should run before/with the §7.2 book-seed task (#8) to avoid conflicting inserts. If §7.2 seeds books, coordinate the `id`/`slug` and `type` values there and reduce this migration to the `update`-only path.
- **RLS:** `library.feqh_*` already have public-read policies (`20260626_...sql:770-797`), and the route uses the server client — no new RLS needed. The type-correction migration is a service-role/admin DDL/DML data fix, unaffected by RLS.

**GitNexus pre-edit** — run `impact({direction:'upstream'})` on: `FeqhBookPage` (book/[slug]/page.tsx default export), the books GET route handler, `checkLibraryAccess` (shared paywall — must NOT regress), and the `booksList` mapping / `FeqhTabContent` consumers in `laws/page.tsx`.


---

### §4.6 — library-search
_Effort: 14h · Fix-risk: MED_

#### Wire Library search to the server + fix Arabic FTS normalization
**Finding refs:** LIB-4, LIB-5, LIB-KN-4 / KN-4 (plan §7.2, BLOCKER #2 + Arabic-FTS HIGH)  ·  **Severity:** HIGH  ·  **Effort:** 14h  ·  **Risk of fix:** MED (riskiest DDL in the plan — schedule a maintenance window)

**Root cause**

1. `/api/library/search` has **zero callers** — the real UI never POSTs to it. `src/app/laws/page.tsx:212` loads a capped page and then "searches" that page client-side:
```ts
// laws/page.tsx:212  — bounded init fetch (default 100, hard-capped 200)
fetch("/api/library/init")
```
```ts
// api/library/init/route.ts:11-14  — the cap
const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "100", 10) || 100, 1), 200);
const from = (page - 1) * limit;
const to = from + limit - 1;      // .range(from,to) → at most 200 rows/table
```
```ts
// laws/page.tsx:525-529  — client-side .includes over only that ≤200-row page
const filteredLaws = lawsList.filter(s => {
  const inCat = activeCat === "all" || s.cat === activeCat;
  const inQ   = !nq || normalizeArabic(s.title).includes(nq) || normalizeArabic(s.desc).includes(nq);
  return inCat && inQ;
});
```
So a query can only ever match within the first ≤200 laws/decrees/principles/books; everything past page 1 is invisible to search. The same shape repeats for `filteredPrinciples` (532), `filteredOrders` (573), `filteredFeqhBooks` (582).

2. The Arabic FTS config folds nothing. `20260626_legal_library_schema.sql:37`:
```sql
execute 'create text search configuration library.arabic (copy = simple)';
```
`simple` lowercases + strips combining diacritics but does **not** fold hamza (`إ/أ/آ/ٱ→ا`), alef-maqsura (`ى→ي`), taa-marbuta (`ة→ه`), or map Arabic-Indic/Persian digits (`١٤٤٤→1444`). The stored `fts` columns are `GENERATED ALWAYS AS (to_tsvector('library.arabic', …)) STORED` over **raw** text (e.g. `articles` at schema:150-156), and both routes pass the **raw** query to `plainto_tsquery`:
```ts
// api/library/search/route.ts:49-57  — raw query + a now-FALSE comment claiming this is deliberate
// ...the `library.arabic` config is `copy = simple`, so tokens preserve original Arabic forms — we therefore
// pass the raw query, not the normalizeSearch-processed one).
const ftsQuery = parsed.raw;
```
```ts
// api/library/autocomplete/route.ts:22-28  — same raw-query pattern + false comment
const ftsQuery = query;
```
A user typing `الإثبات` cannot match seeded `الاثبات`; `١٤٤٤` cannot match `1444`. `src/utils/normalizeArabic.ts:37-45` (`normalizeSearch`) already folds hamza + digits — but it never reaches the SQL layer. Because the stored side is unnormalized, normalizing only the query would still miss; **both sides must be normalized**, which is why the stored `fts` must be rebuilt through an IMMUTABLE normalizer.

**Generated-column constraint (why we switch to a trigger):** a `GENERATED … STORED` tsvector column may only reference IMMUTABLE functions, and Supabase migration replays re-run `create or replace`, which can lock on "cannot alter function … a generated column depends on it". We therefore **replace the 5 GENERATED `fts` columns with plain `tsvector` columns maintained by a `BEFORE INSERT OR UPDATE` trigger** — mirroring the existing `library.handle_updated_at()` trigger pattern (`20260626_legal_library_schema.sql:48-58`). This sidesteps the dependency lock and lets a single no-op `UPDATE` re-tokenize on backfill.

---

**Remediation**

**Part A — new migration `supabase/migrations/20260701_arabic_fts_normalization.sql`.** Idempotent, `begin/commit`, `$fn$`-quoted (avoid bare `$$` collisions), patterns copied from `20260626_legal_library_schema.sql` (trigger style from §2 `handle_updated_at`, GIN style from §3, MV verbatim from §5). **⚠️ Riskiest DDL: drops+recreates all 5 generated fts columns AND the `cross_section_search` MV — run in a maintenance window and confirm backfill row counts before flipping the frontend.**

```sql
-- =============================================================================
-- 20260701_arabic_fts_normalization.sql
-- Arabic FTS normalization — IMMUTABLE folder + trigger-maintained fts columns.
-- Fixes: hamza/alef-maqsura/taa-marbuta folding + Arabic-Indic/Persian digit
-- mapping in library FTS. Replaces GENERATED fts columns with trigger-maintained
-- columns so the fts expression routes through library.normalize_arabic_text().
-- ⚠️ HEAVY: drops+recreates 5 generated columns + cross_section_search MV.
-- =============================================================================
begin;

-- 1. IMMUTABLE normalizer — mirrors src/utils/normalizeArabic.ts folding rules.
create or replace function library.normalize_arabic_text(txt text)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $fn$
  select
    translate(
      regexp_replace(
        translate(
          coalesce($1, ''),
          -- alef variants + alef-maqsura + taa-marbuta + hamza-carriers
          -- أ إ آ ٱ → ا ; ى → ي ; ة → ه ; ؤ → و ; ئ → ي
          'أإآٱىةؤئ',
          'اااايهوي'
        ),
        -- strip Arabic tashkeel (harakat), dagger-alef, tatweel U+0640
        '[ًٌٍَُِّْـٰ]',
        '',
        'g'
      ),
      -- Arabic-Indic ٠-٩ and Eastern/Persian ۰-۹ → ASCII 0-9
      '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
      '01234567890123456789'
    );
$fn$;

comment on function library.normalize_arabic_text(text)
  is 'IMMUTABLE Arabic search normalizer: folds hamza/alef-maqsura/taa-marbuta, strips tashkeel+tatweel, maps Arabic-Indic + Persian digits to ASCII. MUST mirror src/utils/normalizeArabic.ts.';

-- 2. Convert each GENERATED fts column to a trigger-maintained plain tsvector.
--    Drop dependent GIN index + the generated column, then add a plain tsvector.
--    IF EXISTS guards make this re-runnable.
drop index if exists library.idx_laws_fts;
alter table library.laws              drop column if exists fts;
alter table library.laws              add  column if not exists fts tsvector;

drop index if exists library.idx_articles_fts;
alter table library.articles          drop column if exists fts;
alter table library.articles          add  column if not exists fts tsvector;

drop index if exists library.idx_decrees_circulars_fts;
alter table library.decrees_circulars drop column if exists fts;
alter table library.decrees_circulars add  column if not exists fts tsvector;

drop index if exists library.idx_principles_fts;
alter table library.principles        drop column if exists fts;
alter table library.principles        add  column if not exists fts tsvector;

drop index if exists library.idx_feqh_blocks_fts;
alter table library.feqh_blocks       drop column if exists fts;
alter table library.feqh_blocks       add  column if not exists fts tsvector;

-- MV cross_section_search (schema §5) selects a.fts / p.fts / dc.fts / fb.fts.
-- Dropping those columns forces a drop+recreate of the MV.
drop materialized view if exists library.cross_section_search;

-- 3. Per-table trigger functions. Each mirrors the coalesce(...) field list of the
--    original generated column EXACTLY (see schema:95-97,150-156,215-221,306-314,436-442).
--    plpgsql, NOT immutable (a trigger fn is volatile; only the column-feeding
--    normalizer must be immutable, which it is).
create or replace function library.tsv_laws() returns trigger
language plpgsql set search_path = '' as $fn$
begin
  new.fts := to_tsvector('library.arabic',
    library.normalize_arabic_text(coalesce(new.title,'') || ' ' || coalesce(new.description,'')));
  return new;
end; $fn$;

create or replace function library.tsv_articles() returns trigger
language plpgsql set search_path = '' as $fn$
begin
  new.fts := to_tsvector('library.arabic',
    library.normalize_arabic_text(
      coalesce(new.title,'') || ' ' || coalesce(new.text,'') || ' ' || coalesce(new.executive_reg_text,'')));
  return new;
end; $fn$;

create or replace function library.tsv_decrees() returns trigger
language plpgsql set search_path = '' as $fn$
begin
  new.fts := to_tsvector('library.arabic',
    library.normalize_arabic_text(
      coalesce(new.title,'') || ' ' || coalesce(new.summary,'') || ' ' || coalesce(new.summary_brief,'')));
  return new;
end; $fn$;

create or replace function library.tsv_principles() returns trigger
language plpgsql set search_path = '' as $fn$
begin
  new.fts := to_tsvector('library.arabic',
    library.normalize_arabic_text(
      coalesce(new.text,'') || ' ' || coalesce(new.ruling_basis,'') || ' ' ||
      coalesce(new.facts,'') || ' ' || coalesce(new.reasons,'') || ' ' || coalesce(new.ruling,'')));
  return new;
end; $fn$;

create or replace function library.tsv_feqh_blocks() returns trigger
language plpgsql set search_path = '' as $fn$
begin
  new.fts := to_tsvector('library.arabic',
    library.normalize_arabic_text(
      coalesce(new.topic,'') || ' ' || coalesce(new.matn,'') || ' ' || coalesce(new.sharh,'')));
  return new;
end; $fn$;

-- 4. Attach triggers (drop-if-exists → create for idempotency).
drop trigger if exists trg_laws_fts on library.laws;
create trigger trg_laws_fts before insert or update on library.laws
  for each row execute function library.tsv_laws();

drop trigger if exists trg_articles_fts on library.articles;
create trigger trg_articles_fts before insert or update on library.articles
  for each row execute function library.tsv_articles();

drop trigger if exists trg_decrees_fts on library.decrees_circulars;
create trigger trg_decrees_fts before insert or update on library.decrees_circulars
  for each row execute function library.tsv_decrees();

drop trigger if exists trg_principles_fts on library.principles;
create trigger trg_principles_fts before insert or update on library.principles
  for each row execute function library.tsv_principles();

drop trigger if exists trg_feqh_blocks_fts on library.feqh_blocks;
create trigger trg_feqh_blocks_fts before insert or update on library.feqh_blocks
  for each row execute function library.tsv_feqh_blocks();

-- 5. Backfill existing rows (trigger fires on UPDATE; no-op SET touches every row).
update library.laws              set title = title;
update library.articles          set title = title;
update library.decrees_circulars set title = title;
update library.principles        set text  = text;
update library.feqh_blocks       set topic = topic;

-- 6. Recreate GIN indexes (schema §3 pattern).
create index if not exists idx_laws_fts              on library.laws              using gin (fts);
create index if not exists idx_articles_fts          on library.articles          using gin (fts);
create index if not exists idx_decrees_circulars_fts on library.decrees_circulars using gin (fts);
create index if not exists idx_principles_fts        on library.principles        using gin (fts);
create index if not exists idx_feqh_blocks_fts       on library.feqh_blocks       using gin (fts);

-- 7. Recreate cross_section_search MV (VERBATIM from schema §5, lines 676-737) + indexes.
--    NOTE: original was `with no data`; we use `with data` so it is immediately queryable.
create materialized view if not exists library.cross_section_search as
select 'article'::text as entity_type, a.id::text as entity_id, l.title as parent_title,
       coalesce(a.title, 'مادة ' || a.number) as title, left(a.text,500) as snippet,
       a.fts as fts, a.created_at as created_at
from library.articles a
join library.laws l on l.slug = a.law_slug
union all
select 'principle'::text, p.id::text, jc.title,
       'مبدأ رقم ' || coalesce(p.principle_number,''), left(p.text,500), p.fts, p.created_at
from library.principles p
join library.judicial_collections jc on jc.id = p.collection_id
union all
select 'decree'::text, dc.id::text, null, dc.title, left(dc.summary,500), dc.fts, dc.created_at
from library.decrees_circulars dc
union all
select 'feqh_block'::text, fb.id::text, bk.title, fb.topic, left(fb.matn,500), fb.fts, fb.created_at
from library.feqh_blocks fb
join library.feqh_sections fs on fs.id = fb.section_id
join library.feqh_chapters fc on fc.id = fs.chapter_id
join library.feqh_books bk   on bk.id = fc.book_id
with data;

create unique index if not exists idx_cross_section_search_pk
  on library.cross_section_search (entity_type, entity_id);
create index if not exists idx_cross_section_search_fts
  on library.cross_section_search using gin (fts);

-- 8. Grant execute on the normalizer (parity with schema §7 grants).
grant execute on function library.normalize_arabic_text(text) to anon, authenticated, service_role;

commit;
```

> Backfill note: the 5 no-op `UPDATE`s rewrite every row and re-fire the row triggers. On large seed tables this is the slow step — run it inside the maintenance window and record row counts (see verification). Because RLS `using(true)` public-read policies exist on these tables, the migration must run as a superuser/`service_role`-owning migration (Supabase `db push` does) — trigger functions do not need `security definer` since they only mutate `NEW`.

**Part B — normalize the query in both routes AND delete the now-false comments.**

`src/app/api/library/search/route.ts` — replace the whole `49-57` comment+assignment block:
```ts
// Fold the query the SAME way the stored fts is folded (library.normalize_arabic_text
// via the tsv_* triggers). normalizeSearch mirrors that normalizer: hamza/alef-maqsura/
// taa-marbuta folding + Arabic-Indic/Persian digit mapping. Both sides must be folded or
// e.g. `الإثبات` won't match stored `الاثبات`.
const ftsQuery = normalizeSearch(parsed.raw);
```
`normalizeSearch` is already imported (`route.ts:3`). **Leave `parsed.plainTerms` untouched** — `truncateWithHighlight` (route.ts:292) already re-folds both text and terms with `normalizeSearch` internally and maps 1:1 back to original offsets, so highlight offsets do not drift.

`src/app/api/library/autocomplete/route.ts` — add the import at top (after line 2) and replace the `22-28` comment+assignment block:
```ts
import { normalizeSearch } from '@/utils/normalizeArabic';
```
```ts
// Fold the query identically to the stored fts (see search/route.ts). Both sides folded.
const ftsQuery = normalizeSearch(query);
```

**Part C — wire `laws/page.tsx` results grid to `POST /api/library/search` with server pagination.** Response shape (search/route.ts:272-278): `{ results, counts:{laws,precedents,orders,feqh}, total, page, query }`; each `results[i]` = `{ id, section:'laws'|'precedents'|'orders'|'feqh', title, snippet, meta }`. Request body: `{ query, section, filters?, sort?, page?, limit? }`, `section ∈ 'all'|'laws'|'precedents'|'orders'|'feqh'`.

C1. Add server-search state next to the autocomplete block (mirrors `fetchAutocomplete`, laws/page.tsx:88-127). Insert after line 91:
```ts
  // — Server-backed full FTS search (LIB-4 fix) —
  const [serverResults, setServerResults] = useState<any[]>([]);
  const [serverCounts,  setServerCounts]  = useState<{laws:number;precedents:number;orders:number;feqh:number}>({laws:0,precedents:0,orders:0,feqh:0});
  const [serverTotal,   setServerTotal]   = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const PAGE_SIZE = 10;

  const sectionForType = useCallback((t: ContentType): 'all'|'laws'|'precedents'|'orders'|'feqh' =>
    t === "laws" ? "laws" : t === "precedents" ? "precedents"
    : t === "orders" ? "orders" : t === "feqh" ? "feqh" : "all", []);

  const fetchServerSearch = useCallback(async (rawQ: string, type: ContentType, page: number) => {
    const q = rawQ.trim();
    if (q.length < 2) {
      setServerResults([]); setServerCounts({laws:0,precedents:0,orders:0,feqh:0}); setServerTotal(0);
      return;
    }
    setSearchLoading(true);
    try {
      const res = await fetch("/api/library/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, section: sectionForType(type), page, limit: PAGE_SIZE, sort: "relevance" }),
      });
      if (res.ok) {
        const data = await res.json();
        setServerResults(data.results || []);
        setServerCounts(data.counts || {laws:0,precedents:0,orders:0,feqh:0});
        setServerTotal(data.total || 0);
      }
    } catch (e) { console.error("[Search] fetch error:", e); }
    finally { setSearchLoading(false); }
  }, [sectionForType]);

  // Debounced (300ms) — re-runs on query, active tab, or page change.
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => fetchServerSearch(search, activeType, precPage), 300);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [search, activeType, precPage, fetchServerSearch]);
```

C2. Gate each `filtered*` source on `usingServerSearch`. Add just above the `filteredLaws` block (before laws/page.tsx:525):
```ts
  const usingServerSearch = nq.length >= 2;
```
Then swap each of the four list sources to prefer mapped server rows when searching. **Laws (replace 525-529):**
```ts
  // Map server search rows → the shape LawsTabContent expects.
  const serverLaws = serverResults
    .filter(r => r.section === "laws")
    .map(r => ({
      id: r.meta?.lawSlug || r.id, slug: r.meta?.lawSlug || r.id,
      title: r.title, desc: r.snippet || "", free: true, progress: 100,
      articlesCount: 0, chaptersCount: 0, lastUpdated: "—",
      cat: activeCat === "all" ? "SA-00" : activeCat, type: "laws", subType: "basic",
    }));

  const filteredLaws = (usingServerSearch ? serverLaws : lawsList).filter(s => {
    const inCat = activeCat === "all" || s.cat === activeCat;
    // Server already applied FTS; keep only the category facet client-side.
    const inQ   = usingServerSearch ? true
                : (!nq || normalizeArabic(s.title).includes(nq) || normalizeArabic(s.desc).includes(nq));
    return inCat && inQ;
  });
```
**Principles (replace 532-538)** — map `serverResults.filter(r => r.section==="precedents")` into the principle shape (`{ id, sourceId:'supreme', source:r.meta?.court||'—', srcAbbr:'م ع', text:r.snippet||r.title, ref:r.meta?.decisionNumber||'—', year:String(r.meta?.year||1445), subject:'civil', cat:activeCat==='all'?'SA-03':activeCat }`), then `const base = usingServerSearch ? serverPrincs : principlesList;` and set `inQ = usingServerSearch ? true : (…existing…)`. Keep `inTrack`/`inSrc` facets client-side.
**Orders (replace 573-579)** — map `r.section==="orders"` → `{ id:r.id, title:r.title, type:r.meta?.type||'circular', issuer:r.meta?.issuer||'—', ref:r.meta?.ref||'—', date:r.meta?.date||'—', summary:r.snippet||'', summary_brief:r.snippet||'', cat:activeCat==='all'?'SA-04':activeCat, hashtags:r.meta?.hashtags||[] }`; `usingServerSearch ? serverOrders : ordersList`; `inQ = usingServerSearch ? true : (…)`. Keep issuer/hashtag facets.
**Feqh books (replace 582-602)** — map `r.section==="feqh"` → `{ id:r.id, slug:r.meta?.bookSlug||r.id, title:r.title, author:'—', type:'sharia', category:'sharuh', categoryLabel:'', desc:r.snippet||'', free:true, progress:100, volCount:r.meta?.volume||1, lastUpdated:'—' }`; `usingServerSearch ? serverBooks : booksList`; set `matchesQuery = usingServerSearch ? true : (…)`.

> `precedentsList`/`filteredPrecedents` and `collectionsList`/`filteredCollections` stay demo-backed and untouched — they only render when `dbPrinciples.length === 0` (laws/page.tsx:431-433) and server search returns DB principles under `section:'precedents'`, so no double-render occurs.

C3. Count badges — feed DB-wide totals when searching. `serverCounts` supplements the existing `autocompleteCounts` chain at laws/page.tsx:680-686; either OR them in (`serverCounts.laws || autocompleteCounts.laws || filteredLaws.length`) or leave the autocomplete counts (they already query the same FTS and, post-Part-B, are correct). Prefer OR-ing `serverCounts` first for consistency with the results grid.

C4. Pager — a control bound to the existing `precPage`/`setPrecPage` (laws/page.tsx:141), shown when `usingServerSearch && serverTotal > PAGE_SIZE`. Page reset on query/tab change already exists (laws/page.tsx:147-151). Surface `searchLoading` beside the existing `dbLoading` spinner (laws/page.tsx:937).

> Keep the `/api/library/init` fetch for the default browse (empty/short query) — only override the four `filtered*` sources when `usingServerSearch` is true.

**Files touched**
- `supabase/migrations/20260701_arabic_fts_normalization.sql` (new)
- `src/app/api/library/search/route.ts` (delete comment 49-56, replace `ftsQuery` at 57)
- `src/app/api/library/autocomplete/route.ts` (add import after line 2; delete comment 22-27, replace `ftsQuery` at 28)
- `src/app/laws/page.tsx` (server-search state/effect + 4× `filtered*` swaps + count badges + pager)

**Acceptance criteria**
- [ ] `select library.normalize_arabic_text('أحكام الإثبات ٱلعامة ١٤٤٤');` → `احكام الاثبات العامه 1444`.
- [ ] `\df+ library.normalize_arabic_text` shows `Volatility = immutable`.
- [ ] All 5 `library.*.fts` columns are plain `tsvector` (not `GENERATED`), each with a `BEFORE INSERT OR UPDATE` trigger and a GIN index; `cross_section_search` MV exists `with data`.
- [ ] Backfill touched every row: `select count(*) from library.articles where fts is not null;` equals total article count (repeat per table).
- [ ] `select count(*) from library.articles where fts @@ plainto_tsquery('library.arabic', library.normalize_arabic_text('الإثبات'));` > 0 when a stored `الاثبات` article exists (was 0 before).
- [ ] In `/laws`, typing `الإثبات` returns rows whose stored text is `الاثبات`; a match on row >200 (beyond init page) appears (was invisible).
- [ ] Network tab shows `POST /api/library/search` firing on search; pager appears when `total > 10` and paging changes rows.
- [ ] Count badges reflect DB-wide `total`, not the ≤200 page.
- [ ] Empty / <2-char query still renders the default `/api/library/init` browse grid unchanged (no server search).
- [ ] `npx tsc --noEmit` and `npx next build` pass (no TS errors from new `any[]` state).
- [ ] The stale raw-query comments in both routes are gone.

**Verification steps**
1. SQL normalizer: `psql -c "select library.normalize_arabic_text('أحكام الإثبات ٱلعامة ١٤٤٤');"` → `احكام الاثبات العامه 1444`.
2. SQL FTS: `select id,title from library.articles where fts @@ plainto_tsquery('library.arabic', library.normalize_arabic_text('الإثبات')) limit 5;` → non-empty.
3. Route: `curl -s -X POST localhost:3000/api/library/search -H 'Content-Type: application/json' -d '{"query":"الإثبات","section":"laws","page":1,"limit":10}' | jq '.total, .results[0].title'` → `total > 0`.
4. Autocomplete: `curl -s 'localhost:3000/api/library/autocomplete?q=%D8%A7%D9%84%D8%A5%D8%AB%D8%A8%D8%A7%D8%AA' | jq .counts` → non-zero.
5. UI: `/laws` → type `الإثبات`, confirm server POST, pager on `total>10`, paging swaps results; clear the box → default browse grid returns.
6. Digit fold: search `١٤٤٤` → matches rows storing `1444`.

**Ordering / dependencies**
- **Run Part A first, in a maintenance window** — it drops+recreates the 5 generated `fts` columns + the `cross_section_search` MV; confirm backfill row counts before deploying B/C. Part C is inert without A (raw `الإثبات` still won't match unnormalized `fts`).
- **File-conflict with §7.4 (already committed in `a5b10c3`):** `laws/page.tsx` `lawsList` fake-laws fallback is already removed (honest empty `[]` at :398); `ordersList`/`principlesList`/`booksList`/`precedentsList`/`collectionsList` still fall back to `DEMO_*` when the DB is empty (:413, :427, :433, :497, :564). Layer the C2 `usingServerSearch ? serverX : demoList` swaps **on top of** that current state — do not reintroduce a fake `lawsList`; when searching, `serverLaws` fully replaces `lawsList` so the empty-`[]` case is bypassed anyway.
- **Security gate:** do NOT flip the frontend to server search until §7.1 (client-workflow IDOR) and §7.3 (paywall gating) are landed — search is a new content-enumeration surface (plan §5 golden rule).
- **RLS interaction:** all 5 content tables have `Allow public read … to anon, authenticated using (true)` (`20260626_legal_library_schema.sql:770-797`); search/autocomplete use the anon/user client → no policy change. `normalize_arabic_text` is `set search_path=''` + schema-qualified (matches `handle_updated_at` hardening). The `cross_section_search` MV bypasses RLS (MVs always do) and is unchanged behavior — still only reachable via direct SQL / `service_role`, not the anon routes.
- After later seed loads, triggers auto-populate `fts` on insert; only the MV needs `select library.refresh_cross_section_search();` (schema §8).

**GitNexus pre-edit** — run `impact({direction:'upstream'})` before editing on: `normalizeSearch` and `normalizeArabic` (shared by `laws/[slug]`, `precedents/[slug]`, both search routes — confirm no consumer breaks on behavior parity), `POST` (search route handler) and `GET` (autocomplete handler), and `LegalLibraryPage` (the `laws/page.tsx` default export — the `filtered*` bindings feed `LawsTabContent`/`PrecedentsTabContent`/`OrdersTabContent`/`FeqhTabContent`).

> **⚠️ Reviewer corrections for §4.6 (apply these):**
>
> - proposes new file 20260701_arabic_fts_normalization.sql. VERIFIED a migration dated 20260701 already exists (20260701_smart_folder_items_display_cols.sql) AND 20260701_client_workflow_rls_assert.sql. Same-date prefixes are fine for ordering only if the lexical order is intended; 20260701_arabic_fts... sorts BEFORE _client_workflow and _smart_folder among the 20260701 set. -> Rename to a later date (e.g. 20260702_) to guarantee it runs AFTER the already-committed 20260701 migrations, avoiding any replay-order ambiguity on a fresh DB.
>
> - the debounced server-search useEffect depends on precPage but C4 says 'page reset on query/tab change already exists (page.tsx:147-151)'. VERIFIED precPage state exists (page.tsx:141) and is persisted to sessionStorage (page.tsx:198,245). Risk: the new fetchServerSearch effect keys on [search, activeType, precPage] AND a separate existing effect resets precPage on query change — this can double-fire (query change resets precPage, which re-triggers the search effect). -> Debounce guards most of it, but confirm the reset runs BEFORE the search effect or you get two POSTs per keystroke on tab/query change.


---

### §4.7 — Library persistence (folders / notes / drafts)
_Effort: 22h · Fix-risk: MED_

#### Move drafts / folders / notes off localStorage → DB + full SmartFolders wiring + notes RLS
**Finding refs:** DEV-1, LIB-13, LIB-15  ·  **Severity:** MED  ·  **Effort:** ~22h  ·  **Risk of fix:** MED

**Root cause** — three separate client stores never reach the DB, even though two of the three backends already exist:

1. **Folders (LIB-13).** `SmartFolders.tsx` is 100% localStorage; every mutation writes `nzamy_smart_folders` and broadcasts a `CustomEvent`, never touching the API. `src/app/laws/components/SmartFolders.tsx:42-66`:
```tsx
const saved = localStorage.getItem("nzamy_smart_folders");
if (saved) { try { setFolders(JSON.parse(saved)); } catch { setFolders(seedFolders); } }
// ...handleCreate / handleDelete / handleToggleItemInModal all do:
localStorage.setItem("nzamy_smart_folders", JSON.stringify(next));
window.dispatchEvent(new CustomEvent("nzamy_smart_folders_changed", { detail: next }));
```
`FolderSelectionModal.tsx:52-78` reads/writes the SAME key independently — so the two components desync exactly as the earlier review warned; the folders API in `src/app/api/library/folders/route.ts` + `items/route.ts` is fully built (GET/POST/PATCH/DELETE, ownership guards, RLS) but **has zero callers in `src/`**.

2. **Notes (LIB-15).** `MyNotesSection.tsx:91-135` scans `localStorage` for `sticky_note_text_{pageId}` / `highlighter_strokes_{pageId}` / `sticky_note_audio_{pageId}` and deletes by `removeItem`. There is **no `library.notes` table** — `grep "sticky_note|create table.*notes"` over `supabase/migrations/` returns nothing. No per-user row, no RLS, lost on clear.

3. **Drafts (DEV-1).** `src/hooks/useDraftCart.ts:7-30` persists the whole cart to `localStorage["nzamy_legal_draft_v1"]` only — but `public.law_draft_carts` (table `supabase/migrations/20260603_phase1_004_community_features.sql:252-264`, full owner RLS at `:654-671`) and `GET`/`PUT /api/v1/drafts/cart` (`src/app/api/v1/drafts/cart/route.ts`) **already exist and are unused by the hook.**

**Remediation** — Do folders atomically (server = source of truth, no dual write); add notes table+API; wire the existing drafts endpoint. All three read `NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND==='supabase'` (mirror `useUser.ts:394-398`) and keep the localStorage path for demo mode.

---

**Step 1 — Notes migration** (new file `supabase/migrations/20260705_library_notes.sql`; copy structure/RLS from `smart_folders` block in `20260626_legal_library_schema.sql:463-478,804-826`):
```sql
-- 20260705_library_notes.sql
-- Per-user notes/highlights/audio for a library page (replaces localStorage
-- sticky_note_* / highlighter_strokes_ keys). RLS mirrors library.smart_folders.
-- Additive + idempotent.
begin;

create table if not exists library.notes (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  page_id     text        not null,               -- e.g. 'companies-law', 'order-2', 'precedent-judgment-prec-01'
  note_text   text        not null default '',
  strokes     jsonb,                              -- highlighter paths (was highlighter_strokes_{pageId})
  has_audio   boolean     not null default false, -- audio blobs stay client-side (v1); this is the marker
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, page_id)
);

create trigger trg_notes_updated_at
  before update on library.notes
  for each row execute function library.handle_updated_at();

create index if not exists idx_notes_user_id on library.notes (user_id);

alter table library.notes enable row level security;

create policy "Users can view own notes"   on library.notes for select to authenticated using (user_id = auth.uid());
create policy "Users can create own notes"  on library.notes for insert to authenticated with check (user_id = auth.uid());
create policy "Users can update own notes"  on library.notes for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users can delete own notes"  on library.notes for delete to authenticated using (user_id = auth.uid());

grant select, insert, update, delete on library.notes to authenticated;
grant all on library.notes to service_role;

commit;
```

**Step 2 — Notes API** (new `src/app/api/library/notes/route.ts`; copy auth/error shape from `folders/route.ts`). `GET` list, `PUT` upsert one page, `DELETE ?pageId=`:
```ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .schema('library').from('notes')
    .select('page_id, note_text, strokes, has_audio, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });
  if (error) { console.error('[Notes GET]', error); return NextResponse.json({ error: 'Failed to fetch notes' }, { status: 500 }); }
  return NextResponse.json({ notes: data ?? [] });
}

export async function PUT(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { pageId, noteText, strokes, hasAudio } = await request.json() ?? {};
  if (!pageId) return NextResponse.json({ error: 'pageId is required' }, { status: 400 });

  const { data, error } = await supabase
    .schema('library').from('notes')
    .upsert({
      user_id: user.id, page_id: pageId,
      note_text: noteText ?? '', strokes: strokes ?? null, has_audio: !!hasAudio,
    }, { onConflict: 'user_id,page_id' })
    .select().single();
  if (error) { console.error('[Notes PUT]', error); return NextResponse.json({ error: 'Failed to save note' }, { status: 500 }); }
  return NextResponse.json({ note: data });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const pageId = new URL(request.url).searchParams.get('pageId');
  if (!pageId) return NextResponse.json({ error: 'pageId is required' }, { status: 400 });

  const { error } = await supabase
    .schema('library').from('notes').delete()
    .eq('user_id', user.id).eq('page_id', pageId);   // owner-scoped; RLS is defense-in-depth
  if (error) return NextResponse.json({ error: 'Failed to delete note' }, { status: 500 });
  return NextResponse.json({ success: true });
}
```

**Step 3 — Folders client repo** (new `src/app/laws/components/foldersRepo.ts`) so `SmartFolders.tsx` AND `FolderSelectionModal.tsx` share ONE loader/mutator and never dual-write. Map `SmartFolder.laws[]` ⇄ `smart_folder_items` via `entity_type = law.type`, `entity_id = law.slug`, denormalized `title/title_en/cat_id`:
```ts
"use client";
import type { SmartFolder, LawRef } from "./SmartFolders";

const LS_KEY = "nzamy_smart_folders";
const isSupabase =
  typeof window !== "undefined" &&
  (process.env.NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND ?? "demo") === "supabase";

type DbItem = { entity_type: string; entity_id: string; title: string | null; title_en: string | null; cat_id: string | null };
type DbFolder = { id: string; name: string; color: string; icon: string; smart_folder_items: DbItem[] };

const toClient = (f: DbFolder): SmartFolder => ({
  id: f.id, name: f.name, nameEn: f.name, color: f.color, icon: "default",
  isDefault: false,
  laws: (f.smart_folder_items ?? []).map((i): LawRef => ({
    slug: i.entity_id, title: i.title ?? i.entity_id, titleEn: i.title_en ?? "",
    catId: i.cat_id ?? "SA-00", type: (i.entity_type as LawRef["type"]) ?? "law",
  })),
  lastModified: Date.now(),
});

// broadcast so the *other* component re-renders from the same server truth
function broadcast(next: SmartFolder[]) {
  window.dispatchEvent(new CustomEvent("nzamy_smart_folders_changed", { detail: next }));
}

export async function loadFolders(): Promise<SmartFolder[]> {
  if (!isSupabase) {
    try { return JSON.parse(localStorage.getItem(LS_KEY) ?? "[]"); } catch { return []; }
  }
  const res = await fetch("/api/library/folders", { cache: "no-store" });
  if (!res.ok) return [];
  const { folders } = await res.json();
  return (folders as DbFolder[]).map(toClient);
}

export async function createFolder(name: string, color: string): Promise<SmartFolder[]> {
  if (!isSupabase) return localMutate(prev => [...prev, {
    id: `folder-${Date.now()}`, name, nameEn: name, color, icon: "default",
    isDefault: false, laws: [], lastModified: Date.now(),
  }]);
  await fetch("/api/library/folders", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, color }) });
  return refresh();
}

export async function deleteFolder(id: string): Promise<SmartFolder[]> {
  if (!isSupabase) return localMutate(prev => prev.filter(f => f.id !== id));
  await fetch(`/api/library/folders?folderId=${encodeURIComponent(id)}`, { method: "DELETE" });
  return refresh();
}

export async function renameFolder(id: string, name: string): Promise<SmartFolder[]> {
  if (!isSupabase) return localMutate(prev => prev.map(f => f.id === id ? { ...f, name, nameEn: name } : f));
  await fetch("/api/library/folders", { method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folderId: id, name }) });
  return refresh();
}

export async function setFolderColor(id: string, color: string): Promise<SmartFolder[]> {
  if (!isSupabase) return localMutate(prev => prev.map(f => f.id === id ? { ...f, color } : f));
  await fetch("/api/library/folders", { method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folderId: id, color }) });
  return refresh();
}

/** Toggle one library doc in a folder — the ONE atomic write for both components. */
export async function toggleItem(folderId: string, doc: LawRef, isInFolder: boolean): Promise<SmartFolder[]> {
  if (!isSupabase) {
    return localMutate(prev => prev.map(f => f.id === folderId ? {
      ...f,
      laws: isInFolder
        ? f.laws.filter(l => !(l.slug === doc.slug && (l.type ?? "law") === (doc.type ?? "law")))
        : [...f.laws, doc],
      lastModified: Date.now(),
    } : f));
  }
  if (isInFolder) {
    // find server item id, then DELETE ?itemId — resolve via a fresh GET to avoid stale ids
    const folders = await fetchDb();
    const f = folders.find(x => x.id === folderId);
    const item = f?.smart_folder_items.find(i => i.entity_id === doc.slug && i.entity_type === (doc.type ?? "law"));
    // NOTE: GET does not currently return item.id in the mapped shape — see Ordering note; add id to select.
    if (item && (item as DbItem & { id?: string }).id) {
      await fetch(`/api/library/folders?itemId=${(item as DbItem & { id: string }).id}`, { method: "DELETE" });
    }
  } else {
    await fetch("/api/library/folders/items", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId, entityType: doc.type ?? "law", entityId: doc.slug,
        title: doc.title, titleEn: doc.titleEn, catId: doc.catId }) });
  }
  return refresh();
}

async function fetchDb(): Promise<DbFolder[]> {
  const res = await fetch("/api/library/folders", { cache: "no-store" });
  return res.ok ? (await res.json()).folders : [];
}
async function refresh(): Promise<SmartFolder[]> {
  const next = (await fetchDb()).map(toClient);
  broadcast(next);
  return next;
}
function localMutate(fn: (prev: SmartFolder[]) => SmartFolder[]): SmartFolder[] {
  let prev: SmartFolder[] = [];
  try { prev = JSON.parse(localStorage.getItem(LS_KEY) ?? "[]"); } catch {}
  const next = fn(prev);
  localStorage.setItem(LS_KEY, JSON.stringify(next));
  broadcast(next);
  return next;
}
```
Then rewrite `SmartFolders.tsx` handlers (`:42-182`) and `FolderSelectionModal.tsx` (`:52-149`) to `await` these repo fns and `setFolders(result)` instead of building `next` + `localStorage.setItem` inline. The `nzamy_smart_folders_changed` listener already present in both components (`SmartFolders.tsx:69-77`, `FolderSelectionModal.tsx:64-72`) then keeps them in sync from a single server truth — that is the atomicity fix. Keep the `DEMO_FOLDERS` prod-gate (`SmartFolders.tsx:46-50`) only for `!isSupabase`.

**Step 4 — GET must return item ids.** `folders/route.ts:22-25` currently selects `smart_folder_items ( id, entity_type, entity_id, created_at )` — good, `id` IS there, but Step 3's `toClient` drops it. Extend `DbItem` and `toClient` to carry `id` on each `LawRef` (add optional `itemId?: string` to `LawRef` in `SmartFolderTypes.ts:1-7`) so `toggleItem`'s delete branch resolves without the stale-id caveat.

**Step 5 — Notes client wiring.** In `MyNotesSection.tsx` replace the `useEffect` localStorage scan (`:91-123` current / `:111-143` tester-mod) with: if `isSupabase`, `fetch('/api/library/notes')` → map `{page_id,note_text,has_audio,strokes}` → `NoteEntry`; else keep the localStorage scan. Replace `deleteEntry` (`:125-135`) DB branch with `DELETE /api/library/notes?pageId=`. The actual note *writers* (the sticky-note editor + highlighter that set `sticky_note_text_{pageId}` etc.) must call `PUT /api/library/notes` on save — locate them (`grep "sticky_note_text_"` → `src/app/laws/[slug]/_article-components.tsx`, `orders/[slug]/page.tsx`, `precedents/judgment/[slug]/_helpers.ts`) and add a debounced `PUT` alongside the existing `setItem`. This is the larger slice of the notes effort.

**Step 6 — Drafts wiring.** In `useDraftCart.ts`, add a supabase branch: on mount `GET /api/v1/drafts/cart` → map rows to `CartEntry`; on every `setCart`, debounce a `PUT /api/v1/drafts/cart` with `items:[{law_slug,article_number,article_title}]`. The endpoint + table + RLS already exist — no migration. Keep localStorage for demo mode. (Note: the current `law_draft_carts` schema stores article-grain rows, not the full `CartEntry` w/ principles/precedents — either extend `metadata jsonb` usage in the PUT route or accept article-level persistence for v1; recommend storing the full `CartEntry` in the existing `metadata` column to avoid a migration.)

**Files touched**
- `supabase/migrations/20260705_library_notes.sql` (new)
- `src/app/api/library/notes/route.ts` (new)
- `src/app/laws/components/foldersRepo.ts` (new)
- `src/app/laws/components/SmartFolders.tsx` (rewire handlers)
- `src/components/laws/FolderSelectionModal.tsx` (rewire handlers)
- `src/app/laws/components/SmartFolderTypes.ts` (`LawRef.itemId?`)
- `src/app/laws/components/MyNotesSection.tsx` (DB load/delete branch)
- `src/app/laws/[slug]/_article-components.tsx`, `src/app/laws/orders/[slug]/page.tsx`, `src/app/precedents/judgment/[slug]/_helpers.ts` (note writers → PUT)
- `src/hooks/useDraftCart.ts` (DB load + debounced PUT)
- `src/app/api/v1/drafts/cart/route.ts` (optional: persist full CartEntry via `metadata`)

**Acceptance criteria**
- [ ] In supabase mode, creating/renaming/coloring/deleting a folder and adding/removing an item persists across F5 AND across a different browser/device (server-backed).
- [ ] `SmartFolders` and `FolderSelectionModal` never disagree: toggling an item in one reflects in the other after the `nzamy_smart_folders_changed` event, with no `localStorage` write in supabase mode (verify in devtools: no `nzamy_smart_folders` key set).
- [ ] User B cannot see User A's folders, items, notes, or draft cart (RLS): direct `curl` of `/api/library/folders`, `/api/library/notes`, `/api/v1/drafts/cart` with B's session returns only B's rows.
- [ ] Saving a sticky note / highlight persists to `library.notes` and reappears in `MyNotesSection` after clearing localStorage + reload.
- [ ] Draft cart survives `localStorage.clear()` + reload in supabase mode.
- [ ] Demo mode (`NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND` unset) behaves exactly as today (localStorage), no network calls to the new endpoints.
- [ ] Tester UI mods (grid/list toggle, folder manage buttons, draft accordion) still render — persistence patches are additive under them.

**Verification steps**
1. Apply migration: `supabase db push` (or run SQL in dashboard); confirm `library.notes` exists with 4 policies via `select * from pg_policies where tablename='notes'`.
2. Login as user A (supabase mode), create folder + add 2 items + write a note + add 3 draft articles. Reload → all present. `localStorage.clear()` → reload → still present (proves DB, not cache).
3. Login as user B in a second browser → sees none of A's data. Attempt `POST /api/library/folders/items` with A's `folderId` → `403` (ownership guard `items/route.ts:47-49`).
4. `detect_changes()` before commit to confirm only the intended symbols/routes changed.

**Ordering / dependencies**
- **Migration first** (Step 1) before deploying notes API. Folders + drafts need **no** migration (tables/RLS already live from `20260626`/`20260603`).
- **Merge coordination:** land the tester's UI-only mods for `MyNotesSection.tsx` / `FolderCard.tsx` / `DraftDrawer.tsx` FIRST (they touch layout/state names, not persistence), then apply Steps 3-6 on top to avoid conflicts. The FolderCard "manage-content" buttons (DEV-5) are the UI that invokes `toggleItem`.
- **RLS interactions:** `library.notes` policies are `authenticated`-only and `user_id = auth.uid()`, matching `smart_folders`; anon users get nothing (correct — notes require login). `smart_folder_items` RLS already routes through folder ownership (`20260626:832-857`), so the item POST/DELETE ownership checks are defense-in-depth, not the primary gate.
- Independent of §7.2 search wiring; no shared code.

**GitNexus pre-edit** — run `impact({direction:'upstream'})` on: `SmartFolders` (default export), `FolderSelectionModal`, `MyNotesSection`, `useDraftCart`, and the folders route handlers `GET`/`POST`/`PATCH`/`DELETE` before editing — `SmartFolders`/`useDraftCart` are imported by `laws/page.tsx` and reader pages, so confirm no other consumer relies on the localStorage `nzamy_smart_folders` / `nzamy_legal_draft_v1` contract.


---

### §4.8 — Merge tester's 10 proposed modifications (test/modifications/)
_Effort: 6h · Fix-risk: MED_

#### Merge the tester's 10 proposed modifications (test/modifications/)
**Finding refs:** tester `test/modifications/*` (10 files) vs reconciliation MERGE/MERGE_CAREFULLY/SKIP buckets  ·  **Severity:** UX (with 3 embedded regression hazards graded HIGH if applied)  ·  **Effort:** 6h  ·  **Risk of fix:** MED

**Root cause** — The 10 tester files were written against OLD prod code (before commit a5b10c3). `git diff --no-index` shows 4 of them silently revert our security/data-integrity fixes while adding UX. The three concrete regressions:

1. `test/modifications/src/app/laws/components/LawsTabContent.tsx` deletes the subscription gate. Current src gates every card on entitlement:
```
src/app/laws/components/LawsTabContent.tsx:6   import { useSubscription } from "@/hooks/useSubscription";
src/app/laws/components/LawsTabContent.tsx:72   const { can } = useSubscription();
src/app/laws/components/LawsTabContent.tsx:73   const hasLibraryAccess = can("library-full-access");
src/app/laws/components/LawsTabContent.tsx:97   const isLawFree = sys.free || hasLibraryAccess;   // ← tester replaces with raw `sys.free`
```
The tester file drops the import and rewrites every `isLawFree`/`isColFree`/`isBookFree` back to `sys.free`/`col.free`/`book.free` → subscribers lose paid content, i.e. re-locks the paywall incorrectly AND removes the entitlement check. **Paywall-integrity regression.**

2. `test/modifications/src/app/laws/orders/[slug]/page.tsx` reverts API-backed decree loading:
```
src/app/laws/orders/[slug]/page.tsx  (current)  fetch(`/api/library/decrees/${encodeURIComponent(slug)}`)  → setOrder(data)
```
Tester deletes the `fetch` + `loadOrder()` and imports `DEMO_ORDERS` from `../../demo-data` (the fabricated set) instead of the current `../../demo-data-access` (gated real-data accessor). **Library-backend regression + fake-data reintroduction.**

3. `test/modifications/src/app/precedents/judgment/[slug]/page.tsx` is a 697-line page that renders `DEMO_PRECEDENTS.find(...)` from `../../../laws/demo-data` (line 17, 91) — the exact fabricated judgment content current src replaces with an honest gate:
```
src/app/precedents/judgment/[slug]/page.tsx:2   import DashboardComingSoon from "@/components/ui/DashboardComingSoon";
```
**Fabricated-content regression.** No `/api/library/judgment` backend exists, so the tester page cannot be honestly shipped.

4. `test/modifications/src/app/laws/page.tsx` deletes the `/api/library/init` DB fetch (real `dbLaws/dbDecrees/dbPrinciples/dbBooks/dbCollections`) and the `/api/library/autocomplete` debounced fetch, replacing the shared `@/utils/normalizeArabic` with an inline copy and reverting `filteredLaws` to static `FULL_LAWS_SYSTEMS`. **Real-data + §7.2 autocomplete regression.**

The other 6 files are clean UX adds or isolated tweaks and are safe.

**Remediation** — per file. Process the SAFE bucket first (lowest risk), then MERGE_CAREFULLY, then the two DECIDE files last.

---
**A. SAFE — apply verbatim (4 files)**

**A1. `FolderCard.tsx`** — pure add. Single hunk at `src/app/laws/components/FolderCard.tsx:328` turns the empty-folder `<div>` into an `?:` that adds an "Add Content" / "Manage Folder Content" button wired to the already-existing `onManageContent` prop (declared line 63, already invoked line 193). `Plus` already imported (line 7). Copy the tester hunk verbatim:
```tsx
{folder.laws.length === 0 ? (
  <div className="text-center py-5 text-gray-500 text-xs flex flex-col items-center gap-2">
    <span>{isRTL ? "المجلد فارغ حالياً." : "Folder is empty."}</span>
    <button onClick={(e) => { e.stopPropagation(); onManageContent(); }}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#C8A762] text-[#0B3D2E] text-[11px] font-bold hover:opacity-90 transition active:scale-[0.97]">
      <Plus size={12} weight="bold" />
      {isRTL ? "إضافة محتوى للمجلد" : "Add Content"}
    </button>
  </div>
) : (
  <div className="flex justify-center pt-2">
    <button onClick={(e) => { e.stopPropagation(); onManageContent(); }}
      className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#C8A762]/35 text-[#C8A762] hover:bg-[#C8A762]/10 text-[10px] font-bold transition w-full justify-center active:scale-[0.98]">
      <Plus size={12} weight="bold" />
      {isRTL ? "إدارة محتوى المجلد (إضافة / حذف)" : "Manage Folder Content"}
    </button>
  </div>
)}
```
No conflict hunks. Confirm `onManageContent` opens the folder-items modal that §7.4 wired (the POST `/api/library/folders/items` endpoint exists) — button is a no-op otherwise, so this depends on that modal being live.

**A2. `DraftDrawer.tsx`** — expand/collapse full article text + selection-aware copy. Three additive changes, all safe (`CaretDown/CaretUp` already imported line 4):
- Add the module-scope `getSelectedTextWithin(containerId, fallbackText?)` helper (new function, no collision).
- In `DraftItem`, add `const [isExpanded, setIsExpanded] = useState(false);`, make `copyArticle`/`copyReg` prefer selected text via the helper, add the caret toggle button, and render full `articleText`/`execReg.text` when `isExpanded`.
Copy the tester's `DraftItem` body verbatim. **Watch hunk:** the tester wraps the exec-reg block in a new `flex-col` container — take the whole tester hunk (lines ~340-380 of the diff) as one unit; do not hand-merge the badge row or the amber classes will drift.

**A3. `precedents/judgment/[slug]/_helpers.ts`** — extend `getSelectedTextWithin` with an optional `fallbackText` param and `startContainer`/`endContainer` range checks. Pure signature-compatible superset (default-valued new arg). Apply verbatim:
```ts
export function getSelectedTextWithin(containerId: string, fallbackText?: string): string {
  if (typeof window === "undefined") return "";
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return "";
  const selectedText = selection.toString().trim();
  if (!selectedText) return "";
  if (fallbackText && fallbackText.replace(/\s+/g, "").includes(selectedText.replace(/\s+/g, ""))) return selectedText;
  const container = document.getElementById(containerId);
  if (!container) return "";
  const range = selection.getRangeAt(0);
  if (container.contains(range.commonAncestorContainer) || container.contains(range.startContainer) || container.contains(range.endContainer)) return selectedText;
  return "";
}
```
Note: the current judgment `page.tsx` is a coming-soon gate and imports nothing from this helper, so this change is currently dormant but harmless and ready for the future real page.

**A4. `MyNotesSection.tsx`** — DECIDE-within-safe. The tester makes two changes; only the first is a clean add:
- **KEEP (add):** the `getCleanDocumentName` map extension (`prec-*`, `order-*`, `ord-*`, `precedent-judgment-` prefix handling) and the `getCategoryInfo`/`linkPrefix` `precedent-judgment-` branches. Pure additive lookup rows — apply verbatim.
- **DECIDE — semantic swap, NOT a pure add:** the tester REPLACES the existing `viewMode` (`"flat" | "grouped"`) with a new `layoutType` (`"list" | "grid"`) and **deletes `renderGroupedEntries()`** (current lines 251-289) — i.e. it drops the group-by-category view in exchange for a grid layout. **Recommendation:** keep BOTH. Add `layoutType` alongside `viewMode` rather than replacing it: keep the two existing toolbar buttons (flat/grouped) and add the grid card renderer as a third mode, OR (simpler) accept the tester's list/grid swap only if product confirms grouped-view is unwanted. Do NOT blindly take the tester file — it silently deletes a shipped feature. **Watch hunks:** the `<div className="flex p-0.5 ...">` toolbar button block (current lines 334-346) and the content-list container `className` (current lines 386-387, where `renderGroupedEntries()` is invoked). Default decision: **KEEP-OURS on the viewMode/renderGroupedEntries deletion**, cherry-pick only the grid card `renderEntryRow` branch + the map extension.

---
**B. MERGE_CAREFULLY — cherry-pick, drop the reverts (2 files) + the page.tsx plumbing they need**

**B2 (do first — shared prop plumbing). `laws/page.tsx` sort application ONLY.** Current `page.tsx` already has `precSort` state (line 142), persistence (204, 246), and passes it to the precedents component (974). It does NOT yet (a) compute `sortedLaws`/`sortedOrders`, nor (b) pass `precSort`/`setPrecSort` to `LawsTabContent`/`OrdersTabContent`. Cherry-pick ONLY the sort-computation logic from the tester's big hunk and the two extra props. **Do NOT take** the tester's `filteredLaws = FULL_LAWS_SYSTEMS.filter(...)` line — keep our DB-backed source. Add, after the current `filteredLaws`/`filteredOrders` memos:
```tsx
const sortedLaws = [...filteredLaws].sort((a, b) => {
  if (precSort === "year-desc" || precSort === "date-desc") return (b.year ?? 0) - (a.year ?? 0);
  if (precSort === "year-asc") return (a.year ?? 0) - (b.year ?? 0);
  return 0; // relevance = current order
});
const sortedOrders = [...filteredOrders].sort((a, b) => {
  if (precSort === "year-desc" || precSort === "date-desc") return (b.year ?? 0) - (a.year ?? 0);
  if (precSort === "year-asc") return (a.year ?? 0) - (b.year ?? 0);
  return 0;
});
```
Then pass `filteredLaws={sortedLaws}` to `LawsTabContent` and `filteredOrders={sortedOrders}` + `precSort`/`setPrecSort` to `OrdersTabContent`. **REJECT every other hunk** of the tester page.tsx (the `/api/library/init` delete, `/api/library/autocomplete` delete, inline `normalizeArabic`). Verify field name: confirm the real DB rows expose `.year` (grep the `/api/library/init` handler's row shape) before wiring the comparator; if the field differs, adjust the accessor — do not assume the demo-data shape.

**B1. `LawsTabContent.tsx` — sort bar UI ONLY, reject the gate revert.** Cherry-pick just: (a) the two new props `precSort`/`setPrecSort` in the interface + signature, and (b) the "Sorting Bar" JSX block (the tester's `{/* Sorting Bar */}` div). **REJECT** every `isLawFree→sys.free` / `isColFree→col.free` / `isBookFree→book.free` hunk and the `useSubscription`/`hasLibraryAccess` deletion — those are the paywall regression. Concretely: keep current lines 6, 72-73 and all `isLawFree`/`isColFree`/`isBookFree` usages; only paste the sort-bar div and the prop declarations. **Watch hunk:** the tester's sort-bar and its gate-revert are interleaved in the same `git diff` region — apply by hand, not with `git apply`.

**B3. `OrdersTabContent.tsx` — sort bar + remove client pagination, but FIX the import.** The tester (a) adds `precSort`/`setPrecSort` props + a sort bar, and (b) removes the local client-side pagination (`page`, `itemsPerPage`, `getPageNumbers`, prev/next buttons) in favour of rendering all `filteredOrders` (server/parent handles ordering). Both are acceptable UX. **HAZARD:** the tester changes the import from `../demo-data-access` to `../demo-data` (line 7). **KEEP-OURS:** retain `import { type DemoOrder } from "../demo-data-access";`. Cherry-pick the props, the sort bar, and the pagination removal; reject the import line. Decide with product whether dropping pagination is wanted for large order lists; if lists can exceed ~30 items, keep pagination and take only the sort bar.

**PaywallModal.tsx — MERGE_CAREFULLY, business-copy decision.** Two independent changes:
- **REFACTOR (safe):** the `AdvancedSearchModal` signature collapse and moving `handleApply` up. But note the tester's `handleApply` is a **simplification** that drops the multi-field query assembly (title/num/year/articleText) and changes `onApplySearch` from `(query, section)` to `(query)`. This couples to §7.2 search wiring — **defer** unless §7.2 is landing simultaneously; the current 2-arg `onApplySearch(fullQuery, tab)` is what today's callers expect. Reject this hunk for now.
- **DECIDE (pricing copy):** the `PLANS` "full" plan changes price 79→300, period "شهرياً"→"لـ ٣ أشهر", adds a struck-through 600 SAR and a "3 free licenses for colleagues / 50% off" promo. This is a **product/pricing decision, not an engineering merge** — do not apply without explicit product sign-off (fabricated promo pricing is a beta-integrity concern). Flag to product; keep current copy by default.

---
**C. DECIDE — do NOT apply wholesale (2 files)**

**C1. `precedents/judgment/[slug]/page.tsx` — SKIP.** Renders `DEMO_PRECEDENTS.find(...)` fabricated judgments; no backing API. Applying it re-introduces exactly the fake content commit a5b10c3 gated behind `DashboardComingSoon`. **Decision framework:** ship the tester page ONLY after a real `/api/library/judgment/[slug]` endpoint + migration exist (out of scope here). Until then keep the 20-line coming-soon gate. Salvageable now: the tester's `_helpers.ts` upgrade (A3, already merged) and, later, the page's copy-selection / drawer UX once real data lands. **No hunks are safe to cherry-pick into the gate today.**

**C2. `laws/page.tsx` — cherry-pick B2 only, reject the rest.** Covered above: take the `sortedLaws`/`sortedOrders` sort application + prop plumbing; reject the `/api/library/init`, `/api/library/autocomplete`, and inline-`normalizeArabic` reverts. The tester's inline `normalizeArabic` is behaviorally close to `@/utils/normalizeArabic` but drops the `require(...)` shared util — keep the import.

**Files touched (net, after cherry-picking)**
- `src/app/laws/components/FolderCard.tsx` (A1, verbatim)
- `src/components/laws/DraftDrawer.tsx` (A2, verbatim)
- `src/app/precedents/judgment/[slug]/_helpers.ts` (A3, verbatim)
- `src/app/laws/components/MyNotesSection.tsx` (A4, map add + optional grid mode; keep grouped view)
- `src/app/laws/page.tsx` (B2, sort application + 2 props only)
- `src/app/laws/components/LawsTabContent.tsx` (B1, sort bar + props only; gate kept)
- `src/app/laws/components/OrdersTabContent.tsx` (B3, sort bar + pagination removal; import kept)
- `src/app/laws/components/PaywallModal.tsx` (pricing = product decision; search refactor deferred)
- NOT touched: `precedents/judgment/[slug]/page.tsx` (stays gated), and no `demo-data` import may replace `demo-data-access` anywhere.

**Acceptance criteria**
- [ ] `grep -rn "demo-data-access" src/app/laws/components/OrdersTabContent.tsx src/app/laws/orders src/app/precedents/judgment` still resolves; no new `from "../demo-data"` (non-access) imports introduced by the merge.
- [ ] `grep -n "useSubscription\|hasLibraryAccess" src/app/laws/components/LawsTabContent.tsx` still present; subscriber with `library-full-access` sees paid laws/collections/books unlocked.
- [ ] `/api/library/init` and `/api/library/autocomplete` fetches still present in `src/app/laws/page.tsx`.
- [ ] `precedents/judgment/[slug]/page.tsx` still renders `DashboardComingSoon` (no `DEMO_PRECEDENTS`).
- [ ] Sort bar renders in Laws and Orders tabs; selecting "الأحدث"/"الأقدم" reorders visibly; "relevance" restores original order; choice persists across reload (sessionStorage `nzamy_search_precSort`).
- [ ] Empty folder shows "إضافة محتوى للمجلد"; non-empty shows "إدارة محتوى المجلد" — both open the folder-items modal.
- [ ] DraftDrawer caret expands full article text; copying a text selection inside an expanded item copies the selection, else the whole article.
- [ ] `npm run lint && npm run build` pass.

**Verification steps**
1. `git diff --no-index src/<f> test/modifications/src/<f>` per file to confirm you took only the intended hunks.
2. Log in as a `library-full-access` subscriber → open `/laws` → paid law cards are NOT blurred/locked (proves gate not reverted).
3. Open a decree via `/laws/orders/[slug]` in devtools Network → confirm a `GET /api/library/decrees/...` fires (proves API loader not reverted).
4. Toggle sort in both tabs, reload → order persists.
5. `detect_changes({scope:"compare", base_ref:"main"})` — confirm affected symbols are only the 7 touched components + page, no `demo-data`/`useSubscription` removals.

**Ordering / dependencies**
- Do B2 (page.tsx sort plumbing) BEFORE B1/B3 so the child props exist when you add them.
- A4's grid mode is independent; A1/A2/A3 fully independent.
- PaywallModal pricing gated on product sign-off; the `AdvancedSearchModal` refactor is gated on §7.2 landing (shares the `onApplySearch` contract).
- No RLS interactions — these are client components; the only backend touch is the pre-existing folder-items POST (§7.4) that A1's button invokes.

**GitNexus pre-edit** — run `impact({direction:'upstream'})` on: `LawsTabContent`, `OrdersTabContent`, `MyNotesSection`, `DraftDrawer` (and its inner `DraftItem`), `getSelectedTextWithin`, `LegalLibraryPage` (laws/page default export), `getCleanDocumentName`, `getCategoryInfo`. Also `context({name:"useSubscription"})` before touching `LawsTabContent` to confirm no other caller relies on the entitlement path you must preserve.

> **⚠️ Reviewer corrections for §4.8 (apply these):**
>
> - sortedLaws/sortedOrders comparator uses (b.year ?? 0) - (a.year ?? 0). VERIFIED lawsList (page.tsx:379-397) and ordersList (page.tsx:401-413) have NO .year field — lawsList has lastUpdated (issue_date_hijri string), ordersList has .date (string '—'). Only principlesList has .year. -> The sort is a NO-OP for the Laws and Orders tabs (every comparator returns 0-0=0). The spec's own 'Verify field name' caveat is correct but the default comparator ships a dead sort. Either map a real numeric year from issue_date_hijri/date, or drop the year-sort for laws/orders and keep only relevance.
>
> - keep-import '../demo-data-access'. VERIFIED that is the correct current import to preserve; ordersList already falls back to DEMO_ORDERS (page.tsx:413) via demo-data-access. Correction to the spec's framing: OrdersTabContent removing client pagination while ordersList can contain the full DEMO_ORDERS set (or full DB set) means large lists render unpaged — the spec flags this ('if lists exceed ~30 keep pagination') but should hard-require keeping pagination since DB orders are unbounded.


---

### §4.9 — Client-side UX bugs (CLIENT-2.1, 2.3, 2.5, 2.6, 3.1, 3.6)
_Effort: 5.5h · Fix-risk: LOW_

#### Client-side UX bugs — CLIENT-2.1 / 2.3 / 2.5 / 2.6 / 3.1 / 3.6
**Finding refs:** CLIENT-2.1, CLIENT-2.3, CLIENT-2.5, CLIENT-2.6, CLIENT-3.1, CLIENT-3.6  ·  **Severity:** MED (2.1, 2.3, 2.5, 3.1) / UX (2.6, 3.6)  ·  **Effort:** ~5.5h  ·  **Risk of fix:** LOW

All six are contained client-side edits (one layout file, two page files, two wizard components, one constants file). No RLS, no DB, no API. Each is independent — ship in any order.

---

#### CLIENT-2.3 — dashboard "لديك سؤال قانوني؟" text not carried into /ai chat (MED)

**Root cause** — the hand-off is *half-built*. The dashboard input **already** builds a `?q=` query param, but the chat page never reads it.

`src/app/dashboard/client/page.tsx:707` (the "اسأل" CTA):
```tsx
<Link href={`/ai/consult${aiInput ? `?q=${encodeURIComponent(aiInput)}` : ""}`}>
```
`src/app/ai/consult/page.tsx` has **zero** `useSearchParams` usage (grep empty) — the seeded question is dropped. The page boots with only the system message (`page.tsx:167-174`) and an empty `input` (`:175`).

**Remediation** — read `?q=` on mount and auto-send it once. Mirror the `useSearchParams` + `Suspense` pattern already used in `src/app/ai/draft/page.tsx:4,30-31` and `src/app/ai/analyze/page.tsx:3,37`.

1. Wrap the exported page in `Suspense` (required by Next 16 for `useSearchParams` — same as `ai/analyze/page.tsx:37`). Rename the current component to `AIConsultInner`:
```tsx
// src/app/ai/consult/page.tsx — top of file
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
```
```tsx
// bottom of file — replace `export default function AIConsultPage()` signature:
function AIConsultInner() {
  // ... existing body of AIConsultPage ...
}

export default function AIConsultPage() {
  return (
    <Suspense fallback={null}>
      <AIConsultInner />
    </Suspense>
  );
}
```

2. Inside `AIConsultInner`, after the existing `const textareaRef = useRef...` (`:180`), add a one-shot seed effect. `sendMessage` is a hoisted `function` in the same scope, so it is callable:
```tsx
const searchParams = useSearchParams();

// Seed the chat from ?q= (dashboard hand-off) exactly once.
const seededRef = useRef(false);
useEffect(() => {
  const seed = searchParams.get("q")?.trim();
  if (seed && !seededRef.current) {
    seededRef.current = true;
    setInput(seed);            // reflect in the composer…
    sendMessage(seed);         // …and dispatch immediately
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [searchParams]);
```
Behavior: landing on `/ai/consult?q=...` shows the question as the first user bubble and the answer streams — no retype. If `?q=` absent, unchanged empty-state.

> Note: the answer body is still the `getMockResponse` stub (`consult/page.tsx:54-59,200-202`) — that fabricated-reply defect is tracked separately as KN-1/LIB-KN-1 and is out of scope here. This finding is purely the text hand-off.

---

#### CLIENT-2.1 — /ai/consult in a NEW TAB bounces to login though authed (MED)

**Root cause** — two-part. (a) `/ai/consult` is **not** in the middleware `PROTECTED` list — `src/proxy.ts:17-28` protects `/ai/settings`, `/ai/vault`, `/ai/secretary`, `/ai/fee-calculator`, `/ai/report-generator`, `/ai/tracker` but **not** `/ai/consult`. (b) The residual/latent bounce is the classic Supabase-SSR **fresh-request cookie race**: on a cold tab there is no client session yet, and the browser client is created with **no explicit cookie adapter**, so `getUser()` can momentarily resolve null before the auth listener fires.

`src/lib/supabase/client.ts:15-18`:
```ts
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );   // ← no cookieOptions; default storage
}
```
`src/hooks/useUser.ts:545-546` reads `getUser()` on mount and only later reconciles via `onAuthStateChange` (`:549-553`); any client-side guard checking `isLoggedIn` before the listener fires would bounce a genuinely-authed user in a cold tab.

**Remediation** — harden middleware cookie propagation (the SSR read is the source of truth for a cold navigation) and make the fresh-tab render wait for hydration rather than treating "not-yet-loaded" as "logged-out".

1. In `src/proxy.ts`, non-protected pages like `/ai/consult` skip the Supabase cookie refresh entirely (`:88-89` returns `NextResponse.next()` before the Supabase block). Add a **session-refresh** pass that refreshes cookies without redirecting:
```ts
// src/proxy.ts — after PROTECTED (around :28)
// Pages reachable while logged-out (soft-gated) but whose Supabase session cookies
// must still be refreshed on a cold navigation, so a fresh tab does not momentarily
// read a null session. NO redirect on missing user.
const SESSION_REFRESH = ["/ai/consult", "/ai/contract-drafter", "/ai/letter-drafter", "/ai/analyze"];
```
```ts
// src/proxy.ts — inside proxy(), BEFORE the `isProtected` check (before :88)
if (isSupabaseMode && SESSION_REFRESH.some((p) => pathname.startsWith(p))) {
  let refreshResponse = NextResponse.next({ request: req });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return req.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
          refreshResponse = NextResponse.next({ request: req });
          cookiesToSet.forEach(({ name, value, options }) =>
            refreshResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );
  await supabase.auth.getUser();   // refresh + re-issue cookies; never redirect
  return refreshResponse;
}
```
This guarantees the cold tab gets a freshly-issued session cookie chunk, so `useUser`'s client `getUser()` resolves the real session instead of null.

2. Defense-in-depth on the client: `useUser` already returns `loading` (`src/hooks/useUser.ts:599`). Codify: **never branch on `isLoggedIn` while `loading === true`**. The AI layout (`src/app/ai/layout.tsx:43`) only guards the marketing root (`pathname === "/ai" && !user.isLoggedIn`), so no code redirects `/ai/consult` today — step 1 is the substantive fix; step 2 is a guardrail. If a future guard is added, gate it `if (!loading && !isLoggedIn) router.replace("/login")`.

> Verify on staging with a real Supabase session — this cannot reproduce in demo mode (localStorage-based, `useUser.ts:564-586`).

---

#### CLIENT-2.5 — "المكتبة القانونية" in the CLIENT sidebar (MED — product decision)

**Root cause** — `src/constants/navigation.sidebars.primary.ts:71`, in `INDIVIDUAL_SIDEBAR`'s tail group:
```ts
{ label: "المكتبة القانونية", labelEn: "Legal Library", href: "/laws", icon: "BookOpen" },
```
Ungated — every individual sees it. The tester assumed the library is Pro-only and flagged it as a role-isolation leak. **That premise is likely wrong**: `/laws` is a public route with its own per-item paywall (our committed §7.3 gating on books/decrees/precedents routes), i.e. the library is intentionally browseable by all tiers with locked items behind `PaywallModal`. Showing it to clients is a legitimate funnel.

**Remediation — RECOMMENDED: keep, confirm product intent (no code change).** Record that `/laws` is a public, paywall-gated funnel surface and that its presence in the client sidebar is intended. Close CLIENT-2.5 as "working as designed" pending owner sign-off.

**Alternative (only if the owner decides clients must NOT see it):** gate the item behind an entitlement flag rather than deleting it, mirroring the existing `gateKey`/`requiresClientGroup` pattern in this file (`:57` `gateKey: "celebrity"`, `:69` `requiresClientGroup: true`):
```ts
// navigation.sidebars.primary.ts:71 — only if owner rules "hide for free clients"
{ label: "المكتبة القانونية", labelEn: "Legal Library", href: "/laws", icon: "BookOpen", gateKey: "library" },
```
…and add a `library` entitlement resolver wherever `gateKey`/`celebrity` is evaluated. Do **not** hard-delete — that removes the discovery funnel for paying clients too.

> Decision required from product owner before touching code. Default action: none.

---

#### CLIENT-2.6 — /settings shows the dashboard sidebar overlapping the settings rail (UX)

**Root cause** — the settings page is **double-wrapped in chrome**. `src/app/settings/page.tsx` is fully self-contained: it renders its own `Navbar` (`:128`), its own settings-tab `<aside>` rail (`:148-190`, `w-56`), its own `Footer` (`:246`) and `FloatingButtons` (`:247`), inside a `min-h-[100dvh]` root (`:123-127`). But `src/app/settings/layout.tsx:26,30,35` wraps that same page in a dashboard layout (`ClientDashboardLayout` etc.), which itself renders `SharedSidebar` + a `lg:mr-64` main offset + a **second** `FloatingButtons` (`src/app/dashboard/client/layout.tsx:19,22,24`). Result: dashboard sidebar bleeds over/under the settings rail, content pushed by `lg:mr-64`, FloatingButtons rendered twice.

**Remediation** — make `settings/layout.tsx` a pure pass-through. The page already owns 100% of its chrome, so the dashboard wrapper is pure duplication.

Replace the entire body of `src/app/settings/layout.tsx` (currently `:1-46`) with:
```tsx
/**
 * Settings Layout — pass-through.
 *
 * /settings renders its own full-page chrome (Navbar + settings rail + Footer +
 * FloatingButtons) in src/app/settings/page.tsx. Wrapping it in a dashboard layout
 * (SharedSidebar + lg:mr-64 + a duplicate FloatingButtons) caused the sidebar/rail
 * overlap reported in CLIENT-2.6. Keep this a no-op wrapper.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
```
This deletes the `useUser`/`localStorage` dashboard-selection logic (`:14-45`) that only existed to pick which duplicate sidebar to render.

> If product later wants the dashboard sidebar on /settings *instead of* the standalone Navbar, the inverse fix (strip `Navbar`/`aside`/`Footer` from `settings/page.tsx`) is larger and re-architects the page — not recommended. The pass-through is the minimal, correct fix.

---

#### CLIENT-3.1 — contract-draft success screen is a dead-end (MED)

**Root cause** — `src/app/ai/contract-drafter/_components/StepContractResult.tsx` success screen has only two navigations: a "رجوع/Back" button whose `onBack` returns to the **previous wizard step** (`contract-drafter/page.tsx:263 onBack={() => setStep(3)}`), and a "اطلب تنقيح العقد من محامٍ" CTA (`:264 onRequestLawyer={() => setStep(5)}`). There is **no** link back to the dashboard or to "عقودي", even though the draft was saved there — `savedId` prints "تم حفظ المسودة في عقودي" (`StepContractResult.tsx:62-66`). User is stranded on the result.

**Remediation** — add an explicit "back to my contracts" link to the success footer. Target `/dashboard/client/contracts` (the "عقودي" sidebar item, `navigation.sidebars.primary.ts:33`).

1. Add imports at the top of `StepContractResult.tsx`:
```tsx
import Link from "next/link";
// add `House` to the existing "@phosphor-icons/react" import
```
2. In the footer action row (the final `<div className="flex items-center justify-between mt-8">` block, the one containing the `onBack` Back button and the `onRequestLawyer` CTA), insert a dashboard link immediately after the Back button's closing `</button>` so the row reads Back · My-Contracts · Request-lawyer:
```tsx
<Link
  href="/dashboard/client/contracts"
  className={`flex items-center gap-2 text-sm font-bold px-5 py-2.5 rounded-xl transition-all ${
    isDark ? "bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white"
           : "bg-emerald-50 hover:bg-emerald-100 text-emerald-700"
  }`}
>
  <House size={16} weight="bold" />
  {isRTL ? "عقودي" : "My Contracts"}
</Link>
```
(`isDark`/`isRTL` already in scope — `StepContractResult.tsx:33-35`.) Keep the "اطلب تنقيح العقد من محامٍ" CTA as the primary right-aligned action.

---

#### CLIENT-3.6 — letter-generation success screen is a dead-end (UX)

**Root cause** — same class. `src/app/dashboard/client/_components/ClientLetterWorkflow.tsx` success screen (`LetterBlockOutput`, actions row `:224-234`) offers only "تنزيل PDF", "تنزيل Word", and "خطاب جديد" (`onReset`, `:231-233`). `onReset` calls `reset()` (`:263-267`) which resets state **and** calls `onBack()` — for the standalone tool page that is `window.history.back()` (`letter-drafter/page.tsx:64`), so "new letter" ejects you out of the tool entirely rather than offering a clean dashboard path. No explicit "back to my letters" link exists.

**Remediation** — add a dashboard link to the letter success actions row, targeting `/dashboard/client/letters`. Do **not** repurpose `onReset` — keep "خطاب جديد" for starting over.

1. Add to the existing `@phosphor-icons/react` import (`:5-9`): `House`. Add `import Link from "next/link";`.
2. In the `LetterBlockOutput` actions row (`:224`, the `<div className="flex gap-3 flex-wrap">`), insert a dashboard link immediately before the `ms-auto` "خطاب جديد" `<motion.button>` (`:231`) so the row reads Download-PDF · Download-Word · [My-Letters] · (ms-auto) New-letter:
```tsx
<Link
  href="/dashboard/client/letters"
  className={`flex items-center gap-2 rounded-xl border px-5 py-2.5 text-[13px] font-bold transition-all ${
    isDark ? "border-white/10 text-zinc-300 hover:bg-white/5"
           : "border-zinc-200 text-zinc-700 hover:bg-zinc-50 shadow-sm"
  }`}
>
  <House size={16} weight="bold" /> خطاباتي
</Link>
```
(`isDark`/`card` already props of `LetterBlockOutput` — `:84`.) This gives a clear exit landing the user on their letters hub instead of `history.back()` ejecting the tool.

---

**Files touched**
- `src/app/ai/consult/page.tsx` (CLIENT-2.3: `useSearchParams` + Suspense + seed effect)
- `src/proxy.ts` (CLIENT-2.1: `SESSION_REFRESH` list + cookie-refresh pass)
- `src/hooks/useUser.ts` (CLIENT-2.1: guardrail note only — no functional change unless a guard is added)
- `src/lib/supabase/client.ts` (CLIENT-2.1: optional — leave as-is; middleware refresh is the real fix)
- `src/constants/navigation.sidebars.primary.ts` (CLIENT-2.5: **no change** under recommended path; `gateKey` only if owner decides to hide)
- `src/app/settings/layout.tsx` (CLIENT-2.6: reduce to pass-through)
- `src/app/ai/contract-drafter/_components/StepContractResult.tsx` (CLIENT-3.1: dashboard Link)
- `src/app/dashboard/client/_components/ClientLetterWorkflow.tsx` (CLIENT-3.6: dashboard Link)

**Acceptance criteria**
- [ ] CLIENT-2.3: navigating from the dashboard "اسأل" button with text typed opens `/ai/consult?q=...` and the question auto-appears as the first user message + triggers a response, no retype; visiting `/ai/consult` with no param shows the unchanged empty state.
- [ ] CLIENT-2.3: no hydration/Suspense error in console; `useSearchParams` is inside a `Suspense` boundary.
- [ ] CLIENT-2.1: right-click → "open in new tab" on `/ai/consult` while authed (real Supabase session on staging) renders the chat, no bounce to `/login`.
- [ ] CLIENT-2.1: middleware issues refreshed `sb-*` session cookies on a cold `/ai/consult` request (visible in response Set-Cookie).
- [ ] CLIENT-2.5: product owner has recorded the keep/hide decision; default = item remains, closed as working-as-designed.
- [ ] CLIENT-2.6: `/settings` shows exactly ONE sidebar (the settings rail), no `SharedSidebar`, no `lg:mr-64` content offset, exactly ONE FloatingButtons cluster.
- [ ] CLIENT-3.1: the contract result screen shows a visible "عقودي / My Contracts" link that navigates to `/dashboard/client/contracts`.
- [ ] CLIENT-3.6: the letter success screen shows a visible "خطاباتي" link that navigates to `/dashboard/client/letters`; "خطاب جديد" still resets the wizard.

**Verification steps**
1. `npm run build` — confirm no `useSearchParams()-must-be-wrapped-in-Suspense` build error in `ai/consult`.
2. Dashboard → type "ما حقوقي عند الفصل؟" → click اسأل → assert URL `/ai/consult?q=%D9%85%D8%A7...` and first user bubble text matches.
3. Staging (Supabase mode, real login): middle-click / right-click-new-tab `/ai/consult`; assert it renders. Inspect the network doc request → response has `set-cookie: sb-...`.
4. `/settings` at ≥lg width: assert no `SharedSidebar`/dashboard `<aside>` present and content not pushed by `mr-64`; FloatingButtons root count === 1.
5. Contract drafter → complete a draft → on result screen click "عقودي" → lands on `/dashboard/client/contracts`.
6. Letter drafter → generate a letter → click "خطاباتي" → lands on `/dashboard/client/letters`; separately click "خطاب جديد" → wizard resets to step 1.

**Ordering / dependencies**
- All six are independent; no migration, no RLS, no API — pure client/layout edits. Ship in any order.
- CLIENT-2.1 must be verified on **staging with real Supabase auth** — it cannot reproduce in demo mode (`useUser.ts:564-586` is localStorage-based; `proxy.ts` Supabase branch only runs when `NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND==='supabase'`).
- CLIENT-2.5 is gated on a product-owner decision before any code change (recommended: no change).
- CLIENT-2.6's pass-through removes the `useUser` dependency from `settings/layout.tsx`; confirm no other route imports that layout's dashboard-selection side effect (it does not — it is route-scoped).

**GitNexus pre-edit** — run `impact({direction:'upstream'})` on:
- `SettingsLayout` (src/app/settings/layout.tsx) — confirm only `/settings/*` routes consume it before reducing to pass-through.
- `AIConsultPage` (src/app/ai/consult/page.tsx) — confirm the default-export rename to `AIConsultInner` + Suspense wrapper has no external importers of the inner symbol.
- `proxy` (src/proxy.ts default export) — the middleware entry; confirm the `SESSION_REFRESH` early-return placement precedes `isProtected` and doesn't shadow the existing PROTECTED_API / redirect passes.
- `ClientLetterWorkflow` / `LetterBlockOutput` (src/app/dashboard/client/_components/ClientLetterWorkflow.tsx) — confirm both `/ai/letter-drafter` and `/dashboard/client/letters` consume it (both do) so the added Link is safe on both mounts.
- `StepContractResult` (src/app/ai/contract-drafter/_components/StepContractResult.tsx) — confirm the single caller is `contract-drafter/page.tsx` (steps 4 and the review path both render it).


---

## 5. Merging the tester's 10 modifications — hard rules

The merge is the **last** workstream (§4 order). The reviewer's non-negotiables:

- **REJECT the 4 regression reverts** that the tester's old-code mods would reintroduce: the `LawsTabContent` gate, the `OrdersTabContent` demo-data import, the judgment `DEMO_PRECEDENTS`, and the `laws/page.tsx` init/autocomplete deletion. These would undo fixes we already shipped.
- **DECIDE, don't blind-merge, the 2 conflict files:** `precedents/judgment/[slug]/page.tsx` (tester built a 692-line page we gate "coming soon") and `laws/page.tsx` (cherry-pick only non-conflicting UI parts).
- The `B2` year-sort is a **no-op for the Laws/Orders tabs** (no `.year` field) — either map a real year or drop the sort for those tabs.

---

## 6. Reviewer-flagged gaps & coverage holes (add to the plan)

These are real concerns **no spec fully covered** — fold them in during the relevant workstream.

**Systemic gaps (no spec covers):**

1. RATE LIMITING (all specs): No spec adds rate limiting to newly-exposed enumeration surfaces. The library-search spec itself calls search 'a new content-enumeration surface (plan §5 golden rule)' yet adds no throttle; POST /api/library/search + /api/library/autocomplete + the now-projected /api/v1/lawyers are all anon-reachable and unthrottled (verified: grep for rateLimit in src/app/api/library and api/v1/lawyers returns zero). A public FTS endpoint with digit/hamza folding is a cheap scraping vector for the entire legal corpus. Add a per-IP limiter (or at least a min-query-length + max-page cap) before flipping the frontend.

2. PDPL / license_number exposure (LAWYER-6.1): Step 2 keeps license_number IN the base projection and only deletes it post-map when show_contact=false. Because default is false, this is safe by default, but license_number is Saudi-regulated credential PII (PDPL). Safer design is to project it ONLY inside the showContact branch (never SELECT it for opted-out rows) rather than SELECT-then-delete — a projection error or refactor that drops the delete re-leaks it. The spec even notes this pattern for phone/email but does not apply it to license_number.

3. AI setTimeout surfaces the enumeration may have missed: the AI-gating spec enumerates 5 ungated pages (consult/assistant/analyze-strength/communicate/compare) but the codebase has ~50 registered gated tools and the sweep only covered pages the tester hit. quick-answer.result, procedures.*, wargaming, transcriber, contract-negotiator etc. are registered — but there is no spec step to VERIFY every registered toolId is actually WRAPPED at its render site. A registered-but-unwrapped id still fabricates. Add an audit: cross-check LEGAL_DATA_REVIEW_GATED_TOOL_IDS against grep of BetaReviewGate usages to find any other unwrapped surface.

4. Zod / input validation: none of the new POST/PUT bodies (notes PUT, folders items POST, search POST, profile PATCH edit-form) are schema-validated. The notes PUT accepts arbitrary strokes jsonb and note_text with no length cap → unbounded row size / storage abuse under RLS. Search POST accepts arbitrary page/limit with no upper clamp shown (init route clamps to 200; search route clamp not verified). Add Zod (or manual clamps) on limit/page and note_text length.

5. MV refresh after seed (library-search): the spec recreates cross_section_search WITH DATA but never wires refresh_cross_section_search() into the seed pipeline; after §7.2 seed loads, the MV goes stale (triggers only maintain per-table fts, not the MV). The autocomplete/search routes use per-table .textSearch('fts',...), so this MV staleness may be latent — but if any consumer reads the MV it silently returns pre-seed data. Confirm no route reads cross_section_search, or add a post-seed REFRESH.

6. Suspense/CSR-bailout build gap (multiple specs): the consult/consultations Suspense wrappers are correct, but Next 15/16 with useSearchParams can force the whole route to client-side render (CSR bailout) and, in some configs, fail `next build` for statically-optimized routes. No spec verifies the build actually passes with the new useSearchParams in a server-component-adjacent tree beyond a checklist line. This is a real cross-spec build risk (consult page appears in BOTH the lawyer-dashboard spec's 3.5 AND the client-UX spec's 2.3).

7. apiGet vs raw fetch inconsistency (lawyer-profile edit form): the new edit page uses apiGet<ProfileApiResponse>('/api/v1/profile') for GET but a RAW fetch('/api/v1/profile',{PATCH}) for save. If apiGet injects auth headers or a base URL (demo vs supabase), the raw PATCH bypasses that and may 401 in demo mode or against a non-default backend. The spec should route the PATCH through the same api service (apiMutate/apiPatch) it uses for GET, or justify the raw fetch.

8. Highlighter audio persistence (library-persistence LIB-15): the notes migration adds has_audio boolean but explicitly leaves audio blobs client-side ('v1'). So sticky_note_audio_{pageId} is NOT migrated — audio notes are still lost on localStorage clear. Acceptance criteria claim notes 'reappear after clearing localStorage' but audio will not. This is an honest gap the spec half-acknowledges but the acceptance criteria overstate.

**Coverage holes (a spec partially missed):**

1. BETA TEARDOWN completeness (CLIENT-2.7): The spec env-gates 4 demo surfaces but the STILL-DEFERRED list in the brief names 'dev switcher / demo-accounts / test-credentials / demo-login still shipped'. The spec covers ProfileTab console, login link, /demo-login route, firm switcher, business switcher — but does NOT audit register/client + register/provider pages, which the spec itself lists as importers of setDemoSession/DEMO_ACCOUNTS. Do those registration pages render any demo-account picker/prefill that leaks in supabase mode? Not verified by the spec. Gap: audit register/client and register/provider for demo UI, not just the import.

2. LAWYER-6.3 broken buttons: spec fixes the تصدير PDF no-op (disable+قريباً) and builds the edit page, but the finding ref 'LAWYER-6.3 edit UI/buttons' — are there OTHER dead buttons on the profile page beyond PDF? The spec only enumerates one no-op button. Not confirmed there aren't more (e.g. share/print). Minor coverage gap.

3. AI-3.2 subscription cards: spec wires SubscriptionTab to /api/v1/profile subscription, but AI-3.1 (paired finding ref in the heading) is never addressed in the body — the spec header says 'AI-3.2/AI-3.1' but only AI-3.2 (subscription cards) is remediated. AI-3.1 has no step. Gap: AI-3.1 is unaddressed or silently folded.

4. LIB-19.2 type badge on DETAIL page: the spec fixes the LISTING card badge (FeqhTabContent via laws/page.tsx type detection) but explicitly says 'The type badge is NOT on the detail page.' If the book DETAIL/reader shows any شرعي/وضعي label sourced from apiData.type, the new route now returns book.type — confirm the reader doesn't ALSO mislabel. Likely fine, but the reconciliation flagged 'book detail' (LIB-19.x) and the detail-side label is unverified.

5. Persistence DEV-1 drafts: spec stores full CartEntry in law_draft_carts.metadata jsonb to avoid a migration, but law_draft_carts schema (20260603_004:252-264) has article-grain columns. If the existing GET/PUT /api/v1/drafts/cart route VALIDATES/maps only article rows, dumping a full CartEntry into metadata may not round-trip through the route's own serializer. The spec says 'either extend metadata usage in the PUT route or accept article-level' — this is left as an open decision, i.e. DEV-1 is not fully specified. Gap: the drafts persistence is under-specified and may not actually persist principles/precedents.

6. The 10 tester modifications — coverage: the merge spec processes 8 named files (FolderCard, DraftDrawer, _helpers, MyNotesSection, laws/page, LawsTabContent, OrdersTabContent, PaywallModal) + 2 DECIDE (judgment page, laws/page again). That is the 10. But PaywallModal's AdvancedSearchModal onApplySearch signature change (2-arg→1-arg) is DEFERRED pending §7.2 — meaning if §7.2 (library-search) lands, the search wiring in laws/page.tsx (Part C) and the PaywallModal onApplySearch contract must be reconciled TOGETHER. The merge spec and the search spec both touch the search-invocation path but neither owns the onApplySearch contract reconciliation. Cross-spec gap.

7. No spec addresses whether the monopoly beta-gate (redirects /lawyers/*) interacts with the new /dashboard/lawyer/profile/edit route or the public /api/v1/lawyers PII fix. If monopoly mode hides the public lawyer directory entirely in beta, the LAWYER-6.1 PII-projection work is defensive-only (directory not user-reachable) — worth a note so effort is prioritized correctly. The API endpoint itself remains anon-reachable (no monopoly gate in proxy.ts, verified), so the fix is still needed, but the UI-severity is lower in beta.

8. error.tsx for /book/[slug] (LIB-19.3): good addition, but no equivalent error boundary is proposed for the other reader routes (/laws/[slug], /laws/orders/[slug], /precedents/judgment/[slug]) that the persistence spec ALSO edits (adding note PUT writers). Those client pages could throw on the same undefined-nesting class of bug. Gap: error boundaries only added to book reader.

9. Accessibility/keyboard for new disabled PDF button and new Links — acceptance criteria mention keyboard-focusable for the 3.3 CTAs but not for the disabled PDF button (disabled buttons are not focusable, which may hide the قريباً tooltip from keyboard/AT users). Minor a11y gap.

---

## 7. Cross-cutting hardening (do alongside, before public launch)

- **Rate-limiting** the newly-exposed anon endpoints: `POST /api/library/search`, `/api/library/autocomplete`, and the now-PII-projected `/api/v1/lawyers`. A public FTS endpoint with hamza/digit folding is a cheap corpus-scraping vector. Add per-IP throttling + min-query-length + a hard `limit`/`page` clamp.
- **Zod / input validation** on every new POST/PUT body (notes `PUT`, folders `items` POST, search `POST`, profile edit `PATCH`) — especially a length cap on `note_text` and `strokes` jsonb (unbounded row size under RLS = storage abuse).
- **`next build` verification** for the new `useSearchParams` usages (consult/consultations) — Next 16 can force CSR bailout; confirm the build passes, not just tsc.
- **PDPL:** project `license_number` **only** inside the `show_contact` branch (never `SELECT` it for opted-out rows) rather than select-then-delete.

---

## 8. Product / UX decisions (owner call — not bugs)

The 26 `PRODUCT_UX` findings need **your** decision before any build. Full list in [`TEST_REVIEW_RECONCILIATION.md`](./TEST_REVIEW_RECONCILIATION.md) §6. Categories:

- **Flow shortcuts:** consultation type picker skip (CLIENT-2.2, CLIENT-4), contract draft/review routing (CLIENT-3.2).
- **Wizard inputs:** contract-review "for which party" (CLIENT-3.3), letter recipient dynamic options + "Other" (CLIENT-3.4), letter sender-capacity (CLIENT-3.5).
- **Feature ideas:** appeal-deadline calculator (LAWYER-3.2), calendar quick-add (LAWYER-3.1), smart-audio live recording (AI-2.1/AI-2).
- **Branding/content:** the placeholder "ن" logo (CLIENT-2.4), UX distinction between "التقييم الأولي" and "تحليل العقد" (CLIENT-3.7).
- **Scope confirm:** whether the legal library should appear in the **client** sidebar at all (CLIENT-2.5 — the tester assumed Pro-only; you may intend it public).

---

## 9. Acceptance, deploy & GitNexus mandate

- Per-spec acceptance criteria are in each §4 block. System-level: prod build ships **zero** demo switchers; a lawyer's contact PII is hidden unless opted-in; the AI tools show honest "قريباً" (or real output), never fabricated results; every seeded book resolves; library search returns matches beyond 200 rows with Arabic normalization; drafts/folders/notes survive a localStorage clear.
- **Deploy:** run the migrations (§3) on staging first via `deploy.sh` + `_verify.sql`; the FTS one needs a maintenance window.
- **GitNexus:** per `CLAUDE.md`, run `impact({target, direction:"upstream"})` before editing any symbol (each spec lists targets), and `detect_changes()` before each commit. The shared-file conflicts in §2 are exactly where scope-checking matters most.

*Provenance: 10-agent workflow (9 remediation specs + adversarial pass), ~1.67M tokens, all specs grounded in current source.*
