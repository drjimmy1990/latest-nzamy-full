# 02 — Auth / session audit (UAT-LIVE-SESSION-001, UAT-LIVE-CASE-001, UAT-LIVE-AI-001, UAT-ENV-001)

> Audit date 2026-09-20 against the owner's package `web/` (Next.js 16.3.3 App Router, `@supabase/ssr ^0.10.3`, `@supabase/supabase-js ^2.107.0`, no `auth-helpers`). Paths relative to `web/`.

**Scope note that changes everything below:** there is **no `middleware.ts`**. Next.js 16 renamed `middleware` → `proxy`; this project's live middleware is **`src/proxy.ts`** (511 lines). `src/lib/supabase/middleware.ts` is dead code (self-documented at `:8-10`).

The UAT ran against **`https://nezamy.sa`** (`evidence/uat-20260915/live-browser-lawyer.json:3`) — a deployed host — while UAT-ENV-001 is about the **local** dev server.

---

## 1. Supabase client construction

| File:line | Kind | Package | Cookies |
|---|---|---|---|
| `src/lib/supabase/client.ts:16-19` | browser | `@supabase/ssr` `createBrowserClient` | default (document.cookie) |
| `src/lib/supabase/server.ts:12-31` | server | `@supabase/ssr` `createServerClient` | `cookies()` + `getAll/setAll` |
| `src/lib/supabase/server.ts:42-51` | service-role | `supabase-js` `createClient` | none (`persistSession:false`) |
| `src/proxy.ts:155-171` | edge, API branch | `createServerClient` | `req.cookies.getAll` / `setAll` |
| `src/proxy.ts:248-267` | edge, page branch | `createServerClient` | same |
| `src/app/auth/callback/route.ts:78-97` | route handler | `createServerClient` | `cookies()` |
| `src/lib/supabase/middleware.ts:25-46` | **dead** | — | never called |

Browser client (`client.ts:15-20`) has no second argument: no `cookieOptions`, no `storage`, no `auth:{}`. Grep for `persistSession|storageKey|storage:|cookieOptions|cookieEncoding|detectSessionInUrl|autoRefreshToken|flowType` → only the service-role client (`server.ts:47-48`). **No `supabase-js` client is constructed in a client component.** ⇒ "browser stores the session in localStorage where the server can't read it" is ruled out. Env vars identical on both sides (`NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`); no cookie name/domain/path/sameSite/secure configured anywhere.

## 2. Middleware (`src/proxy.ts`)

Matcher `:500-511` runs on everything incl. `/api/*`.

**The master gate — `:131-132`:**
```ts
const BACKEND_MODE = process.env.NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND ?? "demo";
const isSupabaseMode = BACKEND_MODE === "supabase";
```
If that var is anything but `"supabase"`, the file falls through to `:486-497`:
```ts
// ─── Demo Mode: Cookie-based auth (legacy) ───
const isAuthenticated = req.cookies.has("nzamy_session") || req.cookies.has("nzamy_demo_role");
if (!isAuthenticated) { … loginUrl.searchParams.set("from", pathname); return NextResponse.redirect(loginUrl); }
```
A real Supabase login sets `sb-<ref>-auth-token*` cookies, never `nzamy_session`/`nzamy_demo_role` → a signed-in lawyer is redirected to `/login?from=/dashboard/lawyer` — byte-for-byte the string in `live-browser-lawyer.json:29-30`.

Protected page prefixes `:102-118`: `/dashboard`, `/ai/settings`, `/ai/vault`, `/ai/secretary`, `/ai/legal-opinion`, `/ai/fee-calculator`, `/ai/report-generator`, `/ai/tracker`, **`/ai/draft`**, **`/ai/direction-support`**, `/ai/contracts`, `/ai/wargaming`, `/settings`, `/notifications`, `/onboarding`.

Session refresh: `supabase.auth.getUser()` at `:272` (page) and `:172-174` (API). Cookie forwarding is the canonical `@supabase/ssr` double-write (`:252-264`, `:163-168`) — correct. Redirect decision `:274-280`: `if (!user) → /login?from=`. `:306-310` one `profiles` read per protected page request; `:392` **fails open** on a read error (40-line comment `:312-391`). Edge-level API 401 (`:175`) applies only to `PROTECTED_API_PREFIXES = ["/api/v1/lawyer/", "/api/v1/admin/", "/api/v1/firm/"]` (`src/lib/auth/routeAccess.ts:139-143`) — **`/api/v1/service-requests` is not in that list**, so the UAT's `Unauthorized` came from the handler (§3).

Demo/beta gates: `src/proxy.ts:488`; `src/lib/runtimeMode.ts:13-19`; `src/hooks/useUser.ts:414-415` (`nzamy_demo_role`, `nzamy_demo_key`); `src/lib/betaConfig.ts:40-80`; `src/lib/test-credentials.ts:18` (`TEST_PASSWORD = "Nzamy@2026"`); `src/lib/demo-accounts.ts`; `src/app/demo-login/page.tsx`.

Startup assertion `src/instrumentation.ts:9-24` throws if backend ≠ `"supabase"` — but `:12` `if (process.env.NEXT_RUNTIME !== 'nodejs') return;` and `:16` `if (NODE_ENV !== 'production') return;` ⇒ **edge/proxy runtime and every dev server are exempt**.

## 3. API route authentication

`POST /api/v1/service-requests` — `src/app/api/v1/service-requests/route.ts:244-253`:
```ts
const supabase = await createClient();
const { data: { user }, error: authError } = await supabase.auth.getUser();
if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); // :253
```
**That is the string the UAT saw.** `GET` identical at `:118-126`. `authError` and `!user` are collapsed: `getUser()` is a network round trip; a transport failure returns `{ user: null, error: AuthRetryableFetchError }` which this code reports as "not signed in".

Shared helpers: `src/lib/auth/assertRole.ts:19-58` (401 `:26-33`, 403 `:49-55` «غير مصرح — صلاحيات غير كافية»); `src/lib/access-control.ts:109-128` `requireAdmin()`. No `requireUser`/`withAuth` exists; most handlers inline the block.

`/api/v1/profile` (`route.ts`): RLS client only (no service client). GET `:117-126` (401 `:125`), reads `profiles` `:129-130`, `lawyer_profiles` `:183` with `roleProfileReadFailed` marker `:187`. PATCH `:286-295` (401 `:294`); writes `profiles.update` `:573`, `lawyer_profiles.update` `:587-588` (slug collision `:593-602`), entity settings metadata `:638`, `business_profiles` `:654`. Not atomic across tables (`:611`).

`/api/v1/settings` — GET and PUT only (no PATCH). PUT `:57-66`, allowlist `:71-83`, upsert `:93-97` (RLS client). Values unvalidated; Postgres errors leaked at `:100-103`.

## 4. Login flow
100% client-side: `src/app/login/page.tsx` (`"use client"`), `:34` `BACKEND_MODE … ?? "demo"`; `handleLogin()` `:169`: `:179` `if (BACKEND_MODE === "supabase")` → `:190-191` browser `signInWithPassword` → `:199-203` read `profiles.user_type` → `:206-207` `router.push(dest)` (client transition, no full document load). `:211-220` **demo fallback** `authenticateTest()` → `setDemoSession()`. Google: `/auth/callback` `exchangeCodeForSession` `:99` — correct.

Demo-session mechanism — `src/hooks/useUser.ts:476-486` `setDemoSession()` writes `localStorage["nzamy_demo_role"]` + cookie `nzamy_demo_role=true` (guarded `if (isSupabaseMode) return;` at `:481`); `readSessionFromStorage()` `:450-464` trusts `isLoggedIn: true` verbatim; `useUser()` branch at `:922-925` `isSupabaseMode ? initSupabase() : initDemo()` with `isSupabaseMode` from the same `?? "demo"` default (`:406-410`). **Whenever the client bundle's var is not exactly `"supabase"`, every dashboard considers the user logged in from a localStorage blob.**

How `/dashboard/*` decides "logged in": **no `src/app/dashboard/layout.tsx`**. `src/app/dashboard/lawyer/layout.tsx:31` → `<UserTypeGuard allowedTypes={["lawyer","firm","provider","admin"]}>` — client component (`src/components/dashboard/UserTypeGuard.tsx:17-68`, refusal «صلاحيات غير كافية» at `:53`), via `src/lib/auth/entityMembership.ts:32-42` `isAllowedByTypeOrMembership`. **No dashboard route is protected by a server component.**

Client-side demotion — `src/hooks/useUser.ts:689-692`: `resolvedUserType` not a DB type ⇒ `"individual"`. `readProfileUserType` `:644-664` returns `missing` when the row is absent, `unavailable` on error; `applyUser` `:772-799` carries the previous type forward only on `unavailable` (`:781-784`). A `missing` read silently demotes a lawyer to `individual`, which `UserTypeGuard` then refuses.

## 5. `/ai/direction-support`
The page has no guard of its own. The refusal comes from the route-group layout `src/app/ai/layout.tsx:114-117`: `LAWYER_AI_PREFIXES = ["/ai/collector","/ai/brief-check","/ai/direction-support","/ai/vault"]` → `<LawyerDashboardLayout>` → `UserTypeGuard`. Two ways a real lawyer fails it: (1) `userType === null` (guest, when browser `getUser()` returns nothing) — this block pre-empts the logged-out escape at `:147-149`, so an unauthenticated visitor gets "insufficient permissions" instead of a login redirect; (2) `userType === "individual"` via the demotion above. **Not a plan/tier problem**: `"ai:direction-support"` (`src/constants/lawyerAiCatalog.ts:17,192-193`) is in `LAWYER_AI_PERMISSION_KEYS`, spread into lawyer permissions at `useUser.ts:219`.

MOCK confirmation: `src/app/ai/direction-support/direction-support.data.ts`; imported at `page.tsx:21-23`; used at `:179-180, :417, :429, :441, :452, :455, :469, :580-605, :636-637, :667`. No fetch, no API call, no Supabase query — the only real I/O is `addToInbox(...)` at `:93`. Links: `src/app/dashboard/lawyer/_data/mockData.ts:105` (`badge: "جديد"`), `src/constants/navigation.sidebars.legal.ts:98` and `:336`, `src/constants/lawyerAiCatalog.ts:192-193`.

## 6. New-case form validation
Form `src/app/dashboard/lawyer/_components/AddCaseModal.tsx` (heading `:165`); openers `cases/page.tsx:441,725,971`, `lawyer/page.tsx:874,1373-1379`. Step 1→2 check `:229-246` (`if (!clientName.trim() || !title.trim()) setError(...)`) — button styled disabled but **no `disabled` attribute**. `handleSave()` `:95-150` re-validates only `userId` (`:98-101`). Empty title silently invented `:109` (`title.trim() || \`قضية — ${clientName.trim() || "عميل نظامي"}\``); empty client `:115`. Free-text `clientName` goes into `requester.name`; `lawyerClientId` only when a card was picked (`:123`). POST `:133-137` via `apiMutate("/api/v1/service-requests", …)`; error banner `:142-146`. Server: **no zod in the project**; `route.ts:315-316` `checkOrderIntake(metadata)` returns `pass` for non-AI cases (`intakeGuard.ts:36-37`); insert `:443-469` takes `title` verbatim (`:447`) with no non-empty/length check.

## 7. TLS
Zero matches in `web/` for `NODE_TLS_REJECT_UNAUTHORIZED|NODE_EXTRA_CA_CERTS|rejectUnauthorized|https.Agent|setGlobalDispatcher|undici|UNABLE_TO_VERIFY`. No CA handling, no hack either. `.env.example` has no TLS variable (Supabase block `:19-34`, backend mode `:48`). README says nothing about TLS. Only record: `00_دليل…md:19,66` — fix trust chain properly, never disable TLS.

## 8. Existing auth tests
No tests for `src/lib/supabase/` or `src/proxy.ts` (by design — `routeAccess.ts:5-8`). `src/lib/auth/*.test.ts`: `routeAccess` (17), `onboardingGate` (11), `userTypes` (~28), `accountTypeClaim` (~30), `entityMembership` (4), `serviceRequestEntityScope` (5), `firmMembershipAccess` (1) — all pure predicate tests. **Nothing touches cookies, `getUser()`, the `?? "demo"` default, the demo-session path, or transport-failure-vs-no-session.**

---

# Root-cause hypotheses ranked — UAT-LIVE-SESSION-001 (P0)
Symptoms: (A) client dashboard renders after login; (B) `POST /api/v1/service-requests` → `Unauthorized`; (C) direct navigation to `/ai/draft` and `/dashboard/lawyer` → `/login?from=…`.

### H1 — server-side `getUser()` cannot reach/validate against Supabase Auth, and every gate reads that failure as "not signed in" (most likely)
Sites collapsing transport failure into logged-out: `src/proxy.ts:272-280` (`error` not even destructured); `service-requests/route.ts:250-253`; `settings/route.ts:14,64`; `profile/route.ts:124,293`; `assertRole.ts:26-33`. Explains A+B+C with no extra assumptions; UAT-ENV-001 documents this exact failure mode in this stack; the repo ships zero CA/TLS configuration. Caveat: local failure surfaced as 500, live as 401+redirect — consistent if the live failure is a clean fetch rejection returned as `error`. Confirm by logging `authError` on the deployed host.
Fixes: (1) stop conflating — extract `resolveAuthOutcome(user, error) → "ok" | "anonymous" | "unavailable"`; on `unavailable` return **503** «تعذّر التحقق من الجلسة حالياً» (never 401) and in the proxy do not redirect; (2) provision the CA for the server runtime (`NODE_EXTRA_CA_CERTS`), document in `.env.example` + README; (3) startup/health probe that actually calls Supabase (`instrumentation.ts:26-34` only checks env presence).

### H2 — `NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND` ≠ `"supabase"` on the server/edge side, so `proxy.ts` runs its legacy demo branch
Produces the observed redirect string character for character. Five modules re-derive the flag with independent `?? "demo"` defaults (`proxy.ts:131`, `useUser.ts:406-410`, `lib/services/api.ts:15-18`, `login/page.tsx:34`, `runtimeMode.ts:13-14`). `instrumentation.ts:12,16` exempts edge and non-production. Does **not** explain B alone (service-requests is not `PROTECTED`). Both H1 and H2 may be true at once.
Fixes: delete the proxy demo branch (`:486-497`) and the `isSupabaseMode` conditionals at `:153`, `:245`; remove every `?? "demo"` default (single source in `runtimeMode.ts`, default `"supabase"`, throw on unknown value in production); assert at proxy module init.

### H3 — client-side "logged in" is structurally independent of any server-verifiable session
No server component gate; `useUser` reports `isLoggedIn: true` from localStorage; login ends in `router.push`. Fix: add `src/app/dashboard/layout.tsx` (async server component) calling `createClient()` → `getUser()` and `redirect("/login?from=…")` on a definitive `anonymous` (not on `unavailable`); after login, verify the server sees the session (a tiny `GET /api/v1/auth/session` handshake) before navigating, and navigate with a full load; delete the demo block (`useUser.ts:412-520`, marked `⚠️ DEMO BLOCK START — DELETE BEFORE PRODUCTION`), `test-credentials.ts`, `demo-accounts.ts`, `demo-login/page.tsx`.

### H4 — cookie never reaches the API origin (least likely)
`src/lib/services/api.ts:51-55` uses a relative path and no explicit `credentials` (same-origin default sends cookies). Would break only in the Capacitor shell or a host split (`nezamy.sa` vs `www.`). Fix if confirmed: `credentials: "same-origin"` explicit + `cache: "no-store"` on `apiMutate`; pin canonical host with a redirect.

# Fix list — the other three items

### UAT-LIVE-CASE-001
1. `AddCaseModal.tsx:229-246` — real `disabled={!clientName.trim() || !title.trim()}` on «التالي».
2. `AddCaseModal.tsx:95-101` — re-validate at submit.
3. `AddCaseModal.tsx:109,115` — **delete the silent fallbacks**.
4. `service-requests/route.ts` before insert `:443` — pure validator beside `src/lib/services/intakeGuard.ts` (house style, testable): `title` non-empty ≤ 200, `description` ≤ 5000, `requester` shape; 400 with Arabic copy.
5. Model the موكل properly: require a `lawyer_clients` pick or create the card, so `lawyer_client_id` (`route.ts:468`) is always populated.

### UAT-LIVE-AI-001
1. `src/app/ai/layout.tsx:114-117` — move the logged-out check above the `LAWYER_AI_PREFIXES` block (or have `UserTypeGuard` redirect to `/login` when `userType === null && !isLoggedIn`).
2. `src/hooks/useUser.ts:689-692` — stop demoting `missing` to `"individual"`; render an explicit "profile incomplete" state.
3. The page is a fixture. Either wire to a real search API or pull the links at `mockData.ts:105`, `navigation.sidebars.legal.ts:98,336`, `lawyerAiCatalog.ts:192-193` and show an honest «قريباً».

### UAT-ENV-001
1. `.env.example` + README run-book: `NODE_EXTRA_CA_CERTS=<path to the intercepting proxy's root CA>`; never `NODE_TLS_REJECT_UNAUTHORIZED=0`.
2. Re-run every server API test after the chain is trusted (contact form first).
3. Independently, H1 fix #1 so a TLS/egress failure surfaces as 503, never as 401/redirect — the change that stops this class of environment fault from being misdiagnosed as a session bug.

### Test debt
Pure `node --test` units for (a) `resolveAuthOutcome`, (b) a `backendMode` resolver that never defaults to `"demo"`.
