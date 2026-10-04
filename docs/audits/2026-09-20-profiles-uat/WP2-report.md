# WP-2 report — auth session → SSR/API, and protected-route integrity

**Branch:** merged into `master` as `9422165` (wave 1) · **Written:** 2026-09-20, after the fact
**Plan:** `docs/plans/PROFILES_COMPLETION_PLAN_2026-09-20.md` §WP-2 · **Appendix:** `02-auth-session-audit.md`
**Closes (code half):** UAT-LIVE-SESSION-001, UAT-ENV-001, part of UAT-LIVE-AI-001

> **What this is.** The WP-2 agent shipped eleven commits and no report; the independent review
> (`REVIEW-wave1-wp4-wp5.md` SHOULD FIX 6) recorded that as a gap against plan §6 — and MUST FIX 2, an
> item of WP-2 that was never built, is exactly the kind of omission a report declares. Reconstructed
> from the commits, their diffs and the plan. **Every `file:line` below is the line as it stands on
> the current branch** (post wave-2 merges and this fix pass), not as the commit wrote it. GitNexus
> MCP was unavailable to that agent; each commit body carries a hand-grepped blast radius instead.

## 1. What changed, per plan item

| # | Plan item | Verdict | Commits |
|---|---|---|---|
| 1 | `resolveAuthOutcome.ts`, pure + tested | **done** | `54c985c` |
| 2 | Apply it at every `getUser()` gate | **done** | `a80082e` |
| 3 | Kill the demo default (`runtimeMode.ts`) | **done except the health probe** | `1206975`, `41c1430`, `0df147a` |
| 4 | Server-component gate for dashboards | **done for `/dashboard` + `/settings`; NOT for `/ai/*`** | `33b04f1` |
| 5 | Login handshake + `/api/v1/auth/session` | **done** | `52c0763`, `ca66f1f`, `6c72b29` |
| 6 | `useUser` demotion, `ai/layout` ordering | **done** | `7692f8c` |
| 7 | Environment docs, `api.ts` fetch policy | **done, minus a README that does not exist** | `1b7565a` |
| 8 | Tests | **done** | across the above |

### Item 1 — a transport failure is not a signed-out user
`src/lib/auth/resolveAuthOutcome.ts` (79 lines, pure — no `next/server`, no Supabase, so the edge proxy, route handlers, server components and `node --test` all import it). `resolveAuthOutcome(user, error)` → `"ok" | "anonymous" | "unavailable"` (`:70`); `isTransportFailure` (`:53`) answers `unavailable` for `AuthRetryableFetchError`, for a missing or zero HTTP status (no status = no HTTP response), and for the `TRANSPORT_MESSAGE` family at `:49-50` (`fetch failed|ECONNREFUSED|ENOTFOUND|certificate|UNABLE_TO_VERIFY|network`). `AUTH_UNAVAILABLE_AR` at `:28`. A user object arriving **alongside** a stale error is `"ok"` (`:76`) — the old `authError || !user` answered that 401.

### Item 2 — the sweep
`if (authError || !user) → 401` appeared 88 times across 54 files in `src/app/api`, plus `assertRole()`, `requireAdmin()` and both proxy branches. `src/lib/auth/apiAuth.ts` holds the shared helper; every gate gained one line above its existing 401, which is otherwise **unchanged byte for byte** (53 `"Unauthorized"`, 24 «غير مصرح — يرجى تسجيل الدخول», 2 «غير مصرح») because clients read those strings. `assertRole.ts:29-30` returns the 503 before its 401 at `:38`; `access-control.ts:119` returns `{ error: AUTH_UNAVAILABLE_AR, status: 503 }`, which its 76 callers re-serve verbatim. `src/proxy.ts:210` is the API branch's 503; the page branch (`:343-353`) does **not** redirect — `console.error`, `x-nzamy-auth: unavailable` (`:351`), `NextResponse.next`. Deliberately not converted: the optional-auth reads that never gate (community/posts GET, ai-review-requests, leads/business-assessment, the seven `library/*` routes) — they serve guests, so there is no 401.

### Item 3 — one backend-mode derivation
`src/lib/runtimeMode.ts` is now the only reading of `NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND`, through the pure `resolveBackendMode(envValue, nodeEnv)`: unset ⇒ `"supabase"` (`:58`); demo only when the value is exactly `"demo"` **and** `NODE_ENV !== "production"` (`:69`); anything else throws at module load naming the value (`:62`). Seven local copies were replaced — `src/proxy.ts`, `src/hooks/useUser.ts`, `src/lib/services/api.ts`, `src/app/login/page.tsx`, `src/app/register/client/page.tsx`, `src/app/register/provider/page.tsx` (a sixth the audit's list of five missed) and `src/lib/clientWorkflowRepository.ts:30` (a seventh, spelled `=== "supabase"`, found later by `41c1430`; its three call sites had been reading and writing localStorage instead of `/api/v1/service-requests`). The legacy cookie branch survives but is gated at `src/proxy.ts:578` (`if (!isDemoMode) return NextResponse.next();`) — kept, not deleted, per owner decision Q6 and ground rule 3. `src/proxy.ts:149` throws at module load on a production build that is not `supabase`. `0df147a` is a self-caught regression: `api.ts` needs a **relative** `../runtimeMode.ts` specifier or `node --test` cannot resolve `@/`, which had silently killed 48 tests in four files.

### Item 4 — server gates
`src/components/auth/ServerSessionGate.tsx` (async server component): `anonymous` → `redirect()` (`:67-69`); `unavailable` → children under the Arabic banner `SESSION_UNAVAILABLE_BANNER_AR` (`:31`, rendered `:86`) — a dropped packet must not sign anyone out; `ok` → children untouched. Wired at `src/app/dashboard/layout.tsx:23` (a file that did not exist) and `src/app/settings/layout.tsx:24`. Next gives a server layout no way to read its own URL, so `src/proxy.ts:298` stamps `x-nzamy-pathname` on the **request** for protected pages only. **`/ai/*` got no server gate** — see §3.

### Item 5 — the login handshake
New `GET /api/v1/auth/session` (RLS client, never the service role; `force-dynamic` + `Cache-Control: no-store`, because a cached answer would tell the next visitor on a shared machine about the previous one's session). Its decision is the pure `sessionResponseFor(outcome, userId, profile)` in `src/lib/auth/sessionResponse.ts` — moved there by `ca66f1f` from the route's own `_shared.ts`, to the address the plan names and beside the other pure auth predicates. `src/app/login/page.tsx:207` fetches it with `credentials:"same-origin", cache:"no-store"`; 503 → Arabic message and stay (`:212`); 401 → Arabic message, stay, and log the cookie **names** only (`:227`, `document.cookie.split(";").map(c => c.split("=")[0].trim())` — never a value); 200 → `window.location.assign(dest)` (`:256`), a **full** document load so SSR and the proxy see the cookies.

### Item 6 — an incomplete profile is not a client account
`src/hooks/useUser.ts` no longer ends `mapSupabaseUser` with `: "individual"`. A signed-in user whose `profiles` read came back `missing` now carries `userType: null` + `profileState: "missing"` (`:785`, `:798`; the field is optional at `:145` so the ~6 other `UserSession` literals still compile). `unavailable` is deliberately **not** changed — a carried-forward type must survive a token refresh during an outage. `src/components/dashboard/UserTypeGuard.tsx:39` tests `isLoggedIn && profileState === "missing"` **before** the allowedTypes branch and renders «ملفك غير مكتمل» (`:51`) with a link to `/onboarding` (`:57`). `src/app/ai/layout.tsx:125-127` moves the logged-out escape **above** `LAWYER_AI_PREFIXES` (`:133`), so a guest on `/ai/direction-support` is no longer wrapped in the lawyer dashboard and told «صلاحيات غير كافية».

### Item 7 — environment
`.env.example:65` adds `NODE_EXTRA_CA_CERTS=` with the English and Arabic paragraphs (`:49-64`), including the explicit prohibition on `NODE_TLS_REJECT_UNAUTHORIZED=0` (`:51`, `:61`); section 2's WARNING, which described the demo fallback this WP removed, was rewritten to what the code now does. `src/lib/services/api.ts` makes the fetch policy explicit where every `/api/v1` call passes through: `apiGet` `:56-57`, `apiMutate` `:79-80`, both `credentials:"same-origin"` + `cache:"no-store"`. **Not done:** the plan's README «متطلبات التشغيل» paragraph — this worktree has no README, so the whole paragraph went into `.env.example` rather than inventing a run-book. Stated in `1b7565a`.

## 2. Verification that exists today

Unit only — nothing here has touched a live database or a browser.

* `src/lib/auth/resolveAuthOutcome.test.ts` — 9 tests, all three outcomes plus «user present alongside a stale error is still ok» and «the Arabic 503 copy is exactly the string the gates return».
* `src/lib/runtimeMode.test.ts` — 7 tests: «an unset backend variable resolves to supabase in every NODE_ENV», «"demo" is refused in a production build», «any value outside the vocabulary throws, in every NODE_ENV», «the throw names the offending value so a deploy log identifies the typo».
* `src/lib/auth/sessionResponse.test.ts` — 6 tests, incl. «a missing profile row answers userType null, not "individual"» and «ok without a user id degrades to 401 rather than reporting a session».
* `src/app/api/v1/auth/session/route.test.ts` — 4 source assertions the pure test cannot make: RLS client not the service role, `force-dynamic` + no-store, the decision path, the guarded profile read.
* `src/lib/auth/routeAccess.test.ts` — 17 tests; the proxy's "who is allowed where" tables were extracted here because `src/proxy.ts` imports `next/server` and cannot be unit-tested.
* `src/lib/auth/startupProbe.test.ts` — 7 tests, added by the fix pass with the probe itself (§4.4).
* Independent re-verification: `REVIEW-wave1-wp4-wp5.md` §C, checks C1–C8 — all **PASS**, including two regression sweeps (no 401 body text changed anywhere; `userType === "individual"` as a "signed in" proxy has 7 live sites and none regresses).

## 3. Proof still owed under the plan's *Proof to close*

None of it has been done. On staging with a real lawyer UAT account (the owner hands over the manual login): (a) login → dashboard; (b) reload; (c) direct URL `/dashboard/lawyer`, `/ai/draft`, `/settings`; (d) `GET /api/v1/profile` and `POST /api/v1/service-requests` with a valid case → 200 and the row exists; (e) **kill egress to Supabase from the server for 30 s** → the API returns 503 with the Arabic message and no redirect to `/login`; restore → works without re-login. Evidence: `evidence/uat-<date>/live-browser-lawyer.json` re-run plus a HAR of (d). Matrix rows `UAT-LIVE-SESSION-001` and `UAT-ENV-001`. Also still owed platform-wide: `npm run build` (plan ground rule 8), blocked in this environment by an absent `@next/swc-linux-x64-gnu` and a proxy 403 on the npm registry — reproducible on the unmerged baseline, so not attributable to this work.

## 4. Open risks

1. **Dev demo mode now needs `NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND=demo` explicitly.** Unset used to mean demo; it now means supabase. Any developer machine, CI job or script that relied on the old default silently switches to the real backend — and any value that is neither `demo` nor `supabase` (`""`, `Supabase`, a typo) now **throws at module load** rather than degrading. That is the intent, but it is a breaking change for anything outside this repo that sets the variable.
2. **New 503 clients must handle it.** `getUser()` gates that used to answer 401 now answer 503 with «تعذّر التحقق من الجلسة حالياً، حاول بعد قليل», and `requireAdmin()`'s 76 callers propagate it without an edit. Any caller — including the mobile app and any script — that branches only on `401` will treat a 503 as an unhandled failure. No 401 body text changed, so a client keying on the **message** is unaffected; a client keying on the **status** is not.
3. **`/ai/*` prefixes remain on the proxy gate only.** Item 4 deliberately stopped short: `src/app/ai/layout.tsx` is a `"use client"` component that picks one of eight dashboard layouts from `user.userType`, and a server parent means splitting it into a server shell plus a client child — a refactor outside this WP. `/ai/draft` and `/ai/direction-support` are in `src/proxy.ts`'s PROTECTED list, so the edge still redirects a guest, but there is **no server-component gate** on that route group the way `/dashboard` and `/settings` now have one.
4. **The startup health probe was missing and has since been added.** Plan item 3 also required a boot-time `GET ${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health` that logs loudly (not throws). `grep -n "health\|fetch" src/instrumentation.ts` returned zero hits — the one piece of WP-2 that surfaces the UAT-ENV-001 class **at boot** rather than as a 503 on the first visitor's first request. Recorded as MUST FIX 2 and built in this fix pass: `src/instrumentation.ts:61-88` (non-throwing, behind the same `NEXT_RUNTIME === 'nodejs'` + `NODE_ENV === 'production'` conditions as the env-var check above it, with a 5s abort so a blackholed connection cannot hang `register()`) and the pure `src/lib/auth/startupProbe.ts`. **It is still unproven against a real deployment** — nobody has yet seen either line in a boot log.
5. **The demo sources are dead code, not deleted code** (`useUser.ts`'s demo block, `test-credentials.ts`, `demo-accounts.ts`, `app/demo-login/page.tsx`). Ground rule 3 and owner decision Q6 both say keep them, and `isSupabaseMode` is an unconditional `true` in a production build, so they are unreachable there — but a reader may still mistake them for live paths.
