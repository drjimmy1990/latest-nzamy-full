# NZAMY — Production Fix Plan

> **Generated:** 2026-07-01 · **Owner:** engineering · **Scope:** everything required to take the current build to a **scoped beta production launch** (individual client + lawyer/firm + legal library), plus the hardening backlog for a full launch.
> **How this was produced:** a full production-readiness review (build gates + three parallel deep code reviews of library / client / lawyer, each finding **verified against the actual code**), followed by an 8-way parallel remediation analysis and an adversarial completeness pass. Every root cause below was confirmed in the current source — several contradict the "fixed" claims in `nzamy-audit-fix-status.md`, so trust this file over the older audit ledgers.
> **Trust note:** file:line references were accurate at generation time. Re-verify a symbol with GitNexus `context()`/`impact()` before editing it (see §14).

---

## 1. Executive summary & verdict

**🔴 Not ready for an open production launch. 🟡 A scoped beta launch is achievable after the fixes in §7 (blockers #1–#6 + infra).**

The good news: the app **compiles and builds clean**, the architecture is sound (real Supabase wiring, RLS as the security backstop, honest empty/not-found states in most places), and the intended launch is a **deliberately narrow beta** (single-firm "monopoly" mode — the multi-vendor marketplace is intentionally hidden), which removes a whole class of would-be blockers from launch scope.

The bad news: there is **one CRITICAL security hole** (an unauthenticated, service-role IDOR on service requests), the **flagship library search does not actually run** (dead endpoint + a 200-row client-side scan), the **paywall is bypassable on 3 of 4 content types**, and several surfaces **render fabricated data to real users** (every lawyer sees a fake profile with a false "verified" badge; group billing shows fake money owed; fake laws/folders leak into the library). None of these are acceptable in a paid legal product.

**Headline numbers:** 6 blockers + 5 HIGH items, all with verified remediations below. **~84 engineer-hours** for the coded fixes (§7), of which the client↔lawyer + library MVP path (§7.1–§7.7, excluding n8n) is **~58h (~1.5–2 weeks)**. The production-hardening backlog (§8: rate limiting, validation, monitoring, PDPL) is additional and mostly deferrable past the beta gate — but read §8 before shipping, because two of its items (storage-RLS audit, n8n inbound auth) touch security.

---

## 2. Build-gate status (verified this session)

| Gate | Command | Result |
|------|---------|--------|
| Type-check | `npx tsc --noEmit` | ✅ **0 errors** |
| Production build | `npx next build` | ✅ **exit 0** (compiled clean, ~18s) |
| Lint | `npx eslint .` | ❌ **BROKEN** — config references `react/no-unescaped-entities` but `eslint-plugin-react` is not installed → `npm run lint` fails entirely. CI depending on lint will fail. Fixed in §7.7. |
| Smoke test | `npm test` | ⏱️ Turbopack first-compile timeout — pre-existing env quirk, not a regression. |

---

## 3. Intended launch scope (this is a *beta*, not the full platform)

`src/lib/betaConfig.ts` sets, deliberately (decision dated 2026-05-17):

- `BETA_MONOPOLY_MODE = true` — **hides the multi-vendor marketplace / public lawyer directory**; only the Nzamy firm is offered as the provider.
- `BETA_REVIEW_MODE = true` — wraps lawyer/firm **AI outputs** in a "submitted for review" gate (QA before delivery).
- Micro / NGO / Government sectors exist in code but are **not promoted**.
- **Payments are gated `disabled`** via `platform_settings.payments_gateway` (no gateway chosen yet).

**Why this matters for the plan:** the mock *public lawyer directory* (`src/app/lawyers/browse`, `src/app/lawyers/[slug]`, `src/app/community/lawyers`), the un-mapped `getLawyers()` response, and `marketplace_visible` never being set to `true` are **intentionally-hidden future features**, not launch blockers — **provided those pages are actually unreachable in the beta navigation.** Confirming that (and gating them if reachable) is folded into §7.7. Do **not** spend beta effort wiring the multi-vendor directory.

**In launch scope:** individual/client dashboard, the lawyer/firm's *own* dashboard + profile, the legal library (public content + paywall), the client↔lawyer service-request flow, auth, and the payment *gate* (staying disabled).

---

## 4. Blocker & workstream summary

| § | Workstream | Blocker | Severity | Fix effort | Fix risk |
|---|-----------|---------|----------|-----------|----------|
| 7.1 | Security — client-workflow IDOR | #1 | **CRITICAL** | 5h | MED |
| 7.2 | Library search wiring + Arabic FTS normalization | #2 (+HIGH) | **HIGH** | 14h | MED |
| 7.3 | Library paywall bypass (decrees/precedents/books) | #3 | **HIGH** (revenue/integrity) | 3h | LOW |
| 7.4 | Library fake-content leaks + smart-folders backend | #6 (+HIGH) | **HIGH** | 14h | MED |
| 7.5 | Lawyer profile always-mock + false "verified" + read-only | #4 | **HIGH** | 6h | MED |
| 7.6 | Client my-group fake billing + consultation attachments + client mediums | #5 (+MED) | **HIGH** | 9h | MED |
| 7.7 | Infra — ESLint, middleware/role-gates, env + migration deploy assertions, beta posture | HIGH | **HIGH** | 7h | MED |
| 7.8 | n8n Section A — notifications (email/WhatsApp/reminders) | quality gap | MED | 26h | MED |

**Total coded fixes: ~84h.** MVP path (7.1–7.7): **~58h**. Adversarial review confirmed **all 6 blockers + all 5 HIGH items are covered by exactly one spec — nothing missed.**

---

## 5. Critical path & global sequencing

**Golden rules:** *migrations before the route edits that depend on them; security fixes before you expose any new surface.* The library search route (§7.2) must NOT be wired live until the IDOR (§7.1) and paywall (§7.3) are closed — otherwise you turn on a new content-enumeration surface while holes are open.

All 6 blockers + 5 HIGH items are each covered by exactly one spec; nothing missed. Coverage map: #1 client-workflow IDOR → Security spec; #2 search dead/200-cap + Arabic FTS → Library-search spec; #3 paywall bypass → Paywall spec; #4 lawyer-profile mock/false-verified → Profile spec; #5 my-group fabricated billing → Client-mediums spec (5.1); #6 fake laws + fake folders → Fake-content/folders spec. HIGH items: Arabic FTS→search spec; ESLint→infra spec; middleware/role-gates→infra spec; n8n notifications→n8n spec; consultation attachments→client-mediums spec (5.2). No overlaps, no orphans.

RECOMMENDED GLOBAL ORDERING (migrations before route edits; security before exposure):
1. Apply ALL new SQL migrations FIRST, in this order: (a) 20260701_client_workflow_rls_assert (independent, verifies existing RLS is live — run before repoint so you fail-closed), (b) 20260701_arabic_fts_normalization (heavy: drops/recreates fts columns + MV — do in a maintenance window), (c) 20260701_smart_folder_items_display_cols, (d) 20260701_n8n_notification_layer, (e) verify lawyer_profiles/profiles columns from 20260603/20260616/20260630 are already applied (profile + infra specs depend on them). Run infra spec's _verify.sql after.
2. SECURITY BEFORE FEATURE EXPOSURE: land spec #1 (client-workflow IDOR delete+repoint, single atomic commit) and spec #3 (paywall gating) BEFORE spec #2 wires the previously-dead search route to the server — search must not become a new way to enumerate content while the paywall/IDOR holes are open. Also land infra Step 2/3 (middleware + assertRole on /api/v1/lawyer/*) before or with these, since the middleware 401/redirect is a baseline gate.
3. Then feature specs: #2 search (Part A migration already done in step 1 → Part B routes + Part C frontend together), #4 profile (read path first to kill false-verified, write path after), #6 fake-content/folders (Step 2 migration already done → then route/UI wiring), #5 client-mediums (5.1 my-group gating first, then 5.2 attachments — but FIX the orphan-upload ordering: create request before upload).
4. n8n spec LAST: ship dispatchToN8n + trigger flip (inert while N8N_WEBHOOK_BASE_URL unset), then build n8n workflows, then set the env var as the go-live switch.

CROSS-SPEC FILE CONFLICTS: (i) src/app/laws/page.tsx is edited by BOTH spec #2 (adds server-search state + filtered* swaps + count badges) AND spec #6 (removes fake-laws fallback lines 379-403 + optional live counts). These MUST be coordinated into one page.tsx change-set or they will merge-conflict and the filtered* rewrites may collide. Sequence spec #6's fake-laws removal first, then spec #2's search wiring on top. (ii) src/app/api/v1/service-requests/[id]/route.ts is touched by spec #1 (repoint target, no edit) and n8n spec A3/A4 (optional inline dispatchToN8n) — n8n spec correctly recommends the DB-webhook route to avoid editing this high-blast handler; enforce that choice. (iii) lawsLibraryData.ts import swap (spec #6 Step 7) and demo-data-access are shared; ensure DEMO_PRECEDENTS export exists before the swap (spec claims it does at demo-data-access.ts:61 — verify).

BLOCKING DEPENDENCIES: profile + infra specs HARD-depend on 20260603/20260616/20260630 already being live in prod (unverified in this repo state — the git status shows unapplied-migration risk). Verify before shipping or role reads return null. The FTS migration (spec #2 Part A) is the single riskiest DDL (drops generated columns + MV) — stage it and confirm backfill row counts before flipping the frontend to server search."]

### Cross-spec file conflicts (must coordinate)

- **`src/app/laws/page.tsx`** is edited by **§7.4** (remove the inline fake-laws fallback) **and §7.2** (add server-search state). **Land §7.4's removal first, then §7.2's search wiring on top** — otherwise the `filtered*` rewrites collide.
- **`src/app/api/v1/service-requests/[id]/route.ts`** is the repoint *target* of §7.1 (no edit) and is *optionally* touched by n8n A3/A4. **Enforce the DB-webhook trigger option in §7.8** so this high-blast handler is not edited.
- **Folders**: §7.4 must migrate **both** `SmartFolders.tsx` and `FolderSelectionModal.tsx` atomically (partial migration = localStorage/API desync).

---

## 6. Migration inventory & apply order

Several fixes ship new SQL. Apply **all** new migrations **before** the route/UI edits that depend on them, in this order:

1. **Verify already-applied prerequisites are live in the target DB** (profile + infra specs hard-depend on these): `20260603_*`, `20260616_production_readiness_fixes.sql` (lawyer `is_accepting_clients`/`city` columns + marketplace RLS), `20260628_*`, `20260629_payments_and_storage_policies.sql`, and **`20260630_handle_new_user_sectors.sql` (flagged as NOT yet applied)**. If role-profile reads return `null`, these are missing. Run the §7.7 `_verify.sql`.
2. `20260701_client_workflow_rls_assert` (§7.1) — verifies the requester-scoped RLS is live *before* the repoint, so you fail closed.
3. `20260701_arabic_fts_normalization` (§7.2) — **the single riskiest DDL** (drops/recreates the `fts` generated columns + GIN indexes + cross-section MV). Do it in a maintenance window; confirm backfill row counts before flipping the frontend to server search.
4. `20260701_smart_folder_items_display_cols` (§7.4).
5. `20260701_n8n_notification_layer` (§7.8) — only when starting n8n work.

> **Add `npx supabase db push` to `deploy.sh`** (§7.7) so migrations apply automatically on every deploy — today `deploy.sh` only does git pull → npm install → build → pm2 restart.

---

## 7. Detailed remediation specs

Each spec below was produced from the **actual current code** and includes root cause (with file:line), exact proposed code/SQL, files touched, acceptance criteria, verification steps, ordering, and the GitNexus symbols to run `impact()` on first. **⚠️ Reviewer-correction callouts** (from the adversarial pass) amend the spec immediately below it — apply those amendments.

### §7.1 — Security — /api/client-workflow IDOR + service-role audit
_Effort: 5h · Fix-risk: MED_

### Fix client-workflow IDOR: retire service-role routes, repoint repository to authed /api/v1/service-requests

**Blocker refs:** #1 (client-workflow IDOR + service-role audit)  ·  **Severity:** CRITICAL  ·  **Effort:** 5h  ·  **Risk of fix:** MED

**Root cause** — `src/app/api/client-workflow/_supabase.ts` builds every REST call with the service-role key (bypasses RLS) and the routes do no auth or ownership check.

`_supabase.ts:20-28` — service-role bearer on all reads/writes:
```ts
function headers(extra?: HeadersInit): HeadersInit {
  return {
    apikey: serviceRoleKey ?? "",
    Authorization: `Bearer ${serviceRoleKey ?? ""}`,   // RLS bypassed
    ...
  };
}
```
`requests/route.ts:13-16` — caller-supplied identity, no `auth.getUser()`:
```ts
const requesterUserId = request.nextUrl.searchParams.get("requesterUserId") ?? undefined;
const requests = await listRequests({ receiver, requesterUserId });   // any id → any user's rows
```
`_supabase.ts:75-88` `listRequests` filters `requester_user_id=eq.${id}` from that query param → **horizontal IDOR read**. `requests/[id]/route.ts:12-14` PATCH takes an arbitrary `id` + `body.patch`, service-role, no ownership check → **IDOR write on any request**. POST (`_supabase.ts:102-107`) writes `requester_user_id` from client input → **request spoofing**. `insertRequest` also inserts `request_events` (`_supabase.ts:127-131`) and `payments` with a client-chosen actor/amount.

A correct, RLS-scoped twin already exists at `src/app/api/v1/service-requests/**` (`createClient()` + `auth.getUser()` + `.eq()` under RLS), consumed by `src/lib/services/workflowService.ts`. The vulnerable path is reached only through `src/lib/clientWorkflowRepository.ts`.

**Full service-role audit of `src/app/api`** — every route/module using the service role:

| Route / module | Gate present | Verdict |
|---|---|---|
| `client-workflow/_supabase.ts` (+ `requests/route.ts`, `requests/[id]/route.ts`) | none | **HOLE — this fix** |
| `client-pricing/route.ts` | none (read-only public catalog `audience=eq.individual&enabled=eq.true`; service-role only to skip RLS on a public seed table) | **Low-risk hole** — step 6 |
| `v1/service-requests/route.ts` | `auth.getUser()`; service-role used **only** for `payments` insert (no INSERT RLS) after auth | Justified |
| `v1/lawyer/finance/route.ts` | `auth.getUser()` ×2; service-role only for `payments` insert | Justified |
| `v1/admin/verifications/[id]/route.ts` | inline `auth.getUser()` + `profiles.user_type === "admin"` | Justified |
| `v1/admin/{verifications,credits,settings,stats,subscriptions,subscriptions/[id],users,users/[id]}` | inline `auth.getUser()` + admin check | Justified |
| `v1/admin/{corporates,erp,library,marketplace,teams}` | `requireAdmin()` shared gate (`src/lib/access-control.ts:101` → `auth.getUser()` + `user_type === "admin"`) | Justified |

Conclusion: **the only unauthenticated service-role holes are `client-workflow/*` (critical) and `client-pricing` (low, read-only public data).** All `v1/admin/*` are correctly role-gated; the zero-`auth.getUser` families use the `requireAdmin()` helper rather than an inline call. `v1/service-requests` and `v1/lawyer/finance` use service-role narrowly (payments-only) after auth.

**Recommendation: Option A (delete the routes, repoint the repository to the authed v1 path).** Rejected Option B (rewrite `client-workflow` to derive uid from session + RLS client) because it rebuilds logic that already exists and is tested in `v1/service-requests`; two parallel implementations of the same contract is the root risk. All 8 consumers of `clientWorkflowRepository` are client-side and requester-scoped (`listClientWorkflowRequests`, `createWorkflowRequest`, `updateWorkflowRequestById`) — none list by receiver — so the existing requester-RLS fully backs them, and this deletes the vulnerable surface rather than re-securing it.

**Remediation**

1. **Delete the vulnerable routes and module** (whole `src/app/api/client-workflow/` dir):
   - `rm src/app/api/client-workflow/requests/[id]/route.ts`
   - `rm src/app/api/client-workflow/requests/route.ts`
   - `rm src/app/api/client-workflow/_supabase.ts`

2. **Repoint `clientWorkflowRepository.ts` backend calls to `/api/v1/service-requests`**, adapting for two contract differences vs the old path: v1 wraps lists in `{ data: [...] }`, and v1 PATCH takes a flat `{...patch, auditEvent}` body (not `{ patch, auditEvent, by }`). v1 derives `requester_user_id` from the session, so drop `requesterUserId` from the outgoing query — RLS restricts results to the caller's rows. Mirror the shapes in `src/lib/services/workflowService.ts`.

   In `src/lib/clientWorkflowRepository.ts`, replace `listWorkflowRequests`, `createWorkflowRequest`, `updateWorkflowRequestById`:
   ```ts
   export async function listWorkflowRequests(options: WorkflowListOptions = {}): Promise<WorkflowRequest[]> {
     const localRequests = readWorkflowRequestsLocal()
       .filter((request) => !options.receiver || request.receiver === options.receiver)
       .filter((request) => !options.requesterUserId || request.requester.userId === options.requesterUserId);

     if (!BACKEND_ENABLED) return localRequests;
     try {
       // v1 derives the requester from the session (RLS-scoped); only `receiver`
       // is forwarded. The endpoint wraps rows in { data: [...] }.
       const params = new URLSearchParams();
       if (options.receiver) params.set("receiver", options.receiver);
       const query = params.toString();
       const res = await apiRequest<{ data: WorkflowRequest[] }>(
         `/api/v1/service-requests${query ? `?${query}` : ""}`,
       );
       return res.data ?? [];
     } catch {
       return localRequests;
     }
   }

   export async function createWorkflowRequest(input: WorkflowRequestInput): Promise<WorkflowRequest> {
     if (!BACKEND_ENABLED) return createWorkflowRequestLocal(input);
     // v1 sets requester_user_id = session user.id server-side; client input is ignored.
     const res = await apiRequest<{ data: WorkflowRequest }>("/api/v1/service-requests", {
       method: "POST",
       body: JSON.stringify(input),
     });
     dispatchWorkflowUpdate(res.data);
     return res.data;
   }

   export async function updateWorkflowRequestById(
     id: string,
     patch: WorkflowRequestPatch,
     auditEvent = "updated",
     by = "demo-user",
   ): Promise<WorkflowRequest | null> {
     if (!BACKEND_ENABLED) return updateWorkflowRequestLocal(id, patch, auditEvent, by);
     // v1 PATCH takes a flat { ...patch, auditEvent } body and enforces ownership
     // via RLS (participants-update policy). `by` is server-derived (session user).
     const res = await apiRequest<{ data: WorkflowRequest }>(
       `/api/v1/service-requests/${encodeURIComponent(id)}`,
       { method: "PATCH", body: JSON.stringify({ ...patch, auditEvent }) },
     );
     dispatchWorkflowUpdate(res.data);
     return res.data ?? null;
   }
   ```
   `appendWorkflowListParams` (lines 118-124) becomes dead once the query build is inlined — delete it. `listClientWorkflowRequests` / `listWorkflowRequestsByReceiver` are unchanged (they call `listWorkflowRequests`).

3. **`requesterUserId` note:** `listClientWorkflowRequests({ requesterUserId })` still filters the *local* fallback array by userId (unchanged) and applies a redundant post-filter (`clientWorkflowRepository.ts:141-144`); with the authed path the server already returns only the caller's rows, so that post-filter is a harmless no-op. Leave it.

4. **RLS backing (already present)** — `supabase/migrations/20260518_client_workflow_backend_ready.sql:148-177`:
   - `service_requests` SELECT: `requester_user_id = auth.uid() OR assigned_to = auth.uid()` (148-150)
   - `service_requests` INSERT: `with check (requester_user_id = auth.uid())` (152-154)
   - `service_requests` UPDATE: participants only (156-159)
   - `request_events` INSERT: participant-of-request check (171-177)

   No new policy is needed (no consumer lists by `receiver`). Add a defensive assert migration `supabase/migrations/20260701_client_workflow_rls_assert.sql` (mirrors the existing `do $ … raise exception` guard style) so a future migration can't silently drop these:
   ```sql
   -- 20260701_client_workflow_rls_assert.sql
   -- Assert RLS + ownership policies backing the retired client-workflow path
   -- remain in force after routes were repointed to /api/v1/service-requests.
   begin;

   do $
   begin
     if not (select relrowsecurity from pg_class where oid = 'public.service_requests'::regclass) then
       raise exception 'RLS not enabled on public.service_requests';
     end if;
     if not (select relrowsecurity from pg_class where oid = 'public.request_events'::regclass) then
       raise exception 'RLS not enabled on public.request_events';
     end if;
     if not exists (select 1 from pg_policies where schemaname='public' and tablename='service_requests' and cmd='INSERT') then
       raise exception 'service_requests INSERT policy missing';
     end if;
     if not exists (select 1 from pg_policies where schemaname='public' and tablename='service_requests' and cmd='UPDATE') then
       raise exception 'service_requests UPDATE policy missing';
     end if;
     if not exists (select 1 from pg_policies where schemaname='public' and tablename='request_events' and cmd='INSERT') then
       raise exception 'request_events INSERT policy missing';
     end if;
   end
   $;

   commit;
   ```

5. **Event-insert side:** deleting `_supabase.ts` removes the only place client-workflow inserted `request_events`/`payments` with a client-chosen actor. On the v1 path, events are written by `recordEvent(...)` with `actorUserId: user.id` (`v1/service-requests/route.ts:164-179`, `[id]/route.ts:138-143`) — actor is always the session user. No client-controlled `actor_user_id` remains.

6. **`client-pricing` (optional, follow-up):** read-only over a public `enabled=eq.true` seed table, so exposure is low, but it still ships the service-role key on an unauthenticated route. Switch it to the anon key + the existing `"public read enabled individual pricing"` policy (migration line 251). Do **not** bundle if it risks scope creep on this CRITICAL fix.

**Files touched**
- `src/app/api/client-workflow/requests/[id]/route.ts` (delete)
- `src/app/api/client-workflow/requests/route.ts` (delete)
- `src/app/api/client-workflow/_supabase.ts` (delete)
- `src/lib/clientWorkflowRepository.ts` (repoint 3 functions, drop `appendWorkflowListParams`)
- `supabase/migrations/20260701_client_workflow_rls_assert.sql` (new)

**Acceptance criteria**
- [ ] `src/app/api/client-workflow/` no longer exists; `grep -rn "client-workflow" src` returns no route references.
- [ ] `grep -rn "SUPABASE_SERVICE_ROLE_KEY" src/app/api` returns only `client-pricing/route.ts` (or nothing if step 6 done).
- [ ] Every remaining `createServiceClient()` / service-role call site is preceded by `auth.getUser()` or `requireAdmin()` (audit table above).
- [ ] `clientWorkflowRepository` backend calls hit `/api/v1/service-requests*`; no outgoing `requesterUserId` query param.
- [ ] Unauthenticated `GET /api/v1/service-requests?receiver=lawyer` returns 401.
- [ ] User A cannot read or PATCH User B's request (404/no-op), proven below.
- [ ] `npm run build` / `tsc` passes (response shape `{ data }` unwrapped correctly).
- [ ] All 8 client dashboard pages (see Ordering) still load and create/update requests.

**Verification steps**
1. Auth required: `curl -i https://<host>/api/v1/service-requests?receiver=lawyer` → `401 {"error":"Unauthorized"}`. Old path gone: `curl -i https://<host>/api/client-workflow/requests?requesterUserId=<anyUuid>` → `404`.
2. IDOR read closed: as User B (B's session cookie), `curl` GET `/api/v1/service-requests/<A_request_id>` → `404 Service request not found` (RLS hides it).
3. IDOR write closed: with B's cookie, `PATCH /api/v1/service-requests/<A_request_id>` body `{"status":"closed"}` → RLS `.eq` matches 0 rows, A's row unchanged. Confirm: `select status from service_requests where id='<A_request_id>';`.
4. Happy path: as User A, create from `dashboard/client/requests/new`, confirm it appears in `dashboard/client/requests`, PATCH status, confirm event actor: `select actor_user_id, event from request_events where request_id='<id>' order by created_at;` → `actor_user_id = <A.id>`.
5. Migration: apply `20260701_...sql` → succeeds; in a scratch DB `alter table service_requests disable row level security;` then re-run → must `raise exception`.

**Ordering / dependencies**
- Ship the `clientWorkflowRepository` repoint **and** route deletion in the same commit (deleting first would 404 the app until repoint lands).
- The RLS-assert migration is independent and may land first.
- Smoke-test after: `dashboard/client/consultation/new`, `consultation`, `consultation/[id]`, `contracts`, `find-lawyer`, `requests/new`, `requests`, and `requests/page.tsx` (only PATCH consumer).
- **RLS interaction:** correctness depends entirely on the `20260518` policies being live in the target DB. If never applied to prod, the authed path returns empty (GET)/errors (POST) instead of leaking — fail-closed — but verify the policies exist before shipping (the assert migration enforces this).

**GitNexus pre-edit** — run `impact({direction:"upstream"})` on: `listWorkflowRequests`, `createWorkflowRequest`, `updateWorkflowRequestById`, `listClientWorkflowRequests` (repository functions rewritten), and `insertRequest`, `patchRequest`, `listRequests`, `hasWorkflowBackendConfig` (symbols in the deleted `_supabase.ts` — confirm the only importers are the two route files being removed).

> **⚠️ Reviewer corrections for §7.1 (apply these):**
>
> - The rewrite REBUILDS fetch logic that already exists in src/lib/services/workflowService.ts (verified: line 28/40 already unwrap {data}, line 52 POSTs `input` directly, line 68 PATCHes `{...patch, auditEvent}`). The spec's new clientWorkflowRepository functions duplicate this verbatim. → Have clientWorkflowRepository delegate to workflowService (import listRequests/createRequest/updateRequest) instead of maintaining a second parallel /api/v1/service-requests client, eliminating the 'two parallel implementations' risk the spec itself cites as the root cause.
>
> - The spec asserts v1 PATCH 'takes a flat {...patch, auditEvent} body (NOT {patch, auditEvent, by})'. This is imprecise — the actual handler at service-requests/[id]/route.ts:111 does `const rawPatch = body.patch ?? body`, so it ACCEPTS BOTH the wrapped `{patch,...}` and flat shapes. The current clientWorkflowRepository PATCH body `{patch, auditEvent, by}` would therefore already work against v1 (it reads body.patch, skips auditEvent via keyMap '__skip__', ignores by). → The repoint still improves clarity, but the claimed hard incompatibility is false; note that no body-shape change is strictly required for PATCH, only the URL and requesterUserId removal.


---

### §7.2 — Library search wiring + Arabic FTS normalization
_Effort: 14h · Fix-risk: MED_

### Wire Library search to server + fix Arabic FTS normalization

**Blocker refs:** BLOCKER #2 (search route dead / only first 200 rows searched) + HIGH (FTS normalization regression: `library.arabic = copy=simple` does not fold hamza / taa-marbuta / Arabic-Indic digits)  ·  **Severity:** CRITICAL  ·  **Effort:** 14h  ·  **Risk of fix:** MED

**Root cause**

1. `/api/library/search` has **zero callers** (grep confirms only the route's own docstring references the path). The real UI (`src/app/laws/page.tsx`) never calls it. Instead it loads a capped page from `/api/library/init` and filters that page client-side:

`src/app/laws/page.tsx:212-214` — bounded init fetch:
```ts
fetch("/api/library/init")   // init caps each table at .range(from,to), default 100/max 200
```
`src/app/api/library/init/route.ts:11-14` — the cap:
```ts
const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "100",10)||100,1),200);
...
const to = from + limit - 1;   // .range(from,to) → at most 200 rows/table
```
`src/app/laws/page.tsx:530-534` — client-side "search" over only that page:
```ts
const filteredLaws = lawsList.filter(s => {
  const inCat = activeCat === "all" || s.cat === activeCat;
  const inQ   = !nq || normalizeArabic(s.title).includes(nq) || normalizeArabic(s.desc).includes(nq);
  return inCat && inQ;
});
```
So a query only ever matches within the first ≤200 laws/decrees/principles/books. Everything past the first page is invisible to search.

2. The Arabic FTS config folds nothing. `20260626_legal_library_schema.sql:37`:
```sql
execute 'create text search configuration library.arabic (copy = simple)';
```
`simple` lowercases + strips combining diacritics but does **not** fold hamza (`إ/أ/آ→ا`), alef-maqsura (`ى→ي`), taa-marbuta, or map Arabic-Indic digits (`١٤٤٤→1444`). The stored `fts` columns tokenize raw text (e.g. `20260626_legal_library_schema.sql:150-156` on `articles`), and both search routes pass the **raw** query to `plainto_tsquery('library.arabic', …)` (`search/route.ts:57` `const ftsQuery = parsed.raw;`, `autocomplete/route.ts:28` `const ftsQuery = query;`). Result: a user typing `الإثبات` cannot match seeded `الاثبات`, and `١٤٤٤` cannot match `1444`. The client `normalizeArabic` at `src/utils/normalizeArabic.ts:15` already does this folding, but it never reaches the SQL layer.

> **Generated-column constraint (must-address):** Postgres `GENERATED ALWAYS AS (…) STORED` may only reference **IMMUTABLE** functions, AND for `tsvector` generation the expression must itself be immutable. `to_tsvector(regconfig, text)` is only immutable in its 2-arg `regconfig`-literal form. Because we want the column expression to call our own `normalize_arabic_text(...)`, the whole expression stays immutable **only if** `normalize_arabic_text` is declared `IMMUTABLE`. That is achievable (pure regexp/translate). **However**, a subtler Postgres rule bites us: a generated column may not use a function that is later `CREATE OR REPLACE`d in a way that changes immutability, and Supabase migration replays can re-run `create or replace`. To stay robust and re-runnable we **switch `fts` from a GENERATED column to a plain `tsvector` column maintained by a BEFORE INSERT/UPDATE trigger** (mirrors the existing `library.handle_updated_at()` trigger pattern at `20260626_legal_library_schema.sql:48-58`). This sidesteps the "cannot drop function because generated column depends on it" lock entirely and lets us re-tokenize on backfill with a single `UPDATE`.

**Remediation**

**Part A — SQL migration (new file `supabase/migrations/20260701_arabic_fts_normalization.sql`).** Idempotent, `begin/commit`, patterns copied from `20260626_legal_library_schema.sql` (trigger style from `library.handle_updated_at`, GIN index style from §3).

```sql
-- =============================================================================
-- Arabic FTS normalization — IMMUTABLE folder + trigger-maintained fts columns
-- Fixes: hamza/alef-maqsura folding + Arabic-Indic digit mapping in library FTS.
-- Replaces GENERATED fts columns with trigger-maintained columns so the fts
-- expression can route through normalize_arabic_text() and be safely backfilled.
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
as $
  select
    translate(
      regexp_replace(
        translate(
          coalesce($1, ''),
          -- alef variants + alef-maqsura + taa-marbuta folding
          -- أ إ آ ٱ → ا ; ى → ي ; ة → ه ; ؤ → و ; ئ → ي
          'أإآٱىةؤئ',
          'اااايهوي'
        ),
        -- strip Arabic tashkeel (harakat) + tatweel U+0640
        '[ًٌٍَُِّْـٰ]',
        '',
        'g'
      ),
      -- Arabic-Indic ٠-٩ and Eastern/Persian ۰-۹ → 0-9
      '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
      '01234567890123456789'
    );
$;

comment on function library.normalize_arabic_text(text)
  is 'IMMUTABLE Arabic search normalizer: folds hamza/alef-maqsura/taa-marbuta, strips tashkeel+tatweel, maps Arabic-Indic + Persian digits to ASCII. Must mirror src/utils/normalizeArabic.ts.';

-- 2. Convert each GENERATED fts column to a trigger-maintained plain tsvector.
--    Drop the generated column (and its GIN index depends on it → recreate later),
--    then add a plain tsvector column. IF EXISTS guards make this re-runnable.

-- laws
drop index if exists library.idx_laws_fts;
alter table library.laws drop column if exists fts;
alter table library.laws add column if not exists fts tsvector;

-- articles
drop index if exists library.idx_articles_fts;
alter table library.articles drop column if exists fts;
alter table library.articles add column if not exists fts tsvector;

-- decrees_circulars
drop index if exists library.idx_decrees_circulars_fts;
alter table library.decrees_circulars drop column if exists fts;
alter table library.decrees_circulars add column if not exists fts tsvector;

-- principles
drop index if exists library.idx_principles_fts;
alter table library.principles drop column if exists fts;
alter table library.principles add column if not exists fts tsvector;

-- feqh_blocks
drop index if exists library.idx_feqh_blocks_fts;
alter table library.feqh_blocks drop column if exists fts;
alter table library.feqh_blocks add column if not exists fts tsvector;

-- NOTE: library.cross_section_search materialized view (schema §5) selects a.fts,
-- p.fts, dc.fts, fb.fts. Dropping those columns forces us to drop+recreate the MV.
drop materialized view if exists library.cross_section_search;

-- 3. Per-table BEFORE INSERT/UPDATE trigger functions.
--    Each mirrors the coalesce(...) field list from the original generated column.
create or replace function library.tsv_laws() returns trigger
language plpgsql immutable set search_path = '' as $
begin
  new.fts := to_tsvector('library.arabic',
    library.normalize_arabic_text(coalesce(new.title,'') || ' ' || coalesce(new.description,'')));
  return new;
end; $;

create or replace function library.tsv_articles() returns trigger
language plpgsql immutable set search_path = '' as $
begin
  new.fts := to_tsvector('library.arabic',
    library.normalize_arabic_text(
      coalesce(new.title,'') || ' ' || coalesce(new.text,'') || ' ' || coalesce(new.executive_reg_text,'')));
  return new;
end; $;

create or replace function library.tsv_decrees() returns trigger
language plpgsql immutable set search_path = '' as $
begin
  new.fts := to_tsvector('library.arabic',
    library.normalize_arabic_text(
      coalesce(new.title,'') || ' ' || coalesce(new.summary,'') || ' ' || coalesce(new.summary_brief,'')));
  return new;
end; $;

create or replace function library.tsv_principles() returns trigger
language plpgsql immutable set search_path = '' as $
begin
  new.fts := to_tsvector('library.arabic',
    library.normalize_arabic_text(
      coalesce(new.text,'') || ' ' || coalesce(new.ruling_basis,'') || ' ' ||
      coalesce(new.facts,'') || ' ' || coalesce(new.reasons,'') || ' ' || coalesce(new.ruling,'')));
  return new;
end; $;

create or replace function library.tsv_feqh_blocks() returns trigger
language plpgsql immutable set search_path = '' as $
begin
  new.fts := to_tsvector('library.arabic',
    library.normalize_arabic_text(
      coalesce(new.topic,'') || ' ' || coalesce(new.matn,'') || ' ' || coalesce(new.sharh,'')));
  return new;
end; $;

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
update library.laws             set title = title;
update library.articles         set title = title;
update library.decrees_circulars set title = title;
update library.principles       set text  = text;
update library.feqh_blocks      set topic = topic;

-- 6. Recreate GIN indexes (schema §3 pattern).
create index if not exists idx_laws_fts             on library.laws using gin (fts);
create index if not exists idx_articles_fts         on library.articles using gin (fts);
create index if not exists idx_decrees_circulars_fts on library.decrees_circulars using gin (fts);
create index if not exists idx_principles_fts       on library.principles using gin (fts);
create index if not exists idx_feqh_blocks_fts      on library.feqh_blocks using gin (fts);

-- 7. Recreate cross_section_search MV (verbatim from schema §5) + its indexes.
create materialized view if not exists library.cross_section_search as
select 'article'::text as entity_type, a.id::text as entity_id, l.title as parent_title,
       coalesce(a.title, 'مادة ' || a.number) as title, left(a.text,500) as snippet,
       a.fts as fts, a.created_at as created_at
from library.articles a join library.laws l on l.slug = a.law_slug
union all
select 'principle'::text, p.id::text, jc.title,
       'مبدأ رقم ' || coalesce(p.principle_number,''), left(p.text,500), p.fts, p.created_at
from library.principles p join library.judicial_collections jc on jc.id = p.collection_id
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

-- 8. Grant execute on the normalizer (search routes call it via RPC-free path;
--    grant anyway for parity with schema §7).
grant execute on function library.normalize_arabic_text(text) to anon, authenticated, service_role;

commit;
```

**Part B — normalize the query in both routes** so the query is folded the *same* way before `plainto_tsquery`. Use the existing `normalizeSearch` from `src/utils/normalizeArabic.ts` (it already folds hamza + digits, line 37-45).

`src/app/api/library/search/route.ts` — replace line 57:
```ts
// BEFORE: const ftsQuery = parsed.raw;
// Fold the query identically to the stored fts (normalize_arabic_text). normalizeSearch
// mirrors library.normalize_arabic_text: hamza/alef-maqsura folding + Arabic-Indic digits.
const ftsQuery = normalizeSearch(parsed.raw);
```
`normalizeSearch` is already imported (line 3: `import { parseSearchQuery, normalizeSearch } from '@/utils/normalizeArabic';`). Keep `parsed.plainTerms` for `truncateWithHighlight` unchanged.

`src/app/api/library/autocomplete/route.ts` — replace line 28 and add the import:
```ts
// add to imports (line 2 area):
import { normalizeSearch } from '@/utils/normalizeArabic';
// replace line 28:
// BEFORE: const ftsQuery = query;
const ftsQuery = normalizeSearch(query);
```

**Part C — wire the results grid in `laws/page.tsx` to `POST /api/library/search` with server pagination.** Response shape (from `search/route.ts:272-278`): `{ results, counts:{laws,precedents,orders,feqh}, total, page, query }`; params: `{ query, section, filters, sort, page, limit }` where `section ∈ 'all'|'laws'|'precedents'|'orders'|'feqh'`.

Add debounced server-search state alongside the existing autocomplete block (mirrors `fetchAutocomplete` at `laws/page.tsx:94-127`):
```ts
// --- Server-backed full search (BLOCKER #2 fix) ---
const [serverResults, setServerResults] = useState<any[]>([]);
const [serverCounts,  setServerCounts]  = useState<{laws:number;precedents:number;orders:number;feqh:number}>({laws:0,precedents:0,orders:0,feqh:0});
const [serverTotal,   setServerTotal]   = useState(0);
const [searchLoading, setSearchLoading] = useState(false);
const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const PAGE_SIZE = 10;

const sectionForType = (t: ContentType): 'all'|'laws'|'precedents'|'orders'|'feqh' =>
  t === "laws" ? "laws" : t === "precedents" ? "precedents"
  : t === "orders" ? "orders" : t === "feqh" ? "feqh" : "all";

const fetchServerSearch = useCallback(async (rawQ: string, type: ContentType, page: number) => {
  const q = rawQ.trim();
  if (q.length < 2) { setServerResults([]); setServerCounts({laws:0,precedents:0,orders:0,feqh:0}); setServerTotal(0); return; }
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
}, []);

// Debounced (300ms) — re-runs on query, active tab, or page change.
useEffect(() => {
  if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
  searchTimerRef.current = setTimeout(() => fetchServerSearch(search, activeType, precPage), 300);
  return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
}, [search, activeType, precPage, fetchServerSearch]);
```
Then make the tab lists prefer server results when a query is active, keeping the existing client `.includes` only as a **within-page refine** (do NOT drop it — it still powers category/track/issuer facets that the API `filters` are not yet fully wired to). Gate at the `filteredLaws`/`filteredOrders`/etc. sources. Example for laws (`laws/page.tsx:530-534`):
```ts
const usingServerSearch = nq.length >= 2;

// Map server rows → the shape LawsTabContent expects (title/slug/cat).
const serverLaws = serverResults
  .filter(r => r.section === "laws")
  .map(r => ({
    id: r.meta?.lawSlug || r.id, slug: r.meta?.lawSlug || r.id,
    title: r.title, desc: r.snippet, free: true, progress: 100,
    articlesCount: 0, cat: activeCat === "all" ? "SA-00" : activeCat,
    type: "laws", subType: "basic",
  }));

const filteredLaws = (usingServerSearch ? serverLaws : lawsList).filter(s => {
  const inCat = activeCat === "all" || s.cat === activeCat;
  // within-page refine only (server already applied FTS)
  const inQ   = usingServerSearch ? true
              : (!nq || normalizeArabic(s.title).includes(nq) || normalizeArabic(s.desc).includes(nq));
  return inCat && inQ;
});
```
Apply the same `usingServerSearch ? serverX : demoList` swap to `filteredPrinciples`, `filteredOrders`, `filteredFeqhBooks` (map each from `serverResults.filter(r => r.section === …)`). Feed `serverCounts`/`serverTotal` into the count badges (`laws/page.tsx:685-692`) so they show DB-wide totals instead of page-local `.length`. Add a pager control bound to `precPage`/`setPrecPage` (already exists, `laws/page.tsx:141`) shown when `usingServerSearch && serverTotal > PAGE_SIZE`, and reset `precPage` to 1 on query/tab change (the existing effect at `laws/page.tsx:147-151` already resets on `search`/`activeType`). Surface `searchLoading` next to the existing `dbLoading` spinner (`laws/page.tsx:942`).

> Keep the `/api/library/init` fetch for the non-search default browse (empty query) — only override the four `filtered*` sources when `usingServerSearch` is true.

**Files touched**
- `supabase/migrations/20260701_arabic_fts_normalization.sql` (new)
- `src/app/api/library/search/route.ts` (line 57)
- `src/app/api/library/autocomplete/route.ts` (line 2 import + line 28)
- `src/app/laws/page.tsx` (new server-search state/effect + `filtered*` swaps + count badges + pager)

**Acceptance criteria**
- [ ] `select library.normalize_arabic_text('الإثبات ١٤٤٤');` returns `الاثبات 1444`.
- [ ] `\df+ library.normalize_arabic_text` shows `Volatility = immutable`.
- [ ] All five `library.*.fts` columns are plain `tsvector` (not generated) with a `BEFORE INSERT OR UPDATE` trigger attached and a GIN index present.
- [ ] Searching `الإثبات` in the UI returns rows whose stored text is `الاثبات` (previously zero).
- [ ] A query matching a law/decree/principle beyond the first 200 seeded rows returns it (previously invisible).
- [ ] Count badges reflect DB-wide `total`, not the ≤200-row page.
- [ ] Empty/short (<2 char) query still shows the default `/api/library/init` browse grid unchanged.
- [ ] Autocomplete counts for `الإثبات` are non-zero.
- [ ] `next build` passes (no TS errors from new state).

**Verification steps**
- SQL: `psql -c "select library.normalize_arabic_text('أحكام الإثبات ٱلعامة ١٤٤٤');"` → expect `احكام الاثبات العامه 1444`.
- SQL FTS match: `select id,title from library.articles where fts @@ plainto_tsquery('library.arabic', library.normalize_arabic_text('الإثبات')) limit 5;` → non-empty when a stored `الاثبات` article exists.
- Route: `curl -s -X POST http://localhost:3000/api/library/search -H 'Content-Type: application/json' -d '{"query":"الإثبات","section":"laws","page":1,"limit":10}' | jq '.total,.results[0].title'` → `total > 0`.
- Autocomplete: `curl -s 'http://localhost:3000/api/library/autocomplete?q=%D8%A7%D9%84%D8%A5%D8%AB%D8%A8%D8%A7%D8%AA' | jq .counts` → non-zero.
- UI: open `/laws`, type `الإثبات`, confirm results grid populates from server (network tab shows `POST /api/library/search`), pager appears when `total>10`, and paging changes results.

**Ordering / dependencies**
- Run **Part A migration first** (it must complete before Part B/C are meaningful — routes query columns/config the migration rebuilds).
- Part B (route query normalization) and Part C (frontend wiring) can land together after A. Part C is inert without A because raw `الإثبات` still wouldn't match unnormalized `fts`.
- **RLS interaction:** all five content tables already have `Allow public read … to anon, authenticated using (true)` (`20260626_legal_library_schema.sql:770-797`); the search routes use the anon/user Supabase client, so no policy change needed. `normalize_arabic_text` is `set search_path=''` + schema-qualified (matches `handle_updated_at` hardening). The MV `cross_section_search` is not RLS-protected (MVs bypass RLS) — unchanged behavior, still only reachable via `service_role`/direct SQL, not the anon routes.
- After deploy, if seed loads run later, the triggers auto-populate `fts` — no manual `REFRESH` needed except for the MV (`select library.refresh_cross_section_search();`, schema §8).

**GitNexus pre-edit** — run `impact({target,direction:'upstream'})` before editing on: `normalizeSearch` and `normalizeArabic` (shared by `laws/[slug]`, `precedents/[slug]`, both search routes — confirm no other consumer breaks), `POST` (the search route handler) and `GET` (the autocomplete handler), and `LegalLibraryPage` (the `laws/page.tsx` default export) since the `filtered*` bindings feed `LawsTabContent`/`PrecedentsTabContent`/`OrdersTabContent`/`FeqhTabContent`.

> **⚠️ Reviewer corrections for §7.2 (apply these):**
>
> - search/route.ts:55-57 contains an EXISTING comment explicitly stating the raw query is passed intentionally ('pass the raw query, not the normalizeSearch-processed one... normalizeSearch is still applied client-side below for snippet highlighting'). The spec changes ftsQuery to normalizeSearch(parsed.raw) but does not remove/update this now-contradictory comment. → The spec MUST delete that misleading comment; leaving it will confuse the next reader into thinking raw is still deliberate. Also confirm the client-side normalizeSearch used for `truncateWithHighlight` still receives parsed.plainTerms, not the folded string, or highlight offsets will drift.


---

### §7.3 — Library paywall bypass on decrees/precedents/books (BLOCKER #3)
_Effort: 3h · Fix-risk: LOW_

### Fix library paywall bypass on decrees / precedents / books (per-item free-limit gating)
**Blocker refs:** #3  ·  **Severity:** CRITICAL  ·  **Effort:** 3h  ·  **Risk of fix:** LOW

**Root cause** — All three detail routes call `checkLibraryAccess(userId, slug, 0, type)` with a hardcoded `articleIndex` of `0`, then treat the single boolean `access.allowed` as a whole-document gate. Inside `checkLibraryAccess` (`src/lib/access-control.ts:215`) the free-tier branch is:

```ts
// src/lib/access-control.ts:214-215
const freeLimit = overrides[lawSlug] ?? globalFreeLimit; // default 5
const allowed = articleIndex < freeLimit;                // 0 < 5 → true, ALWAYS
```

So for a guest, `access.allowed === true` for the whole document and every child item is sent in full:

- `src/app/api/library/decrees/[id]/route.ts:34-35` → `hasAccess = access.allowed || access.isWhitelisted` (true) → all pages full (`route.ts:57-63`).
- `src/app/api/library/precedents/[slug]/route.ts:34-35` → same → all principles + paragraphs + details full (`route.ts:61-88`).
- `src/app/api/library/books/[slug]/route.ts:39,113` → `blockAllowed = access.allowed || access.isWhitelisted` (true) → all blocks full (`route.ts:112-124`).

The **correct** pattern is `src/app/api/library/laws/[slug]/route.ts:63-70`: call once at index 0 only to read `freeLimit`/`isWhitelisted`/`currentTier`, derive `hasFullAccess` from tier, tag each child with its own global index (`route.ts:75-89`), then in `formatArticleWithPaywall` (`route.ts:135-185`) lock per item: `isLocked = !hasFullAccess && freeLimit !== -1 && globalIndex >= freeLimit`, and **omit** full text/children for locked items server-side.

`checkLibraryAccess` needs **no signature change** — the bug is entirely in the call-sites. We keep calling it once at index 0 to obtain `{ freeLimit, isWhitelisted, currentTier }` and do the per-item comparison in the route (exactly as laws does). `access.allowed` must no longer be used as a document-level gate.

**Remediation** — For each of the 3 routes, replace the single-boolean gate with the laws pattern: (a) one access probe → `freeLimit`, `isWhitelisted`, `hasFullAccess`; (b) per-child index vs `freeLimit`; (c) locked items get truncated preview only, with full text/children/details stripped from the payload; (d) expose the same `paywall` metadata block the laws route exposes so the client can render lock UI. No new DB columns; no migration required (settings already exist in `platform_settings`; `checkLibraryAccess` already reads them).

Shared gating rule (mirrors `laws/[slug]/route.ts:142`):
```ts
const isLocked = !hasFullAccess && freeLimit !== -1 && itemIndex >= freeLimit;
```
where `hasFullAccess` is derived once (mirrors `laws/[slug]/route.ts:66-70`):
```ts
const probe = await checkLibraryAccess(userId, <id>, 0, <type>);
const isWhitelisted = probe.isWhitelisted;
const freeLimit = probe.freeLimit; // -1 = unlimited
const hasFullAccess =
  probe.currentTier === 'pro' || probe.currentTier === 'max' ||
  probe.currentTier === 'corp' || probe.currentTier === 'enterprise' ||
  isWhitelisted;
```

1. **decrees/[id]** — gate each page by its `page_number` order (0-based index). Replace lines 33-67:
```ts
    // Check library access (probe once → freeLimit/tier; gate per-page below)
    const probe = await checkLibraryAccess(userId, id, 0, "decrees");
    const isWhitelisted = probe.isWhitelisted;
    const freeLimit = probe.freeLimit; // -1 = unlimited
    const hasFullAccess =
      probe.currentTier === "pro" || probe.currentTier === "max" ||
      probe.currentTier === "corp" || probe.currentTier === "enterprise" ||
      isWhitelisted;

    // Fetch pages
    const { data: pages } = await supabase
      .schema('library')
      .from('decree_pages')
      .select('*')
      .eq('decree_id', id)
      .order('page_number', { ascending: true });

    // Format response matching frontend DemoOrder interface
    const response = {
      id: decree.id,
      title: decree.title,
      type: decree.type,
      issuer: decree.issuer,
      ref: decree.ref,
      date: decree.date,
      summary: decree.summary,
      summary_brief: decree.summary_brief,
      cat: decree.category,
      preamble: decree.preamble || '',
      paywall: {
        isWhitelisted,
        freeLimit,
        hasFullAccess,
        totalItems: pages?.length ?? 0,
      },
      articles: (pages || []).map((p: Record<string, unknown>, idx: number) => {
        const content = p.content as string;
        const isLocked = !hasFullAccess && freeLimit !== -1 && idx >= freeLimit;
        if (isLocked && typeof content === 'string') {
          return content.substring(0, 200) + (content.length > 200 ? '...' : '');
        }
        return content;
      }),
      // Number of pages the client may render in full (rest are locked previews)
      unlockedCount: hasFullAccess || freeLimit === -1 ? (pages?.length ?? 0) : Math.min(freeLimit, pages?.length ?? 0),
      hashtags: decree.hashtags || [],
      official_url: decree.official_url || '',
      hasAccess: hasFullAccess, // legacy field kept for existing client checks
    };

    return NextResponse.json(response);
```

2. **precedents/[slug]** — gate each principle by its `order_index` rank (0-based enumeration index). Locked principles: truncate `text`, drop paragraphs/details entirely (never sent). Replace lines 33-90:
```ts
    // Check library access (probe once → freeLimit/tier; gate per-principle below)
    const probe = await checkLibraryAccess(userId, slug, 0, "principles");
    const isWhitelisted = probe.isWhitelisted;
    const freeLimit = probe.freeLimit; // -1 = unlimited
    const hasFullAccess =
      probe.currentTier === "pro" || probe.currentTier === "max" ||
      probe.currentTier === "corp" || probe.currentTier === "enterprise" ||
      isWhitelisted;

    // Fetch principles with paragraphs
    const { data: principles } = await supabase
      .schema('library')
      .from('principles')
      .select(`
        *,
        principle_paragraphs (*)
      `)
      .eq('collection_id', slug)
      .order('order_index', { ascending: true });

    // Format response matching frontend interface
    const response = {
      id: collection.id,
      slug: collection.id,
      title: collection.title,
      court: collection.court,
      yearHijri: collection.year_hijri,
      part: collection.part,
      sourceId: collection.source_id,
      track: collection.track,
      description: collection.description,
      rulingCount: collection.ruling_count,
      free: collection.free,
      paywall: {
        isWhitelisted,
        freeLimit,
        hasFullAccess,
        totalItems: principles?.length ?? 0,
      },
      principles: (principles || []).map((p: Record<string, unknown>, idx: number) => {
        const isLocked = !hasFullAccess && freeLimit !== -1 && idx >= freeLimit;
        const paragraphs = p.principle_paragraphs as Record<string, unknown>[];
        const truncate = (val: unknown, len: number) =>
          typeof val === 'string'
            ? val.substring(0, len) + (val.length > len ? '...' : '')
            : val;
        return {
          id: p.id,
          number: p.principle_number,
          issuing_body: p.issuing_body,
          session_date: p.session_date,
          decision_number: p.decision_number,
          reference: p.reference,
          text: isLocked ? truncate(p.text, 150) : p.text,
          locked: isLocked,
          lockedMessage: isLocked ? 'يتطلب اشتراك Pro أو أعلى لعرض المبدأ كاملاً' : undefined,
          // Locked principles: paragraphs & details are withheld entirely
          paragraphs: isLocked
            ? []
            : (paragraphs || [])
                .sort((a, b) => (a.order_index as number) - (b.order_index as number))
                .map((pg) => ({
                  letter: pg.letter,
                  text: pg.text,
                  keywords: pg.keywords || [],
                })),
          details: isLocked ? null : {
            ruling_basis: p.ruling_basis,
            facts: p.facts,
            reasons: p.reasons,
            ruling: p.ruling,
          },
        };
      }),
      hasAccess: hasFullAccess, // legacy field kept for existing client checks
    };

    return NextResponse.json(response);
```

3. **books/[slug]** — gate each block by its **book-global** index. NOTE: this route is paginated (`route.ts:76-79`), so the per-page loop index `idx` is NOT the global block position — using it would re-unlock the first `freeLimit` blocks on every page. Use the query `offset` to compute the true global index. Replace lines 38-39 and lines 112-126:

At line 38-39 (probe):
```ts
    // Check library access (probe once → freeLimit/tier; gate per-block below)
    const probe = await checkLibraryAccess(userId, slug, 0, "feqh");
    const isWhitelisted = probe.isWhitelisted;
    const freeLimit = probe.freeLimit; // -1 = unlimited
    const hasFullAccess =
      probe.currentTier === "pro" || probe.currentTier === "max" ||
      probe.currentTier === "corp" || probe.currentTier === "enterprise" ||
      isWhitelisted;
```

At the `blocks` map (lines 112-126) — `offset` is already computed at `route.ts:76`:
```ts
      blocks: (blocks || []).map((b: Record<string, unknown>, idx: number) => {
        const globalIndex = offset + idx; // true position across pagination
        const isLocked = !hasFullAccess && freeLimit !== -1 && globalIndex >= freeLimit;
        return {
          id: b.id,
          topic: b.topic,
          vol: b.volume_number,
          page: b.page_number,
          matn: isLocked
            ? (typeof b.matn === 'string' ? b.matn.substring(0, 100) + (b.matn.length > 100 ? '...' : '') : b.matn)
            : b.matn,
          sharh: isLocked
            ? (typeof b.sharh === 'string' ? b.sharh.substring(0, 100) + (b.sharh.length > 100 ? '...' : '') : b.sharh)
            : b.sharh,
          hashiyah: isLocked ? null : b.hashiyah,
          sectionId: b.section_id,
          locked: isLocked,
        };
      }),
      paywall: {
        isWhitelisted,
        freeLimit,
        hasFullAccess,
        totalItems: totalBlocks || 0,
      },
      hasAccess: hasFullAccess, // legacy field kept for existing client checks
```
> Caveat for books: when `section_id` is passed (`route.ts:61-62`) blocks are filtered to one section, so `offset+idx` still reflects position within that filtered+ordered set, not book-global order. Given the free limit is meant as "first N blocks of the book", the section-filtered path should compute the block's book-global `order_index` if strict correctness is required. Minimum-viable fix uses `offset+idx` (correct for the default unfiltered TOC-order load, which is how the reader paginates); a follow-up can select `order_index` and gate on it directly if section-jump exposes unlocked deep blocks. Recommend gating on the block's own `order_index` value (already selected at `route.ts:56-59`) instead of positional index to make it pagination- and filter-independent: `const isLocked = !hasFullAccess && freeLimit !== -1 && (b.order_index as number) >= freeLimit;` — this is the safest form and eliminates the offset caveat entirely. Prefer this variant.

No migration required. If desired, a defensive idempotent seed to guarantee the free-limit setting exists (only add if `platform_settings.library_free_article_limit` may be missing — verify first; skip if present):
```sql
-- supabase/migrations/20260701_ensure_library_free_limit.sql
begin;
insert into public.platform_settings (key, value)
values ('library_free_article_limit', '{"default": 5}'::jsonb)
on conflict (key) do nothing;
commit;
```

**Files touched**
- `src/app/api/library/decrees/[id]/route.ts`
- `src/app/api/library/precedents/[slug]/route.ts`
- `src/app/api/library/books/[slug]/route.ts`
- (optional, only if setting missing) `supabase/migrations/20260701_ensure_library_free_limit.sql`
- No change to `src/lib/access-control.ts`.

**Acceptance criteria**
- [ ] Guest GET on a non-whitelisted decree returns full `content` for pages 0..freeLimit-1 and a ≤200-char truncated string (ending `...`) for every page at index ≥ freeLimit; `locked`/paywall metadata present.
- [ ] Guest GET on a non-whitelisted precedents collection returns full `text` only for principles 0..freeLimit-1; locked principles have truncated `text`, `paragraphs: []`, `details: null`, `locked: true`.
- [ ] Guest GET on a non-whitelisted feqh book returns full `matn`/`sharh` only for blocks whose `order_index < freeLimit`; locked blocks have truncated `matn`/`sharh`, `hashiyah: null`, `locked: true` — and this holds across all pagination pages and when `section_id` is supplied.
- [ ] Pro/max/corp/enterprise user gets every item in full (no truncation, no `locked: true`).
- [ ] Whitelisted item (in `library_whitelisted_laws.slugs` or `library_free_items[type]`) returns everything in full for guests.
- [ ] Locked full text/paragraphs/details/hashiyah are never present in the JSON payload (verified in raw response body, not just a flag).
- [ ] `checkLibraryAccess` unchanged; `next build` and `tsc` pass.

**Verification steps**
- Set `library_free_article_limit` default to 2 for a sharp boundary during testing.
- Decrees (guest, no cookie): `curl -s "$BASE/api/library/decrees/<id>" | jq '.articles | map(length)'` → first 2 long, rest ≤203. `jq '.paywall'` shows `hasFullAccess:false, freeLimit:2`.
- Precedents (guest): `curl -s "$BASE/api/library/precedents/<slug>" | jq '.principles | map({locked, paras: (.paragraphs|length), details})'` → index ≥2 all `locked:true, paras:0, details:null`.
- Books (guest): `curl -s "$BASE/api/library/books/<slug>?page=1&limit=1" | jq '.blocks[0].locked'` and `...?page=3&limit=1` → locked flips correctly per global `order_index`, not per page. Confirm `?section_id=<deep-section>` does not leak an unlocked deep block.
- Pro user (authenticated cookie): repeat all three → every item full, no `locked:true`.
- Grep the raw body to prove withholding: `curl -s "$BASE/api/library/precedents/<slug>" | jq -e '[.principles[] | select(.locked==true) | .details] | all(. == null)'` returns true.

**Ordering / dependencies**
- Independent of other blockers; can ship standalone. No RLS interaction: `checkLibraryAccess` uses `createServiceClient()` for settings/tier reads and the routes read `library.*` tables with the request-scoped client (unchanged). Because gating is now enforced in the route body before serialization, any existing permissive RLS on `library.*` read tables is irrelevant to the paywall — the server strips locked content regardless. Do this fix before any client-side lock-UI work so the client can rely on the new `paywall` block and per-item `locked` flags.

**GitNexus pre-edit** — run `impact({ target: "GET", direction: "upstream" })` is too broad; instead run impact on the shared dependency and each route module: `impact({ target: "checkLibraryAccess", direction: "upstream" })` (confirm the 3 routes + laws are the only call-sites and no signature drift), and `context({ name: "checkLibraryAccess" })`. Also `context({ name: "formatArticleWithPaywall" })` as the reference implementation. Then `detect_changes()` before commit to confirm only the 3 route modules changed.

> **⚠️ Reviewer corrections for §7.3 (apply these):**
>
> - hasFullAccess is derived as `currentTier === 'pro'||'max'||'corp'||'enterprise'` copying laws/[slug]/route.ts:66-70. Verified this MATCHES the reference — but note the ServerTier enum (access-control.ts:15) also has 'shield' and 'ai' tiers, and checkLibraryAccess already SHORT-CIRCUITS Pro+ at line 204 (tierRank>=TIER_RANK.pro) returning freeLimit:-1. So for a genuine Pro user, `probe.freeLimit` is already -1 and the string check is redundant-but-harmless. → Acceptable as-is (mirrors laws), but the more robust form is `probe.freeLimit === -1 || isWhitelisted` (freeLimit:-1 already encodes full access from the helper), which avoids the string list drifting from the enum. Recommend that simpler derivation.


---

### §7.4 — Library fake-content leaks + smart-folders backend
_Effort: 14h · Fix-risk: MED_

### Library fake-content leaks + smart-folders backend (real, DB-backed folders)
**Blocker refs:** #6 (fake library content) · folders-HIGH  ·  **Severity:** CRITICAL  ·  **Effort:** ~14h  ·  **Risk of fix:** MED

**Root cause**

1. **Inline fabricated-laws fallback bypasses the prod gate.** `src/app/laws/page.tsx:379-403` — when `dbLaws` is empty, `lawsList` falls back to a hardcoded array of 4 invented laws instead of `[]`. Every other list on the page (`ordersList:405-418`, `principlesList:420-432`, `booksList:440+`) correctly falls back to the `demo-data-access.ts`-gated `DEMO_*`, which returns `[]` in prod. Laws is the one leak:
   ```ts
   const lawsList = (dbLaws.length > 0
       ? dbLaws.filter(...).map(...)
       : [
           { id: "sys-1", slug: "civil-transactions", title: "نظام المعاملات المدنية", ... articlesCount: 720, ... },
           { id: "sys-2", slug: "commercial-courts", title: "نظام المحاكم التجارية", ... },
           { id: "sys-3", slug: "labor-law", ... },
           { id: "sys-4", slug: "companies-law", ... }
         ]) as any[];   // ← fabricated content shown in prod with no seed
   ```

2. **SmartFolders is localStorage-only, seeded with fake folders, never touches the API.** `src/app/laws/components/SmartFolders.tsx:42-56` unconditionally seeds `DEMO_FOLDERS` and persists to `localStorage("nzamy_smart_folders")`; all mutations (`handleCreate:110`, `handleDelete:73`, `handleToggleItemInModal:152`, etc.) only write localStorage + dispatch `nzamy_smart_folders_changed`. `FolderSelectionModal.tsx:52-78` reads/writes the same localStorage key. **No component calls `/api/library/folders`** (confirmed: the route has zero importers). So the authed backend is dead code.

3. **No item-add endpoint.** `src/app/api/library/folders/route.ts` has `GET`(9), `POST`(41, folder create), `PATCH`(81, folder edit), `DELETE`(123, folder OR item delete) — but **no way to INSERT a `smart_folder_items` row**. The feature is unreachable even if the UI were wired.

4. **Category counts computed from ungated demo arrays.** `src/constants/lawsLibraryData.ts:184-225` — `CAT_PRINCIPLES_COUNT`/`CAT_PRECEDENTS_COUNT`/`CAT_ORDERS_COUNT`/`CAT_FEQH_COUNT` and `catTotalCount()` reduce over the raw `DEMO_PRINCIPLES`/`DEMO_ORDERS` (imported from `@/app/laws/demo-data`, **not** the gated `demo-data-access`), and `CAT_LAWS_COUNT = {"SA-04": 1}` is hardcoded. In prod with no seed, category chips advertise counts for content that renders empty.

**Schema note (drives the design):** `library.smart_folder_items` (migration `20260626_legal_library_schema.sql:484-491`) is `(id, folder_id, entity_type, entity_id, created_at)` — it stores **no title/catId**. The client `LawRef` model (`SmartFolderTypes.ts:1-7`) needs `{slug, title, titleEn, catId, type}` to render. Two options: (A) hydrate titles client-side from `ALL_LIBRARY_DOCS`/DB on GET, or (B) add display columns to the table. Given the folder modals render Arabic titles for arbitrary DB laws (not just the 30 in `ALL_LIBRARY_DOCS`), **option B is required** — hydration would blank out titles for any law not in the static list.

---

**Remediation**

**Step 1 — Remove the inline fake-laws fallback (page.tsx).** Replace the `: [ …4 fake laws… ]` branch with `: []`. The page already renders an honest empty state for empty lists via `LawsTabContent`. Mirror `ordersList`'s gated pattern.

```ts
// src/app/laws/page.tsx  (replace lines 379-403)
const lawsList = (dbLaws.length > 0
    ? dbLaws
        .filter((law: any) => law.title !== "EXTRACTION_MEMORY")
        .map((law: any) => ({
          id: law.slug,
          slug: law.slug,
          title: law.title,
          titleEn: law.title_en || "",
          desc: law.description || "",
          descEn: law.description_en || "",
          free: true,
          progress: 100,
          articlesCount: law.total_articles || 0,
          chaptersCount: 0,
          lastUpdated: law.issue_date_hijri || "—",
          cat: classifyLawCategory(law),
          type: "laws",
          subType: "basic",
        }))
    : []) as any[];   // honest empty state; no fabricated laws in prod
```
(Optional, to keep dev parity with the other lists: import a gated `DEMO_LAWS` from `demo-data-access.ts` and use `: DEMO_LAWS`. If you add it, define `DEMO_LAWS` in `demo-data.ts` from the 4 objects above and export it gated exactly like `DEMO_ORDERS` at `demo-data-access.ts:66`. Empty array `[]` is the safer minimum and is what this spec verifies.)

**Step 2 — Migration: add display columns to `smart_folder_items`.** Idempotent, so it is safe on the already-applied `20260626` schema. Pattern copied from the additive column style in existing migrations. Suggested filename: `supabase/migrations/20260701_smart_folder_items_display_cols.sql`.

```sql
-- supabase/migrations/20260701_smart_folder_items_display_cols.sql
-- Adds display metadata to library.smart_folder_items so folders can render
-- titles/category without a second lookup. RLS already governs the table
-- (see 20260626_legal_library_schema.sql §6d). Additive + idempotent.
begin;

alter table library.smart_folder_items
  add column if not exists title      text,
  add column if not exists title_en   text,
  add column if not exists cat_id      varchar(30);

-- Prevent duplicate saves of the same entity into the same folder.
create unique index if not exists uq_smart_folder_items_folder_entity
  on library.smart_folder_items (folder_id, entity_type, entity_id);

comment on column library.smart_folder_items.title    is 'Denormalized Arabic display title (rendered in folder UI).';
comment on column library.smart_folder_items.title_en is 'Denormalized English display title.';
comment on column library.smart_folder_items.cat_id   is 'Denormalized taxonomy category id (e.g. SA-04).';

commit;
```

**Step 3 — Add the missing `smart_folder_items` INSERT handler.** Add a `POST` to a **nested route** so it does not collide with the existing folder-create `POST`. Create `src/app/api/library/folders/items/route.ts`. Auth + ownership mirror the existing DELETE-item ownership check (`route.ts:138-169`). RLS `"Users can add to own folders"` (`20260626_…:841-848`) already enforces ownership as defense-in-depth; the explicit check gives a clean 403.

```ts
// src/app/api/library/folders/items/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/** POST /api/library/folders/items — add one item to a user-owned folder */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { folderId, entityType, entityId, title, titleEn, catId } = body;

    if (!folderId || !entityType || !entityId) {
      return NextResponse.json(
        { error: 'folderId, entityType and entityId are required' },
        { status: 400 },
      );
    }

    // Ownership guard (mirrors DELETE-item check at folders/route.ts:155-169)
    const { data: ownerFolder, error: folderError } = await supabase
      .schema('library')
      .from('smart_folders')
      .select('id')
      .eq('id', folderId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (folderError) {
      console.error('[Folder Items POST] Ownership check error:', folderError);
      return NextResponse.json({ error: 'Failed to add item' }, { status: 500 });
    }
    if (!ownerFolder) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Upsert on (folder_id, entity_type, entity_id) — idempotent add
    const { data: item, error } = await supabase
      .schema('library')
      .from('smart_folder_items')
      .upsert(
        {
          folder_id: folderId,
          entity_type: entityType,
          entity_id: entityId,
          title: title ?? null,
          title_en: titleEn ?? null,
          cat_id: catId ?? null,
        },
        { onConflict: 'folder_id,entity_type,entity_id' },
      )
      .select()
      .single();

    if (error) {
      console.error('[Folder Items POST] Error:', error);
      return NextResponse.json({ error: 'Failed to add item' }, { status: 500 });
    }

    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    console.error('[Folder Items POST] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

**Step 4 — Update GET to return display columns and shape folders for the client.** Extend the existing select at `folders/route.ts:19-27` so hydration is unnecessary:

```ts
// src/app/api/library/folders/route.ts  (GET select, replace lines 19-27)
const { data: folders, error } = await supabase
  .schema('library')
  .from('smart_folders')
  .select(`
    id, name, color, icon, created_at, updated_at,
    smart_folder_items ( id, entity_type, entity_id, title, title_en, cat_id, created_at )
  `)
  .eq('user_id', user.id)
  .order('created_at', { ascending: false });
```

**Step 5 — Wire SmartFolders to the API (replace localStorage).** In `SmartFolders.tsx`, gate `useUser()` and load from `/api/library/folders`; on mutations call the API, then refetch. Map DB rows ↔ the `SmartFolder` client model. Keep `DEMO_FOLDERS` only behind the existing prod gate for logged-out/dev. Add a mapper + replace the mount effect (`lines 42-56`) and the four mutation handlers:

```ts
// SmartFolders.tsx — add near top of component
import { useUser } from "@/hooks/useUser";
const { isLoggedIn } = useUser();

// map a folder type → entity_type stored in DB
const ENTITY_TYPE: Record<string, string> = {
  law: "article", precedent: "principle", order: "decree", book: "feqh_block",
};
const toClientFolder = (f: any): SmartFolder => ({
  id: f.id, name: f.name, nameEn: f.name, color: f.color || "#C8A762",
  icon: (f.icon as any) || "default", isDefault: false, isPinned: false,
  lastModified: new Date(f.updated_at || f.created_at).getTime(),
  laws: (f.smart_folder_items || []).map((it: any) => ({
    slug: it.entity_id, title: it.title || it.entity_id,
    titleEn: it.title_en || it.title || it.entity_id, catId: it.cat_id || "SA-00",
    type: (Object.keys(ENTITY_TYPE).find(k => ENTITY_TYPE[k] === it.entity_type) as any) || "law",
    _itemId: it.id,  // needed for DELETE by itemId
  })),
});

const refetchFolders = useCallback(async () => {
  const res = await fetch("/api/library/folders");
  if (!res.ok) { setFolders([]); return; }
  const { folders } = await res.json();
  setFolders((folders || []).map(toClientFolder));
}, []);

useEffect(() => {
  if (!isLoggedIn) {
    // logged-out: gated demo in dev, empty in prod (mirrors demo-data-access.ts gate)
    const demo = process.env.NEXT_PUBLIC_LIB_DEMO_FALLBACK === "1"
      || process.env.NODE_ENV !== "production";
    setFolders(demo ? DEMO_FOLDERS : []);
    setIsMounted(true);
    return;
  }
  refetchFolders().finally(() => setIsMounted(true));
}, [isLoggedIn, refetchFolders]);
```

Rewrite the mutation handlers to hit the API then `refetchFolders()` (example — `handleCreate` and item-toggle; apply the same shape to `handleDelete`/`handleRename`/`handleColorChange`):

```ts
const handleCreate = useCallback(async (name: string, color: string) => {
  await fetch("/api/library/folders", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, color, icon: "default" }),
  });
  await refetchFolders();
  setIsCreating(false);
}, [refetchFolders]);

const handleToggleItemInModal = async (doc: LibraryDoc) => {
  if (!managingFolder) return;
  const existing = managingFolder.laws.find(
    (i: any) => i.slug === doc.slug && (i.type || "law") === doc.type);
  if (existing && (existing as any)._itemId) {
    await fetch(`/api/library/folders?itemId=${(existing as any)._itemId}`, { method: "DELETE" });
  } else {
    await fetch("/api/library/folders/items", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        folderId: managingFolder.id, entityType: ENTITY_TYPE[doc.type] || "article",
        entityId: doc.slug, title: doc.title, titleEn: doc.titleEn, catId: doc.catId,
      }),
    });
  }
  await refetchFolders();
};
```

`handleDelete(id)` → `DELETE /api/library/folders?folderId=${id}` then refetch. `handleRename`/`handleColorChange` → `PATCH /api/library/folders` with `{folderId, name|color}` then refetch. Remove every `localStorage.setItem("nzamy_smart_folders", …)` and the `nzamy_smart_folders_changed` dispatch chain (or keep the event for cross-component sync but have `FolderSelectionModal.tsx` also fetch from the API identically). `handleTogglePin` has no DB column — either drop pin UI or add an `is_pinned boolean` column in Step 2's migration (recommend dropping for this pass; note as follow-up).

**Step 6 — Apply the same API wiring to `FolderSelectionModal.tsx`** (`src/components/laws/FolderSelectionModal.tsx:52-149`) — it duplicates the localStorage logic (`updateFoldersState:74`, `handleToggleFolder:97`, `handleCreateFolder:133`). Replace with the same fetch calls so the two modals stay consistent.

**Step 7 — Route category counts through DB.** In `lawsLibraryData.ts`, the counts (`184-225`) must not reduce over raw demo arrays for prod. Two acceptable fixes:
- Minimal: import from the **gated** module — change `lawsLibraryData.ts:5-10` from `@/app/laws/demo-data` to `@/app/laws/demo-data-access`, so in prod the reduces produce `{}` and chips show `0`. Also change `CAT_LAWS_COUNT` from the hardcoded `{"SA-04": 1}` to `{}`.
- Better: convert `catTotalCount()` to accept live DB counts. Have `page.tsx` compute per-category tallies from `dbLaws`/`dbDecrees`/`dbPrinciples`/`dbBooks` (using `classifyLawCategory` for laws) and pass them into the count helpers, falling back to the gated demo arrays when DB is empty. Given effort, ship the minimal gated-import fix now and file the live-count version as follow-up.

```ts
// src/constants/lawsLibraryData.ts:5-10  — swap ungated import for gated
import {
  DEMO_PRINCIPLES, DEMO_PRECEDENTS, DEMO_ORDERS,
  type PrincipleSubject, type PrincipleSourceId,
} from "@/app/laws/demo-data-access";   // gated: [] in prod unless NEXT_PUBLIC_LIB_DEMO_FALLBACK=1
// and:
export const CAT_LAWS_COUNT: Record<string, number> = {};  // no hardcoded fake count
```
Note: `demo-data-access.ts` currently re-exports the taxonomy types (`21-30`) and the gated arrays; `DEMO_PRECEDENTS` is already exported there (`61`), so the swap compiles.

---

**Files touched**
- `src/app/laws/page.tsx` (remove fake-laws fallback; optional live category counts)
- `src/app/api/library/folders/route.ts` (GET select adds display cols)
- `src/app/api/library/folders/items/route.ts` (**new** — item-add POST)
- `src/app/laws/components/SmartFolders.tsx` (wire to API, gate demo)
- `src/components/laws/FolderSelectionModal.tsx` (wire to API, gate demo)
- `src/constants/lawsLibraryData.ts` (gated demo import; `CAT_LAWS_COUNT = {}`)
- `supabase/migrations/20260701_smart_folder_items_display_cols.sql` (**new**)

**Acceptance criteria**
- [ ] In prod (`NODE_ENV=production`, `NEXT_PUBLIC_LIB_DEMO_FALLBACK` unset) with empty `library.laws`, the laws tab shows the empty state — no "نظام المعاملات المدنية / 720 مادة" or the other 3 fabricated laws anywhere in the DOM.
- [ ] `grep -n "sys-1" src/app/laws/page.tsx` returns nothing.
- [ ] A logged-in user can create a folder, add a law/order/precedent/book to it, reload, and the folder + items persist (served from `library.smart_folders`/`smart_folder_items`, not localStorage).
- [ ] `POST /api/library/folders/items` returns 401 unauthenticated, 403 for a folder the caller doesn't own, 201 on success, and is idempotent (second identical add does not create a duplicate row).
- [ ] Removing an item via the modal deletes the `smart_folder_items` row (verified by row count).
- [ ] In prod with no seed, category count chips read `0` (not demo-derived numbers); `CAT_LAWS_COUNT` no longer hardcodes `{"SA-04":1}`.
- [ ] Logged-out prod users see zero folders (no `DEMO_FOLDERS`); dev/`FALLBACK=1` still shows demo folders.
- [ ] `next build` passes with no type errors (LawRef `_itemId` addition is optional/typed).

**Verification steps**
- Fake laws: `NODE_ENV=production next build && next start`, load `/laws` against an empty `library.laws`, confirm empty state (also `curl -s localhost:3000/laws | grep -c "المعاملات المدنية"` → `0`).
- Item-add API (authed cookie in `$C`):
  ```bash
  # create folder
  curl -s -X POST localhost:3000/api/library/folders -H "Content-Type: application/json" \
       -b "$C" -d '{"name":"اختبار","color":"#10b981"}'   # → {folder:{id:...}}
  # add item
  curl -s -X POST localhost:3000/api/library/folders/items -H "Content-Type: application/json" \
       -b "$C" -d '{"folderId":"<id>","entityType":"article","entityId":"companies-law","title":"نظام الشركات","catId":"SA-04"}'  # → 201
  # duplicate add → still 201, no new row
  curl -s localhost:3000/api/library/folders -b "$C"       # item present once
  ```
- IDOR: repeat item-add with another user's `folderId` → expect `403`.
- RLS/SQL: `select count(*) from library.smart_folder_items where folder_id = '<id>';` before/after add and delete.
- UI: log in, create folder in `/laws` SmartFolders, add items via the modal, hard-reload → folder+items still present; open in a second browser/user → not visible.
- Counts: in prod build, inspect a category chip badge → `0` when unseeded.

**Ordering / dependencies**
- Apply the **migration (Step 2) first** — Steps 3/4/5 write/read the new columns; running the item-add handler before the migration will 500 on unknown columns.
- Steps 1, 6, 7 are independent of the migration and can land in parallel.
- RLS: `smart_folder_items` policies (`20260626_…:832-857`) already gate INSERT/SELECT/DELETE via folder ownership; the new columns inherit table RLS (no new policy needed). The API's explicit ownership check is defense-in-depth and returns a clean 403 before RLS would silently no-op the insert.
- After wiring, do a one-time note in release docs that existing `localStorage("nzamy_smart_folders")` data is **not** migrated (acceptable — it was demo/local only).

**GitNexus pre-edit** — run `impact({target, direction:'upstream'})` before editing:
- `SmartFolders` (default export — consumed by `laws/page.tsx`, `laws/orders/[slug]/page.tsx`; re-exports `ALL_LIBRARY_DOCS`/`DEMO_FOLDERS`/`SmartFolder` used by `FolderSelectionModal.tsx`)
- `classifyLawCategory` (used by `page.tsx` lawsList and referenced in `lawsLibraryData.ts`)
- `catTotalCount` and `CAT_LAWS_COUNT` / `CAT_PRINCIPLES_COUNT` / `CAT_ORDERS_COUNT` (consumed by `page.tsx` category tabs)
- `GET`/`POST`/`DELETE` handlers in `api/library/folders/route.ts` (route-level; verify no other importers before adding the nested `items` route)
- `LawRef` type (adding optional `_itemId`) — check all `SmartFolderTypes` consumers.

> **⚠️ Reviewer corrections for §7.4 (apply these):**
>
> - The client demo gate uses `process.env.NEXT_PUBLIC_LIB_DEMO_FALLBACK === '1' || process.env.NODE_ENV !== 'production'`. NODE_ENV is inlined at BUILD time in client bundles; a prod build correctly yields false. Fine. BUT the SmartFolders localStorage removal must also handle the FolderSelectionModal cross-sync: spec keeps the `nzamy_smart_folders_changed` event optionally — if one component is migrated to API and the other still reads localStorage, folders will desync. → Spec must migrate BOTH SmartFolders.tsx AND FolderSelectionModal.tsx atomically (it says so in Step 6, but flag that partial rollout = silent desync).


---

### §7.5 — Lawyer profile always-mock + false verified badge + read-only
_Effort: 6h · Fix-risk: MED_

### Lawyer profile: real data fetch, honest verified seal, and editable professional fields

**Blocker refs:** #4 + MED (read-only)  ·  **Severity:** CRITICAL  ·  **Effort:** 6h  ·  **Risk of fix:** MED

**Root cause**

1. Fetch reads a `data` key the API never returns. `src/app/dashboard/lawyer/profile/page.tsx:138-157`:
```ts
apiGet<{ data: Record<string, unknown> }>("/api/v1/profile")
  .then((res) => {
    if (res.data) {            // res.data is ALWAYS undefined
      const d: any = res.data;
      setProfileData((prev) => ({ ...prev, name: d.name ? ... }));
    }
  })
```
But `src/app/api/v1/profile/route.ts:67-71` returns `{ profile, roleProfile, subscription }` — no `data` key — so the mapping block never runs and the page renders `MOCK_PROFILE` verbatim ("أ. محمد العتيبي", 143 cases, rating 4.8). Even the mapping it *would* run is wrong: it reads `d.bar_number` / `d.years_exp` / `d.bio`, but `lawyer_profiles` columns are `license_number` / `years_experience` / `bio_ar` (see schema below).

2. Verified seal is hardcoded. `page.tsx:59` `verified: true` in `MOCK_PROFILE`, rendered unconditionally at `page.tsx:251-253` (`{profileData.verified && <SealCheck .../>}`). Every lawyer shows a gold "verified" seal regardless of `lawyer_profiles.verification_status`.

3. PATCH allowlist excludes all professional fields. `route.ts:91-100` allowlist is `display_name, display_name_en, phone, avatar_url, language, calendar_type, theme, country_code` and the handler only updates `profiles` (`route.ts:116-121`). No `lawyer_profiles` branch → bio/specialties/hourly_rate/city/marketplace_visible/years/license are unwritable. The "تعديل" link at `page.tsx:272` points to `/dashboard/lawyer/profile/edit`, which **does not exist** (confirmed: no `edit/` dir) — so the page is fully read-only with a dead edit affordance.

Confirmed `lawyer_profiles` schema (`supabase/migrations/20260603_phase1_001_profiles.sql:92-113`, `city` added in `20260616_production_readiness_fixes.sql:19-21`):
`license_number text · bar_association text · specialties text[] · years_experience int · bio_ar text · bio_en text · hourly_rate numeric(12,2) · marketplace_visible boolean · verification_status text check in (pending|verified|rejected|suspended) · city text · is_accepting_clients boolean`.
RLS UPDATE policy already exists: `"lawyers update own profile" ... for update using (user_id = auth.uid())` (`20260603_phase1_001_profiles.sql:144-146`). **No migration required — all columns and the update policy exist.**

**Remediation**

**Step 1 — Fix the fetch/map in `page.tsx` to read `res.profile` + `res.roleProfile` and drive `verified` from `verification_status`.** Replace the `useEffect` at `page.tsx:136-157`:
```ts
type ProfileApiResponse = {
  profile: {
    display_name?: string | null;
    phone?: string | null;
    city?: string | null;
    avatar_url?: string | null;
  } | null;
  roleProfile: {
    license_number?: string | null;
    bar_association?: string | null;
    specialties?: string[] | null;
    years_experience?: number | null;
    bio_ar?: string | null;
    bio_en?: string | null;
    hourly_rate?: number | null;
    city?: string | null;
    marketplace_visible?: boolean | null;
    verification_status?: "pending" | "verified" | "rejected" | "suspended" | null;
  } | null;
};

useEffect(() => {
  if (!isSupabaseMode) return;
  apiGet<ProfileApiResponse>("/api/v1/profile")
    .then((res) => {
      const p = res.profile;
      const r = res.roleProfile;
      if (!p && !r) return;
      setProfileData((prev) => ({
        ...prev,
        // identity comes from profiles; honest empties, never mock identity
        name: p?.display_name?.trim() || user.name || "",
        email: user.email || "",
        phone: p?.phone?.trim() || "",
        city: (r?.city ?? p?.city)?.trim() || "",
        // professional fields from lawyer_profiles (real column names)
        bio: r?.bio_ar?.trim() || "",
        barNumber: r?.license_number?.trim() || "",
        yearsExp: typeof r?.years_experience === "number" ? r.years_experience : 0,
        expertise: r?.specialties?.length ? r.specialties : [],
        specialty: r?.specialties?.length ? r.specialties[0] : "",
        // verified seal driven by REAL status, not hardcoded true
        verified: r?.verification_status === "verified",
      }));
    })
    .catch(() => { /* leave placeholders; do not fall back to mock identity */ });
}, [user.name, user.email]);
```
> `user.email` / `user.name` come from the existing `useUser()` hook already imported (`page.tsx:18,133`). Pattern mirrors the existing effect; only the response shape + column names + verified derivation change.

**Step 2 — Replace mock identity constants with honest empty defaults** so a failed/empty fetch shows placeholders, not "أ. محمد العتيبي". Change `MOCK_PROFILE` (`page.tsx:47-71`) identity/professional fields to empty and rename to `EMPTY_PROFILE` (keep the demo-only stats structure used by other tabs). Minimum viable change — set these keys empty and `verified:false`:
```ts
const EMPTY_PROFILE = {
  name: "", title: "محامٍ ومستشار قانوني", specialty: "",
  city: "", phone: "", email: "", barNumber: "",
  yearsExp: 0, casesWon: 0, rating: 0, reviewCount: 0,
  verified: false, bio: "",
  expertise: [] as string[],
  languages: ["العربية"],
  education: [] as { degree: string; institution: string; year: string }[],
  courts: [] as string[],
  linkedin: "", twitter: "", website: "",
};
```
Update `useState(MOCK_PROFILE)` → `useState(EMPTY_PROFILE)` (`page.tsx:134`) and the `MOCK_PROFILE.city` reference (`page.tsx:180`) → `profileData.city || undefined`. In `OverviewTab` (`src/components/dashboard/LawyerProfileForms.tsx:288-289`) render an honest placeholder when bio is empty:
```tsx
<p className={`text-[13px] leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
  {profile.bio?.trim() ? profile.bio : "لم تتم إضافة نبذة مهنية بعد."}
</p>
```
Guard the contact chips (`page.tsx:299-311`) to skip empty values so blank phone/website/bar number don't render empty pills:
```tsx
{[
  { icon: Phone,    val: profileData.phone },
  { icon: Envelope, val: profileData.email },
  { icon: Globe,    val: profileData.website },
].filter(c => c.val).map(({ icon: Icon, val }, i) => ( /* …unchanged… */ ))}
{profileData.barNumber && (
  <div className="…"><SealCheck … /> رقم النقابة: {profileData.barNumber}</div>
)}
```

**Step 3 — Extend PATCH to persist editable `lawyer_profiles` fields** via a `user_type` branch, mirroring how GET fetches `roleProfile` (`route.ts:32-55`). Replace the PATCH body from `route.ts:88` onward:
```ts
const body = await request.json();

// profiles allowlist (unchanged)
const profileFields = [
  "display_name", "display_name_en", "phone", "avatar_url",
  "language", "calendar_type", "theme", "country_code", "city",
];
// lawyer_profiles allowlist (real column names from 20260603 schema)
const lawyerFields = [
  "bio_ar", "bio_en", "specialties", "years_experience",
  "hourly_rate", "license_number", "bar_association",
  "city", "marketplace_visible", "is_accepting_clients",
];
// NOTE: verification_status is intentionally NOT self-editable (admin-only).

const profileUpdates: Record<string, unknown> = {};
for (const key of profileFields) if (key in body) profileUpdates[key] = body[key];

const lawyerUpdates: Record<string, unknown> = {};
for (const key of lawyerFields) if (key in body) lawyerUpdates[key] = body[key];

if (Object.keys(profileUpdates).length === 0 && Object.keys(lawyerUpdates).length === 0) {
  return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
}

// Determine user_type to route role-profile updates (mirrors GET)
const { data: baseProfile, error: baseErr } = await supabase
  .from("profiles").select("user_type").eq("id", user.id).single();
if (baseErr || !baseProfile) {
  return NextResponse.json({ error: "Profile not found" }, { status: 404 });
}

let profile = null;
if (Object.keys(profileUpdates).length > 0) {
  const { data, error } = await supabase
    .from("profiles").update(profileUpdates).eq("id", user.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  profile = data;
}

let roleProfile = null;
if (Object.keys(lawyerUpdates).length > 0) {
  if (baseProfile.user_type !== "lawyer") {
    return NextResponse.json(
      { error: "Role fields not allowed for this account type" }, { status: 403 });
  }
  const { data, error } = await supabase
    .from("lawyer_profiles").update(lawyerUpdates).eq("user_id", user.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  roleProfile = data;
}

return NextResponse.json({ profile, roleProfile });
```
RLS enforces ownership on both tables (`profiles` line 79-81, `lawyer_profiles` line 144-146), so the `.eq(...user.id)` writes are double-guarded.

**Step 4 — Make the edit affordance work.** The `/dashboard/lawyer/profile/edit` link (`page.tsx:272`) targets a non-existent route. Either (a) add a client edit form page that PATCHes to `/api/v1/profile` with `{ bio_ar, specialties, hourly_rate, city, years_experience, license_number, bar_association, marketplace_visible }` (mirror the direct-`fetch` PATCH pattern in `src/app/dashboard/admin/users/[id]/page.tsx:165-169`), or (b) as a minimum for this blocker, inline an "edit bio" affordance on the profile page that PATCHes `{ bio_ar }`. Recommended: build the dedicated edit page so all editable fields are reachable. Example submit handler:
```ts
const save = async (patch: Record<string, unknown>) => {
  const res = await fetch("/api/v1/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "فشل الحفظ");
  return res.json();
};
```

**Files touched**
- `src/app/dashboard/lawyer/profile/page.tsx` (fetch/map, `EMPTY_PROFILE`, verified seal, contact-chip guards)
- `src/app/api/v1/profile/route.ts` (PATCH: dual allowlist + lawyer_profiles update branch)
- `src/components/dashboard/LawyerProfileForms.tsx` (`OverviewTab` empty-bio placeholder)
- `src/app/dashboard/lawyer/profile/edit/page.tsx` (NEW — edit form) OR inline edit affordance in `page.tsx`
- No migration file required.

**Acceptance criteria**
- [ ] With a real logged-in lawyer whose `lawyer_profiles.verification_status <> 'verified'`, the gold `SealCheck` seal next to the name is NOT rendered.
- [ ] A lawyer with `verification_status = 'verified'` DOES show the seal.
- [ ] The page never displays "أ. محمد العتيبي", "SA-2019-00482", "143", or "4.8" for a real account; empty professional fields render placeholders (e.g. "لم تتم إضافة نبذة مهنية بعد.") not mock values.
- [ ] Name/phone/city/bio/specialties/years/license shown match the authenticated user's `profiles` + `lawyer_profiles` rows.
- [ ] A lawyer edits their bio (`bio_ar`) via the edit affordance → PATCH `/api/v1/profile` returns 200 with `roleProfile.bio_ar` updated → reload shows the new bio.
- [ ] PATCH with `{ bio_ar }` from a non-lawyer account returns 403 and writes nothing to `lawyer_profiles`.
- [ ] PATCH still updates `profiles` fields (e.g. `phone`) as before (no regression).

**Verification steps**
- SQL (seed a non-verified lawyer): `update public.lawyer_profiles set verification_status='pending', bio_ar='' where user_id='<uid>';` → load `/dashboard/lawyer/profile` → seal absent, bio placeholder shown.
- Edit bio in UI (or curl): `curl -X PATCH https://<host>/api/v1/profile -H 'Content-Type: application/json' -H 'Cookie: <auth>' -d '{"bio_ar":"محامٍ حقيقي"}'` → expect `200 {"profile":null,"roleProfile":{...,"bio_ar":"محامٍ حقيقي"}}`.
- Confirm persistence: `select bio_ar from public.lawyer_profiles where user_id='<uid>';` → returns `محامٍ حقيقي`; reload page shows it.
- Negative: repeat the PATCH as a `provider`/`micro` account → expect `403` and `select bio_ar ...` unchanged.
- Verify seal flips: `update public.lawyer_profiles set verification_status='verified' where user_id='<uid>';` → reload → seal appears.

**Ordering / dependencies**
- No migration; depends only on already-applied `20260603_phase1_001_profiles.sql` and `20260616_production_readiness_fixes.sql`. Verify those are applied to the target DB first (`select column_name from information_schema.columns where table_name='lawyer_profiles';` must include `bio_ar, specialties, years_experience, license_number, verification_status, city`).
- RLS interaction: `lawyer_profiles` UPDATE is gated by policy `"lawyers update own profile"` (`user_id = auth.uid()`); the route uses the request-scoped SSR client (`@/lib/supabase/server`), so writes run as the authenticated user and RLS is the real guard — the `.eq('user_id', user.id)` is defense-in-depth. Do NOT add `verification_status` to the lawyer allowlist (admin-only; self-verification would be a trust-badge bypass).
- Step 1-2 (read path) and Step 3-4 (write path) are independent and can ship separately; ship read path first to kill the false-verified/mock-identity blocker even before the edit form lands.

**GitNexus pre-edit** — run `impact({target, direction:'upstream'})` before editing: `GET` and `PATCH` (in `src/app/api/v1/profile/route.ts`), `LawyerProfilePage`, and `OverviewTab`. Confirm no other consumers depend on the old `{ data: ... }` shape (none expected — GET already returns `{profile,roleProfile,subscription}`) and that `OverviewTab` is used only by this page before changing its bio rendering.


---

### §7.6 — Client my-group fabricated billing + consultation attachments vanish + client medium items
_Effort: 9h · Fix-risk: MED_

### Fix: my-group fabricated billing gate + consultation attachments upload + 4 client mediums
**Blocker refs:** #5 + MED-storage-meter, MED-walletBalance, MED-register-validation, MED-casesService-mock  ·  **Severity:** HIGH  ·  **Effort:** 9h  ·  **Risk of fix:** MED

---

#### 5.1 — my-group: fabricated billing/rotation over a REAL member list (CRITICAL)

**Root cause** — `src/app/dashboard/client/my-group/page.tsx`. Real members are fetched, then billing/rotation/quota are invented on top of them:

- L168-178: every real member gets `queriesUsed: 0, queriesTotal: 25` and `rotationIndex: i`.
- L196-205: rotation status assigned by array index (`i===0?"paid":i===1?"current":"upcoming"`), `CURRENT_PAYER = MEMBERS[1]`.
- L457: hardcoded due date `<span ...>٣ فبراير ٢٠٢٦</span>`.
- L34,470,474,630: `totalCost:499 / perPerson:99 / "99 ر.س"` — invented from `DEFAULT_GROUP`.
- L476-480: "ادفع الآن" button has **no onClick** — a no-op paying CTA.
- L628-631,537: stat tiles `{GROUP.totalUsed}/{GROUP.totalQuota}` (0/100 constant), `التكلفة/شخص = 99 ر.س`.

```tsx
// L196-205 — status/payer are pure array-index fiction, no backend behind them
const ROTATION: RotationEntry[] = MEMBERS.map((m, i) => ({
  month: `شهر ${i + 1}`, ...,
  status: i === 0 ? "paid" : i === 1 ? "current" : "upcoming",
  amount: GROUP.totalCost, // 499, constant
}));
const CURRENT_PAYER = MEMBERS.length > 1 ? MEMBERS[1] : MEMBERS[0] || {...};
```

**Remediation** — There is **no rotation/billing backend** (no rotation table, no group-quota endpoint, no payer state). Wiring real payments is out of scope and impossible without a schema. Chosen approach: **keep the real membership features (member list, invite, join code) and gate ONLY the billing/rotation/quota block behind `DashboardComingSoon` "قريباً"**, mirroring `src/app/dashboard/lawyer/reviews/page.tsx` (which renders `DashboardComingSoon` for a not-yet-real feature). Do NOT gate the whole page — invites/join are real.

1. Add the import (mirror `lawyer/reviews/page.tsx` L3):
```tsx
import DashboardComingSoon from "@/components/ui/DashboardComingSoon";
```

2. **Delete** the fabricated derivations. Remove `DEFAULT_GROUP.totalCost/perPerson/totalUsed/totalQuota` usage and the `ROTATION`, `CURRENT_PAYER`, `NEXT_PAYER`, `isMyTurn` consts (L196-205, L353). Keep `MEMBERS`, `inviteCode`, `activeGroup.name`.

3. **Remove** the three fabricated JSX sections entirely: the "Current Payer Hero" (L437-489, contains the no-op ادفع الآن), the "Rotation Timeline" (L491-527), and the "Group Stats Row" (L625-642). Replace them with a single honest block placed after the Members List:
```tsx
{/* Billing & rotation — no backend yet, gated honestly */}
<motion.div variants={fadeUp}>
  <DashboardComingSoon
    title="نظام التناوب والدفع الجماعي"
    description="إدارة دورة الدفع الشهرية بين أعضاء المجموعة قيد التطوير. حالياً يمكنك إنشاء المجموعة ودعوة الأعضاء فقط — لا توجد فوترة فعلية بعد."
  />
</motion.div>
```

4. Keep the Members List (L529-623) but **strip the invented per-member billing badges**: remove `isCurrentPayer` glow/"دوره الآن" (depends on deleted `CURRENT_PAYER`) and the `الدور رقم {m.rotationIndex + 1}` column (L595-599). Members render as a plain roster (name + admin badge).

5. **Create-group modal billing copy must also be gated.** The modal (L261-291) promises "سيتم سحب 499 ر.س" and the button says "ادفع 499 ر.س وأنشئ المجموعة" but `createGroup` charges nothing. Change the button label to `أنشئ المجموعة` and replace the payment-details box (L261-267) with a neutral note; when payments are wired later, gate the charge on `payments_gateway` via `usePaymentsStatus()` exactly like `consultation/new/page.tsx` L135 (`paymentsBlocked`).

> **When real billing lands:** the "ادفع الآن" CTA MUST call `createPaymentIntentStub` + check `usePaymentsStatus().disabled` before charging, identical to `confirmConsultation` in `consultation/new/page.tsx`.

---

#### 5.2 — consultation/new: attachments collected but never uploaded (HIGH data-loss)

**Root cause** — `src/app/dashboard/client/consultation/new/page.tsx`. Files land in state (L65, L498-503) and render (L504-529) but `confirmConsultation` (L137-185) never uploads them; on navigation the `File[]` is GC'd — silent loss. `uploadDocumentFile` already exists (`documentService.ts` L67).

```tsx
// L65 collected...
const [attachments, setAttachments] = useState<File[]>([]);
// L137-185 confirmConsultation — creates the request, never touches `attachments`
```

**Remediation** — Upload each file to the `documents` bucket keyed to the new request id, then persist the returned ids into request metadata. Mirror the upload loop in `documents/page.tsx` `handleFiles` (L200-221) and the `{ requestId }` opt used in `lawyer/cases/[id]/page.tsx` L319.

**Constraint:** `WorkflowRequest.metadata` is `Record<string, string | number | boolean | null>` (`workflowStore.ts` L52) — **no arrays**. Store ids as a comma-joined string + a count.

1. Add the import:
```tsx
import { uploadDocumentFile } from "@/lib/services/documentService";
```

2. Add upload state near L69:
```tsx
const [uploadingAttachments, setUploadingAttachments] = useState(false);
const [attachmentError, setAttachmentError] = useState<string | null>(null);
```

3. In `confirmConsultation`, after `const requestId = createWorkflowId(...)` (L140) and before `createWorkflowRequest`, upload files against that id:
```tsx
let attachmentIds: string[] = [];
if (attachments.length > 0) {
  setUploadingAttachments(true);
  setAttachmentError(null);
  try {
    for (const file of attachments) {
      const doc = await uploadDocumentFile(file, { requestId });
      attachmentIds.push(doc.id);
    }
  } catch (err) {
    console.error("[consultation] attachment upload failed:", err);
    setAttachmentError(
      err instanceof Error && err.message === "upload_unavailable_demo"
        ? "رفع المرفقات يتطلب ربط قاعدة البيانات — سيُنشأ الطلب بدون مرفقات في الوضع التجريبي."
        : "تعذّر رفع أحد المرفقات. حاول مرة أخرى.",
    );
    // Non-demo hard-failure: abort so we don't create a request minus its evidence.
    if (!(err instanceof Error && err.message === "upload_unavailable_demo")) {
      setUploadingAttachments(false);
      return;
    }
  } finally {
    setUploadingAttachments(false);
  }
}
```

4. Add to the `metadata` object (L170-180):
```tsx
attachmentIds: attachmentIds.join(","),   // Record<string,...> forbids arrays
attachmentCount: attachmentIds.length,
```

5. Disable the confirm button while uploading and surface `attachmentError`. In the Step-3 CTA (L653-667) add `|| uploadingAttachments` to `disabled` and render `attachmentError` next to `paymentsBlocked`'s notice.

> Note: `request_id` on the `attachments` row references the workflow request business id string used by `createWorkflowId` (e.g. `CON-...`), which is what `lawyer/cases/[id]` also passes — consistent, no schema change.

---

#### 5.3 — documents: storage meter hardcoded (MED)

**Root cause** — `src/app/dashboard/client/documents/page.tsx` L418-430: `١٠.٣ / ٥٠٠ ميجا`, `width:'2.1%'`, `٤٨٩ ميجا متاحة` all literals — unrelated to `docs`.

**Remediation** — Compute from the already-loaded `docs` (each `Doc` carries `size_bytes` from `apiDocToDoc`). Sum real bytes; keep 500 MB quota as an app constant (honest ceiling, real numerator).
```tsx
// derive near other memos
const QUOTA_MB = 500;
const usedMb = docs.reduce((s, d) => s + (d.sizeBytes ?? 0), 0) / 1024 / 1024;
const usedPct = Math.min(100, (usedMb / QUOTA_MB) * 100);
const fmt = (n: number) => n.toLocaleString("ar-SA", { maximumFractionDigits: 1 });
```
```tsx
<span className="...font-mono...">{fmt(usedMb)} / {QUOTA_MB} ميجا</span>
...
<motion.div ... animate={{ width: `${usedPct}%` }} ... />
<p ...>{fmt(Math.max(0, QUOTA_MB - usedMb))} ميجا متاحة</p>
```
(If `Doc` lacks `sizeBytes`, add it in `apiDocToDoc` from `size_bytes`.) Verify the field name against the `Doc` mapper before wiring.

---

#### 5.4 — dashboard/summary: walletBalance ignores `kind` (MED)

**Root cause** — `src/app/api/v1/dashboard/summary/route.ts` L101-115 sums raw `amount` for all rows, so debits inflate the balance. `api/v1/wallet/route.ts` L20-22 correctly subtracts non-credit/refund kinds. Two endpoints disagree.

**Remediation** — Unify with the wallet route: select `amount, kind` and apply the same sign logic (copy pattern from `wallet/route.ts` L20-22).
```tsx
// query 6
Promise.resolve(
  supabase.from("wallet_transactions").select("amount, kind").eq("user_id", uid),
)
  .then(({ data }) => {
    if (!data || data.length === 0) return 0;
    return data.reduce(
      (sum: number, t: { amount: number | null; kind: string | null }) =>
        t.kind === "credit" || t.kind === "refund"
          ? sum + (t.amount ?? 0)
          : sum - (t.amount ?? 0),
      0,
    );
  })
  .catch(() => 0),
```
No migration; `kind` column already exists (used by wallet route).

---

#### 5.5 — register/client: truthiness-only validation (MED)

**Root cause** — `src/app/register/client/page.tsx` L61: `if (step === 2) return !!(formData.email && formData.phone);` — any non-empty string passes; `idNumber` (L249) unchecked. Malformed data reaches `supabase.auth.signUp` (L230).

**Remediation** — Add format validators, mirror the inline-guard style already in the file. Saudi context: email RFC-lite, phone 9 digits (KSA mobile `5XXXXXXXX`), national/iqama ID 10 digits.
```tsx
const isEmail = (v = "") => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
const isSaPhone = (v = "") => /^5\d{8}$/.test(v.replace(/\D/g, "")); // local, no +966
const isSaId = (v = "") => /^[12]\d{9}$/.test(v.trim());            // KSA ID / Iqama
```
```tsx
const canNext = () => {
  if (step === 1) return clientType !== null;
  if (step === 2) return isEmail(formData.email) && isSaPhone(formData.phone)
    && (clientType !== "individual" || isSaId(formData.idNumber));
  if (step === 3) return !!formData.password
    && formData.password === formData.confirmPassword && formData.password.length >= 8;
  return true;
};
```
Also render per-field hint text on invalid input (mirror existing `authError` box at L322).

---

#### 5.6 — casesService: mock fallback leaks sample cases in supabase mode (MED)

**Root cause** — `src/lib/services/casesService.ts` L60-62 and L75-77: on API error while `isSupabaseMode`, returns `SHARED_CASES` (demo data) — real users see fabricated cases.

**Remediation** — On error in supabase mode, return empty/null (never mock). Mirror the honest `catch { return []; }` already used by `documentService.getDocuments` L57-59.
```tsx
// getCases catch (L60)
} catch { return []; }
// getCaseDetail catch (L75)
} catch { return null; }
```
Demo-mode branches (L47-51, L71) keep `SHARED_CASES` — that is correct for demo.

---

**Files touched**
- `src/app/dashboard/client/my-group/page.tsx`
- `src/app/dashboard/client/consultation/new/page.tsx`
- `src/lib/services/documentService.ts` (import only, no change needed)
- `src/app/dashboard/client/documents/page.tsx`
- `src/app/api/v1/dashboard/summary/route.ts`
- `src/app/register/client/page.tsx`
- `src/lib/services/casesService.ts`

**No SQL migration required** — all backing schema (`documents` bucket + `attachments`, `wallet_transactions.kind`, `payments_gateway` flag) already exists.

**Acceptance criteria**
- [ ] my-group shows NO fabricated payer, due date "٣ فبراير ٢٠٢٦", 499/99 costs, rotation timeline, or 0/100 quota; billing area renders `DashboardComingSoon`.
- [ ] No no-op "ادفع الآن" button remains anywhere on my-group.
- [ ] Member list still renders real fetched members; invite/join/copy-link still work.
- [ ] Consultation attachments upload to `documents` bucket; created request's `attachments` rows have matching `request_id`; `metadata.attachmentIds`/`attachmentCount` populated.
- [ ] In supabase mode, non-demo upload failure aborts request creation (no evidence-less request); demo mode creates request with a clear notice.
- [ ] documents storage meter numerator equals actual sum of stored file sizes.
- [ ] `/api/v1/dashboard/summary` walletBalance equals `/api/v1/wallet` balance for the same user.
- [ ] Registration step-2 rejects malformed email, non-KSA phone, and (individual) non-10-digit ID.
- [ ] casesService returns `[]`/`null` (never `SHARED_CASES`) on API error in supabase mode.

**Verification steps**
- my-group: log in as a client with a group; confirm only real members + قريباً billing panel render; grep the built page for `٣ فبراير` / `499` → none.
- attachments: create a consultation with 2 files → `select id, request_id, file_name from attachments where request_id = '<CON-id>';` returns 2 rows; open the file via signed URL.
- wallet parity: `curl -s .../api/v1/dashboard/summary` vs `curl -s .../api/v1/wallet` for a user with mixed credit/debit rows → `walletBalance === data.balance`. SQL sanity: `select sum(case when kind in ('credit','refund') then amount else -amount end) from wallet_transactions where user_id='<uid>';`.
- storage meter: upload a 3 MB file, reload documents → meter reads ~3 MB, not ١٠.٣.
- registration: type `abc`, `123`, `55` in step 2 → Next stays disabled; valid `x@y.com` / `512345678` / `1234567890` → enabled.
- casesService: with `NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND=supabase` and API forced to 500, the cases list renders empty, not demo cases.

**Ordering / dependencies**
- Do 5.2 (attachments) after confirming `attachments` RLS allows the client to INSERT their own rows (owner = auth.uid()) — the `POST /api/v1/documents` handler + `documents` storage policies from `20260629_payments_and_storage_policies.sql` already enforce this; no new RLS.
- 5.1 must land before any real-billing work (it removes the misleading UI the billing feature will replace).
- 5.4/5.6 are independent; 5.3/5.5 are independent UI-only.

**GitNexus pre-edit** — run `impact({target, direction:'upstream'})` before editing:
- `uploadDocumentFile` (shared by documents + lawyer cases pages)
- `getCases` and `getCaseDetail` (casesService — consumed by client case list + lawyer Kanban)
- `createWorkflowRequest` / `confirmConsultation` (metadata shape change)
- the `GET` handler in `dashboard/summary/route.ts` and `wallet/route.ts` (walletBalance consumers)
- `canNext` in `register/client/page.tsx`

> **⚠️ Reviewer corrections for §7.6 (apply these):**
>
> - The upload loop calls uploadDocumentFile(file, {requestId}) with requestId = createWorkflowId('CON') — a business-id STRING generated client-side BEFORE createWorkflowRequest runs. If createWorkflowRequest later FAILS (spec #1's repointed path now throws on API error, per clientWorkflowRepository.ts:157-166), the attachments are already uploaded and orphaned against a request row that never got created. → Reorder: create the request FIRST, then upload attachments against the confirmed server id; or delete uploaded blobs on request-creation failure. The spec uploads before createWorkflowRequest (step 3 says 'before createWorkflowRequest'), creating an orphan-on-failure window.


---

### §7.7 — Cross-cutting infra: ESLint, route protection/role-gates, env-var + migrations deploy assertions, beta posture
_Effort: 7h · Fix-risk: MED_

### Cross-cutting infra: ESLint, route protection/role-gates, env + migrations deploy assertions, beta mock-directory gate
**Blocker refs:** INFRA-1 (eslint), INFRA-2 (no middleware / lawyer role-gate), INFRA-3 (env-var demo bypass), INFRA-4 (unapplied migrations / deploy), INFRA-5 (public mock lawyer directory vs monopoly mode)  ·  **Severity:** HIGH  ·  **Effort:** 7h  ·  **Risk of fix:** MED

**Root cause**

1. **ESLint fully broken (CI blocker).** `eslint.config.mjs:12` enables a `react/` rule but no `react` plugin is registered (nor listed in `package.json` devDeps — only `eslint-config-next` is present). ESLint aborts with `Definition for rule 'react/no-unescaped-entities' was not found`.
```js
// eslint.config.mjs:9-18
rules: {
  "@next/next/no-html-link-for-pages": "warn",
  "@typescript-eslint/no-explicit-any": "warn",
  "react/no-unescaped-entities": "warn",   // ← plugin `react` never registered → npx eslint . fails
  ...
}
```

2. **No server-side route gate.** There is no `middleware.ts` at the project root, even though `src/lib/supabase/middleware.ts:18` (`updateSession`) exists and its own docstring says it is "Called from `middleware.ts` at the project root." That file is dead code today. `/api/v1/lawyer/*` handlers only do `auth.getUser()` with no `user_type` check:
```ts
// src/app/api/v1/lawyer/clients/route.ts:17-25 — auth only, no role check
const { data: { user }, error: authError } = await supabase.auth.getUser();
if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
const uid = user.id;   // queries are uid-scoped (low leak) but any authed non-lawyer can hit the endpoint
```
The admin routes already have the correct pattern to mirror (`src/app/api/v1/admin/credits/route.ts:35-46`).

3. **Env-var demo bypass is silent.** Every gate reads `process.env.NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND ?? "demo"` (`src/app/login/page.tsx:31`, `src/hooks/useUser.ts:396`, `src/lib/clientWorkflowRepository.ts:16`, `src/proxy.ts:43`, `src/lib/services/api.ts:17`). If the var is unset in prod, the whole app silently falls back to client-side demo roles — no build/deploy error.

4. **Migrations not asserted on deploy.** No `deploy.sh` exists in `nzamy-website/` or repo root (both `cat` returned empty). `supabase/migrations/20260616_production_readiness_fixes.sql` (lawyer columns `is_accepting_clients`, `city`; marketplace RLS) and `20260630_handle_new_user_sectors.sql` (sector-profile provisioning trigger) may never reach the live DB.

5. **Public mock lawyer directory contradicts monopoly mode.** `src/app/lawyers/browse/page.tsx` is `"use client"`, renders 100% `MOCK_LAWYERS` (`:49`, filtered at `:265`), and is **publicly reachable**: `/lawyers` → `redirect("/lawyers/browse")` (`src/app/lawyers/page.tsx:2`), linked from `src/app/services/cases/page.tsx:114`, `src/app/services/labor/page.tsx:174`, `src/app/marketplace/_components/MyRequestsTab.tsx:382,440`, and listed in `src/app/sitemap.ts:26-27`. The monopoly filter (`src/constants/navigation.sidebars.ts:439-458`) only hides `/services/lawyers` and `/community/lawyers` from **sidebars** — it does **not** cover `/lawyers/browse`, `/lawyers/[slug]`, nor public navbar/service links. `community/lawyers/page.tsx:161-162` already self-gates via `useUser().userType`, so it is lower risk; `/lawyers/browse` + `/lawyers/[slug]` are the real exposure (fake "licensed, Ministry-of-Justice-certified" lawyers shown to the public while monopoly mode claims only Nzamy is a provider).

**Remediation**

**Step 1 — Fix ESLint (recommended: remove the orphan rule, no new dependency).**
`eslint-config-next` already surfaces `@next/next/no-html-link-for-pages` for the bad-anchor case, and `react/no-unescaped-entities` on an Arabic RTL codebase mostly produces noise. Dropping the one orphan rule is zero-risk and adds no dependency. Diff:
```diff
--- a/eslint.config.mjs
+++ b/eslint.config.mjs
@@
     rules: {
       "@next/next/no-html-link-for-pages": "warn",
       "@typescript-eslint/no-explicit-any": "warn",
-      "react/no-unescaped-entities": "warn",
       "react-hooks/purity": "warn",
```
> Alternative (only if you want the rule): `npm i -D eslint-plugin-react@^7`, then `import react from "eslint-plugin-react";` and add a config object `{ plugins: { react }, rules: { "react/no-unescaped-entities": "warn" } }`. Not recommended — extra dep for a rule that fights RTL Arabic text. Verify either way with `npx eslint . --max-warnings=-1`.

**Step 2 — Add root `src/middleware.ts` wiring the existing `updateSession`, and extend `updateSession` to cover `/api/v1/**` protected prefixes.**
Create `src/middleware.ts` (mirrors the docstring in `src/lib/supabase/middleware.ts:10-16`):
```ts
// src/middleware.ts
import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Run on everything except static assets & image optimizer.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
```
Then extend the protected-prefix set in `src/lib/supabase/middleware.ts:55` to also 401 unauthenticated API hits (keep HTML redirect for pages, JSON 401 for API):
```ts
// src/lib/supabase/middleware.ts — replace the block at :54-65
const path = request.nextUrl.pathname;
const protectedPagePrefixes = ['/dashboard', '/settings', '/notifications', '/onboarding'];
const protectedApiPrefixes  = ['/api/v1/lawyer', '/api/v1/admin', '/api/v1/client', '/api/v1/firm'];

const isProtectedPage = protectedPagePrefixes.some((p) => path.startsWith(p));
const isProtectedApi  = protectedApiPrefixes.some((p) => path.startsWith(p));

if (!user && isProtectedApi) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
if (!user && isProtectedPage) {
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('from', path);
  return NextResponse.redirect(url);
}
```
Update the onboarding-redirect guard below it to use `isProtectedPage` instead of the now-removed `isProtectedRoute` variable.
> Note: middleware only checks the session cookie exists (it deliberately does NOT read `profiles` — that would add a DB round-trip to every request). Per-endpoint role authorization is Step 3.

**Step 3 — Add a reusable `assertRole` helper and apply it to `/api/v1/lawyer/*` + admin routes.**
New file `src/lib/auth/assertRole.ts`, extracting the exact pattern from `src/app/api/v1/admin/credits/route.ts:35-46`:
```ts
// src/lib/auth/assertRole.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';

type Ok  = { ok: true;  user: User; userType: string; supabase: SupabaseClient };
type Err = { ok: false; response: NextResponse };

/**
 * Verifies the caller is authenticated AND (if `allowed` is given) that their
 * profiles.user_type is in `allowed`. 'admin' is always allowed.
 * Mirrors src/app/api/v1/admin/credits/route.ts:35-46.
 */
export async function assertRole(allowed?: string[]): Promise<Ok | Err> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, response: NextResponse.json(
      { error: 'غير مصرح — يرجى تسجيل الدخول' }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from('profiles').select('user_type').eq('id', user.id).single();

  const userType = profile?.user_type ?? '';
  if (allowed && allowed.length > 0 && userType !== 'admin' && !allowed.includes(userType)) {
    return { ok: false, response: NextResponse.json(
      { error: 'غير مصرح — صلاحيات غير كافية' }, { status: 403 }) };
  }
  return { ok: true, user, userType, supabase };
}
```
Apply at the top of each lawyer handler (example for `src/app/api/v1/lawyer/clients/route.ts` `GET`):
```ts
export async function GET() {
  const auth = await assertRole(['lawyer', 'firm']);
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;
  const uid = user.id;
  // …existing query logic unchanged (reuse `supabase` instead of re-creating a client)…
}
```
Repeat for `activity/route.ts`, `dashboard/summary/route.ts`, `finance/route.ts`, `tasks/route.ts`, and the `POST` in `clients/route.ts`. Admin routes can be migrated to `assertRole(['admin'])` opportunistically (behavior-identical to their inline check).

**Step 4 — Runtime env-var assertion.**
Add `src/instrumentation.ts` (Next.js runs it once on server boot; no such file exists today):
```ts
// src/instrumentation.ts
export function register() {
  if (process.env.NEXT_PUBLIC_APP_ENV === 'development') return;
  const backend = process.env.NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND;
  const required = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
  const missing = required.filter((k) => !process.env[k]);
  if (backend !== 'supabase') {
    throw new Error(
      `[startup] NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND must be "supabase" in production (got "${backend ?? 'unset'}") — otherwise the app silently serves demo/client-side roles.`);
  }
  if (missing.length) {
    throw new Error(`[startup] Missing required env vars: ${missing.join(', ')}`);
  }
}
```

**Step 5 — Add a deploy script that pushes migrations + a verification query list.**
Create `nzamy-website/deploy.sh` (none exists):
```bash
#!/usr/bin/env bash
set -euo pipefail

echo "▶ Applying Supabase migrations…"
npx supabase db push            # applies everything under supabase/migrations

echo "▶ Verifying critical schema/RLS is live…"
npx supabase db execute --file supabase/migrations/_verify.sql

echo "▶ Building Next.js…"
npm run lint
npm run type-check
npm run build
echo "✔ Deploy prep complete."
```
And a read-only verification file `supabase/migrations/_verify.sql` (not a migration — run manually / by deploy.sh):
```sql
-- Confirms 20260616 + 20260630 landed. All SELECTs, no writes.
SELECT 'is_accepting_clients' AS check,
       EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='lawyer_profiles'
                 AND column_name='is_accepting_clients') AS present;
SELECT 'lawyer_profiles.city', EXISTS (SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='lawyer_profiles' AND column_name='city');
SELECT 'profiles.city', EXISTS (SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='profiles' AND column_name='city');
SELECT 'handle_new_user fn', EXISTS (SELECT 1 FROM pg_proc WHERE proname='handle_new_user');
SELECT 'on_auth_user_created trigger', EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='on_auth_user_created');
```

**Step 6 — Gate the public mock lawyer directory to match monopoly mode.**
`/lawyers/browse` and `/lawyers/[slug]` are `"use client"` mock pages that are reachable publicly. Under `BETA_MONOPOLY_MODE` only Nzamy is a provider, so a public list of fake external lawyers is a correctness/trust bug. Recommended gate: **server-redirect the mock routes to the real single-firm intake** (`/services/lawyers`) while monopoly mode is on, and drop them from the sitemap. This mirrors the existing monopoly-filter intent in `navigation.sidebars.ts:439`.

Convert `src/app/lawyers/layout.tsx` (already a server component) to enforce the redirect for both `/lawyers/browse` and `/lawyers/[slug]`:
```ts
// src/app/lawyers/layout.tsx — add at top
import { redirect } from "next/navigation";
import { BETA_MONOPOLY_MODE } from "@/lib/betaConfig";
// keep existing buildMetadata export

export default function Layout({ children }: { children: React.ReactNode }) {
  if (BETA_MONOPOLY_MODE) redirect("/services/lawyers"); // single-firm intake, real page
  return <>{children}</>;
}
```
Remove the mock routes from the sitemap while monopoly mode is on:
```ts
// src/app/sitemap.ts — filter out /lawyers and /lawyers/browse when BETA_MONOPOLY_MODE
import { BETA_MONOPOLY_MODE } from "@/lib/betaConfig";
// after building the routes array:
const filtered = BETA_MONOPOLY_MODE
  ? routes.filter((r) => r.url !== "/lawyers" && r.url !== "/lawyers/browse")
  : routes;
```
And repoint the in-app CTAs that currently deep-link to the mock list to the real intake (edit the `href="/lawyers/browse"` occurrences in `src/app/services/cases/page.tsx:114`, `src/app/services/labor/page.tsx:174`, `src/app/marketplace/_components/MyRequestsTab.tsx:382,440` → `"/services/lawyers"`). `/community/lawyers` already self-gates via `useUser` (`community/lawyers/page.tsx:161`) and stays as-is.
> If product prefers to KEEP the mock pages visible for beta marketing, the minimum acceptable alternative is a prominent "بيانات توضيحية — Demo data" banner at the top of `browse/page.tsx` and removal of the "مرخص ومعتمد من وزارة العدل" claim at `:325`. The redirect above is the safer default and is what monopoly mode implies.

**Files touched**
- `nzamy-website/eslint.config.mjs`
- `nzamy-website/src/middleware.ts` (new)
- `nzamy-website/src/lib/supabase/middleware.ts`
- `nzamy-website/src/lib/auth/assertRole.ts` (new)
- `nzamy-website/src/app/api/v1/lawyer/{clients,activity,finance,tasks}/route.ts`, `dashboard/summary/route.ts`
- `nzamy-website/src/instrumentation.ts` (new)
- `nzamy-website/deploy.sh` (new), `nzamy-website/supabase/migrations/_verify.sql` (new)
- `nzamy-website/src/app/lawyers/layout.tsx`, `src/app/sitemap.ts`
- `nzamy-website/src/app/services/cases/page.tsx`, `src/app/services/labor/page.tsx`, `src/app/marketplace/_components/MyRequestsTab.tsx`

**Acceptance criteria**
- [ ] `npx eslint .` exits 0 (no "rule not found").
- [ ] `npm run build` and `npm run type-check` pass.
- [ ] Unauthenticated `GET /api/v1/lawyer/clients` → 401; authenticated non-lawyer (e.g. `individual`) → 403; lawyer/firm/admin → 200.
- [ ] Unauthenticated browser hit to `/dashboard/lawyer` → 302 to `/login?from=/dashboard/lawyer`.
- [ ] Server boots with a clear thrown error when `NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND` ≠ `supabase` in a non-dev env.
- [ ] `deploy.sh` runs `npx supabase db push`; `_verify.sql` returns `present/true` for all five checks.
- [ ] With `BETA_MONOPOLY_MODE=true`, `/lawyers`, `/lawyers/browse`, and `/lawyers/anything` all 3xx-redirect to `/services/lawyers`; those URLs absent from `/sitemap.xml`; no in-app CTA links to `/lawyers/browse`.

**Verification steps**
- ESLint: `cd nzamy-website && npx eslint . && echo OK`.
- Role gate: `curl -i https://<host>/api/v1/lawyer/clients` (expect 401); with an `individual` session cookie expect 403; with a lawyer cookie expect 200 JSON array.
- Middleware: `curl -i -L https://<host>/dashboard/lawyer` → 307/302 to `/login?from=…`.
- Env assertion: deploy a build with the var unset → boot fails fast in logs.
- Migrations: run `npx supabase db execute --file supabase/migrations/_verify.sql`; every row `present=true`. In UI, load `/dashboard/lawyer` and confirm no "الوضع التجريبي" backend banner appears.
- Monopoly gate: browse to `/lawyers/browse` and `/lawyers/xyz` → land on `/services/lawyers`; `curl https://<host>/sitemap.xml | grep lawyers/browse` returns nothing.

**Ordering / dependencies**
- Do **Step 4 (migrations)** first in the live env — `assertRole` + lawyer routes assume `profiles.user_type` and the sector-provisioning trigger exist; without `20260616`/`20260630`, role reads can be null for older accounts.
- Step 2 (middleware) before Step 3 is cosmetic-order only; both are independent, but ship together so API 401s are consistent.
- **RLS interaction:** `assertRole` uses the cookie-scoped `createClient()` (anon key, RLS enforced) — it is defense-in-depth, NOT a replacement for RLS. Do not switch these read paths to `createServiceClient()` (service role bypasses RLS; only admin write paths use it, per `supabase/server.ts:41`). The middleware session check must stay before any per-row query so RLS still evaluates against the authenticated `auth.uid()`.
- Step 6 redirect must not fire in dev if you still demo the mock pages — the `BETA_MONOPOLY_MODE` flag already handles that (flip to `false` to restore).

**GitNexus pre-edit** — run `impact({target, direction:'upstream'})` before editing:
- `updateSession` (adding API branch — used by the new root middleware)
- `createClient` (server) — `assertRole` and every lawyer route depend on it
- `GET` / `POST` in `src/app/api/v1/lawyer/clients/route.ts` (and the other lawyer route handlers) before inserting the `assertRole` guard
- `Layout` (`src/app/lawyers/layout.tsx`) and the sitemap generator before adding the monopoly redirect/filter
- the `MOCK_LAWYERS`-driven `browse` page component if choosing the banner alternative instead of the redirect

> **⚠️ Reviewer corrections for §7.7 (apply these):**
>
> - instrumentation.ts guards with `if (process.env.NEXT_PUBLIC_APP_ENV === 'development') return;`. Verified .env.example:16 ships `NEXT_PUBLIC_APP_ENV=development`. If that default leaks into prod (common .env copy mistake), the ENTIRE assertion silently no-ops — exactly the failure mode it's meant to catch. → Key the skip off `process.env.NODE_ENV !== 'production'` (Next sets NODE_ENV=production automatically on `next build`/`next start`, not manually settable), NOT the manually-configured NEXT_PUBLIC_APP_ENV.
>
> - The spec says create `src/middleware.ts`, but the docstring in src/lib/supabase/middleware.ts:8 says 'Called from middleware.ts at the project root.' For this project (uses `src/` dir) the correct location IS src/middleware.ts, so the spec is right and the docstring is stale. → Fine, but the spec should also update the stale docstring. Separately: the new matcher regex must EXCLUDE `/api/v1/n8n/*` inbound-from-supabase paths if any are unauthenticated, and confirm the JSON-401 branch for protectedApiPrefixes doesn't break the existing onboarding-redirect guard which still refs the renamed variable (spec says rename isProtectedRoute→isProtectedPage at line 55 but the onboarding block at 70-85 also uses isProtectedRoute — both must be updated in one edit or it won't compile).
>
> - assertRole issues a SECOND `auth.getUser()` + a `profiles` SELECT on every protected lawyer request, on top of the middleware's getUser(). That's 2 network round-trips per request to Supabase. → Acceptable for correctness but note the added latency; consider caching user_type in a request header set by middleware, or accept the cost. Not a blocker, but the spec claims 'behavior-identical to inline check' — it is, but doubles the auth calls vs a hand-written single-getUser handler.


---

### §7.8 — n8n Section A — notification layer (emails / WhatsApp / reminders)
_Effort: 26h · Fix-risk: MED_

### Section A — n8n Notification Layer (welcome / request / assign / review / verify / reminder / WhatsApp)
**Blocker refs:** n8n-A1..A7  ·  **Severity:** HIGH  ·  **Effort:** ~26h (app glue ~5h + n8n build ~21h)  ·  **Risk of fix:** MED

**Root cause** — the entire outbound layer is a stub. Everything upstream (event vocab, payload builder, trigger route) exists but nothing leaves the process:

`src/app/api/v1/n8n/trigger/route.ts:78-88` — assembles the payload and only `console.log`s it:
```ts
// Log the assembled payload — this is the "delivery" surface until n8n is wired.
console.log("[n8n trigger] payload:", JSON.stringify(payload));
return NextResponse.json(
  { data: payload, delivered: false, note: "n8n not yet wired — payload assembled only" },
  { status: 200 },
);
```
There is no `dispatchToN8n()` and `N8N_WEBHOOK_BASE_URL` is unused by any code (only `.env.example:20` declares it). 0 of the 7 Section-A workflows exist in n8n (`n8n_FINAL_MASTER_PLAN.md:26,747`), though 7 importable JSON templates are on disk (`nzamy-website/n8n/workflows/wf-*.json`, verified present). Result: no email, no WhatsApp, no reminder ever fires.

**Key architectural fact (drives per-workflow trigger choice):** profiles and lawyer_profiles rows are NOT created by JS `.insert()` — registration calls `supabase.auth.signUp(...)` (`src/app/register/client/page.tsx:230`, `src/app/register/provider/page.tsx:225`) and rows are materialized by the `handle_new_user` auth trigger (`supabase/migrations/20260603_phase1_001_profiles.sql`, `20260614_auto_create_role_profiles.sql`, `20260630_handle_new_user_sectors.sql`). Therefore **A1 (welcome) and A5 (lawyer verification) can only be driven by Supabase DB webhooks** on INSERT — a Next.js push has no code path to hook. A2 (new request) is dual-capable: `POST /api/v1/service-requests` (`route.ts:150-176`) already runs `recordEvent(... SERVICE_REQUEST_CREATED)`, but the recommended trigger is still a Supabase DB webhook on `service_requests` INSERT (matches `wf-2.1` template + plan §"Supabase DB Webhooks", avoids adding a push at every create site incl. `client-workflow/_supabase.ts:34`).

**Events already firing today** (so we know what a Next.js push could carry) — from grep of `recordEvent`/`namespaceEvent`:
- `service_request.created` — `src/app/api/v1/service-requests/route.ts:162-176`, `src/app/api/v1/service-requests/[id]/events/route.ts:84-92`, `src/app/api/client-workflow/_supabase.ts:34,155`.
- `service_request.status_changed` / `service_request.updated` — `src/app/api/v1/service-requests/[id]/route.ts:134-138` (this is what flips to `assigned`/`completed`), `_supabase.ts:189-199`.
- `task.created` / `task.status_changed` — `src/app/api/v1/lawyer/tasks/route.ts:182,255`.
- Vocabulary constants: `src/lib/events.ts:62-77` (`SERVICE_REQUEST_COMPLETED`, `..._STATUS_CHANGED`, `CONSULTATION_CREATED`, etc.).

Note: `request_events` has **no `metadata` column** (`events.ts:12-15`) — n8n must re-fetch the full row via `{{$json.body.entity.id}}` (plan §Payload Contract), it cannot route on rich metadata until the migration below lands.

---

## BUILD PLAN — per workflow

### A1 — Welcome email + WhatsApp  ·  `wf-1.1`  ·  path `/new-user`
- **Trigger source:** **Supabase DB webhook**, INSERT on `profiles` (only option — auth-trigger creates the row, no JS insert to push from).
- **App-side change:** none. (Optionally seed `welcome` + `request-received` email templates in the repo, but they live in n8n/Resend.)
- **n8n nodes:** `[Supabase Webhook /new-user] → [If has phone] → [Resend email: welcome] → [Evolution WhatsApp] → [Insert audit_log]`.
- **DB write-back:** `audit_log` row. Edge: no phone → skip WhatsApp.
- **Effort:** 1–2h (import template + creds).

### A2 — New request → notify lawyers + client confirmation  ·  `wf-2.1`  ·  path `/new-request`
- **Trigger source:** **Supabase DB webhook**, INSERT on `service_requests` (recommended). App already emits `service_request.created` so a Next.js push is *possible* via `dispatchToN8n` but not required.
- **App-side change:** none for DB-webhook route. (If push chosen: call `dispatchToN8n(RequestEvent.SERVICE_REQUEST_CREATED, payload)` after `recordEvent` in `service-requests/route.ts:176`.)
- **n8n nodes:** `[Webhook] → [Query matching lawyers (verified+accepting+specialization+city)] → [Split In Batches] → [Resend email each] → [Evolution WhatsApp each] → [Insert notifications per lawyer] → [Resend email: client confirmation]`.
- **DB write-back:** one `notifications` row per matched lawyer.
- **Effort:** 3–4h.

### A3 — Request assigned → notify client  ·  `wf-2.2`  ·  path `/request-assigned` (or shared `/request-status` filtered `status=assigned`)
- **Trigger source:** best via **Next.js push** — the status flip happens in `PATCH /api/v1/service-requests/[id]` (`route.ts:134-138`) which already computes `SERVICE_REQUEST_STATUS_CHANGED`; a DB webhook on UPDATE also works but fires on every update and must self-filter.
- **App-side change:** after the existing `recordEvent` in `[id]/route.ts:138`, add `await dispatchToN8n(event, payload)` (build payload with `buildWebhookPayload`). Guard on `newStatus === "assigned"`.
- **n8n nodes:** `[Webhook] → [Fetch client+lawyer] → [Resend email client] → [Evolution WhatsApp client] → [Insert notification]`.
- **DB write-back:** client `notifications` row.
- **Effort:** 1–2h.

### A4 — Request completed + review (+24h)  ·  `wf-2.3`  ·  path `/request-completed`
- **Trigger source:** **Next.js push** on the same `[id]/route.ts` status flip, guard `newStatus === "completed"` (event already resolves to `SERVICE_REQUEST_COMPLETED` in `n8n/trigger/route.ts:71`). DB-webhook UPDATE alternative allowed.
- **App-side change:** same `dispatchToN8n` call as A3, different guard.
- **n8n nodes:** `[Webhook] → [Resend email: completion receipt] → [Insert notification] → [Wait 24h] → [Resend email: review-request]`.  ⚠️ Wait node needs n8n in persistent/queue mode.
- **DB write-back:** completion `notifications` row.
- **Effort:** 2–3h.

### A5 — Lawyer verification  ·  `wf-1.2`  ·  paths `/verification` (INSERT) + `GET/POST /lawyer-approval` (admin callback)
- **Trigger source:** **Supabase DB webhook**, INSERT on `lawyer_profiles` (auth-trigger row, no JS insert).
- **App-side change:** none. Requires an admin row in `profiles` (`user_type='admin'`).
- **n8n nodes:** `[Webhook] → [Fetch profile] → [Email admin] → [Wait for callback] → [If approved] → [Update lawyer_profiles.is_verified] → [Email lawyer]`.
- **DB write-back:** `lawyer_profiles.is_verified` + `audit_log`.
- **Effort:** 2–3h.

### A6 — Consultation reminder (24h + 1h)  ·  `wf-4.2`  ·  Cron every 30 min
- **Trigger source:** **n8n Schedule trigger** (no app involvement — queries Supabase directly).
- **App-side change:** none. **Prerequisite migration required** (below) — `consultations.reminder_sent` / `reminder_1h_sent` do not exist yet (confirmed absent from `20260518_client_workflow_backend_ready.sql`).
- **n8n nodes:** `[Cron] → [Query upcoming consultations] → [Route 24h / 1h] → [Email+WhatsApp / WhatsApp urgent] → [Set reminder flag]`.
- **DB write-back:** `consultations.reminder_sent` / `reminder_1h_sent = true`.
- **Effort:** 2–3h (blocked on migration).

### A7 — WhatsApp service triage (AI)  ·  `wf-4.1`  ·  path `/whatsapp-incoming`
- **Trigger source:** **Evolution API webhook** (external → n8n directly; NOT Supabase, NOT Next.js).
- **App-side change:** none. Prereqs: Evolution API installed + instance `nzamy_main` + LLM creds in n8n + `profiles.phone` stored in JID-matchable form.
- **n8n nodes:** `[Evolution Webhook] → [Check profiles by phone] → [AI classify intent] → [Switch] → consultation/request/inquiry/complaint inserts + WhatsApp reply`.
- **DB write-back:** `consultations` or `service_requests` insert.
- **Effort:** 4–5h.

---

## App-side glue (the ONLY code changes needed for Section A)

**1. Add `src/lib/n8n/dispatch.ts`** (new) — mirrors the live outbound pattern in `src/app/api/ai/library-chat/route.ts:41-56` (fetch + `X-Webhook-Secret`, best-effort, never throws to the caller):
```ts
import type { WebhookPayload } from "./payload";

/** Maps a namespaced event → the n8n webhook path segment. */
const EVENT_PATH: Record<string, string> = {
  "service_request.created": "new-request",
  "service_request.status_changed": "request-status", // n8n branches on entity.status
  "service_request.completed": "request-completed",
};

/**
 * Best-effort outbound POST to n8n. Never throws — a dispatch failure must not
 * break the parent write (same contract as recordEvent in src/lib/events.ts).
 * No-op (returns {delivered:false}) when N8N_WEBHOOK_BASE_URL is unset.
 */
export async function dispatchToN8n(
  event: string,
  payload: WebhookPayload,
): Promise<{ delivered: boolean }> {
  const base = process.env.N8N_WEBHOOK_BASE_URL;
  if (!base) return { delivered: false };
  const path = EVENT_PATH[event];
  if (!path) return { delivered: false };
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.N8N_WEBHOOK_SECRET
          ? { "X-Webhook-Secret": process.env.N8N_WEBHOOK_SECRET }
          : {}),
      },
      body: JSON.stringify(payload),
      // don't hang a request handler on a slow n8n
      signal: AbortSignal.timeout(5000),
    });
    return { delivered: res.ok };
  } catch (err) {
    console.error("[dispatchToN8n] failed:", event, (err as Error).message);
    return { delivered: false };
  }
}
```

**2. Flip `POST /api/v1/n8n/trigger`** (`route.ts:78-88`) to actually send, replacing the console.log-only tail:
```ts
const { delivered } = await dispatchToN8n(event, payload);
return NextResponse.json(
  { data: payload, delivered, note: delivered ? "dispatched to n8n" : "n8n dispatch skipped (unset base URL or unmapped event)" },
  { status: 200 },
);
```
(import: `import { dispatchToN8n } from "@/lib/n8n/dispatch";`).

**3. `.env.example`** — add `N8N_WEBHOOK_SECRET=` (referenced by library-chat but never declared) and set `N8N_WEBHOOK_BASE_URL=https://n8n.asra3.com/webhook` in the deployment note.

**Note:** A3/A4's status flip in `src/app/api/v1/service-requests/[id]/route.ts` can either (a) call `dispatchToN8n` inline after `recordEvent` (line 138), OR (b) rely on a Supabase UPDATE webhook. Prefer a Supabase DB webhook to keep the flip in one place and avoid touching a high-blast-radius handler — see GitNexus note.

## Migrations

**`supabase/migrations/20260701_n8n_notification_layer.sql`** — idempotent; mirrors the additive-column style of `20260518_client_workflow_backend_ready.sql`:
```sql
begin;

-- WF A6: reminder de-dup flags on consultations (plan §"Before You Start")
alter table public.consultations
  add column if not exists reminder_sent boolean not null default false,
  add column if not exists reminder_1h_sent boolean not null default false;

-- WF routing on rich per-event metadata (recordEvent already accepts it in-code;
-- see src/lib/events.ts:12-15 — column is currently missing).
alter table public.request_events
  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- Speeds up the A6 cron window scan.
create index if not exists idx_consultations_reminder_window
  on public.consultations (scheduled_at)
  where reminder_sent = false or reminder_1h_sent = false;

commit;
```
Once the column exists, update `recordEvent` in `src/lib/events.ts:31-40` to persist `metadata` (add `if (metadata) row.metadata = metadata;`) — small follow-up, run impact first.

## MINIMUM launch-blocker subset (in-app-first beta)

Beta is "monopoly mode" (single-firm, in-app dashboards already real). The **hard blockers** for a credible beta are the transactional emails that close the loop the user cannot see in-app in real time:
- **A1 (welcome)** — first-touch, trivial, DB-webhook only. **BUILD.**
- **A2 (new request → notify lawyers/firm)** — otherwise a submitted request sits unseen. **BUILD.**
- **A3 (assigned → notify client)** — closes the "did anyone pick this up?" gap. **BUILD.**

**Deferrable for beta:** A4 review-email (nice-to-have; the 24h Wait also needs queue-mode n8n), A5 lawyer verification (monopoly mode = lawyers onboarded manually by admin), A6 reminders (needs the migration + consultation scheduling volume), **A7 WhatsApp triage (defer — hard-blocked on Evolution API + LLM creds, both not provisioned).**

So the launch-blocking build is **A1 + A2 + A3 + the `dispatchToN8n` glue + `welcome`/`request-received`/`request-assigned` email templates** (~8–11h). Everything else ships post-beta.

## Prerequisites (external, block the n8n side not the app side)
- n8n ↔ Supabase Postgres credential (all workflows).
- Resend SMTP/API credential in n8n (A1–A5).
- Evolution API provisioned + instance `nzamy_main` + webhook → `/whatsapp-incoming` (**A7 only** — hard blocker, defer A7 until done).
- LLM provider credential in n8n (A7 only).
- Supabase DB webhooks created (Dashboard → Database → Webhooks) for `profiles` INSERT, `service_requests` INSERT/UPDATE, `lawyer_profiles` INSERT (plan §"Supabase DB Webhooks to Create").

## Acceptance criteria
- [ ] `dispatchToN8n()` exists, is best-effort (never throws), no-ops when `N8N_WEBHOOK_BASE_URL` unset, and is unit-covered for the 3 mapped events + 1 unmapped.
- [ ] `POST /api/v1/n8n/trigger` returns `delivered:true` when base URL set and n8n 2xx; `delivered:false` otherwise.
- [ ] Migration applied: `consultations.reminder_sent`, `consultations.reminder_1h_sent`, `request_events.metadata` all present; re-running the migration is a no-op.
- [ ] A1 fires a welcome email on real `supabase.auth.signUp` (profiles INSERT webhook) and logs `audit_log`.
- [ ] A2 fires lawyer emails + `notifications` rows + client confirmation on a real `POST /api/v1/service-requests`.
- [ ] A3 fires a client email + notification when a request flips to `assigned`.
- [ ] No regression: with `N8N_WEBHOOK_BASE_URL` unset, all existing routes behave exactly as before (delivered:false, no thrown errors).

## Verification steps
- App glue: `curl -sX POST $APP/api/v1/n8n/trigger -H 'cookie: <session>' -H 'content-type: application/json' -d '{"requestId":"<id>","event":"service_request.status_changed"}'` → assert `delivered:true`; check n8n execution log for the run.
- Migration: `select column_name from information_schema.columns where table_name='consultations' and column_name in ('reminder_sent','reminder_1h_sent');` returns 2 rows; same for `request_events.metadata`.
- A1: register a client via `/register/client`, confirm welcome email received + one `audit_log` row.
- A2: create a request, confirm ≥1 lawyer email + `select count(*) from notifications where type='new_request'` increments.
- A3: PATCH a request to `assigned`, confirm client email + notification row.
- Negative: unset `N8N_WEBHOOK_BASE_URL`, repeat trigger curl → `delivered:false`, no 5xx.

## Ordering / dependencies
1. **First:** apply `20260701_n8n_notification_layer.sql` (unblocks A6 + metadata routing) — safe additive, no RLS change.
2. **Then:** ship `dispatchToN8n` + flip the trigger route (behind unset env → inert, safe to deploy ahead of n8n).
3. **Then, in n8n:** create Supabase credential → import `wf-1.1`, `wf-2.1`, `wf-2.2` → set Resend/Evolution creds → validate → activate → create the matching Supabase DB webhooks.
4. **Set** `N8N_WEBHOOK_BASE_URL` + `N8N_WEBHOOK_SECRET` in prod env last (this is the go-live switch).
- **RLS interaction:** n8n queries Supabase with the **service-role key** (bypasses RLS) — the lawyer-matching SELECT and `notifications`/`audit_log`/`is_verified` writes in A2/A3/A5 rely on that; do not point n8n at the anon key. The Next.js `/api/v1/n8n/trigger` still uses the RLS-bound user client (`route.ts:20`), so it only assembles payloads for rows the caller can see — n8n re-fetches the authoritative row service-side.
- A6 depends on step 1 migration. A7 depends on Evolution + LLM prereqs and is deferred.

## GitNexus pre-edit (repo-mandated `impact({direction:'upstream'})`)
- `buildWebhookPayload` — reused by the trigger route; confirm no other caller breaks when dispatch is added.
- `recordEvent` — before adding `metadata` persistence (used at 6+ insert sites per grep).
- The `POST` handler in `src/app/api/v1/service-requests/[id]/route.ts` (status-flip handler) — HIGH blast risk; run impact before adding any inline `dispatchToN8n` there (prefer the DB-webhook route to avoid editing it).
- `dispatchToN8n` is net-new (no upstream), but run impact on the `n8n/trigger` `POST` route symbol before editing its return block.


---

## 8. Production-hardening gaps (NOT covered by the specs above)

The adversarial pass flagged these as real production concerns that **no §7 spec addresses**. Most are deferrable past the beta gate, but the two marked 🔒 touch security and should be resolved before or with launch. This roughly maps to `NEXT_STEPS.md` Phase 7 (≈4–6 days).

1. NO RATE LIMITING anywhere. No spec adds throttling to unauthenticated/auth surfaces: /api/library/search (POST, now the primary search path in spec #2 — trivially abusable for FTS DoS), /api/library/autocomplete, /api/v1/service-requests POST (row-creation spam), register endpoints, and the new /api/library/folders/items POST. A production Next.js app needs at least IP-based rate limiting (middleware or per-route). Not covered by ANY spec.

2. NO ZOD / SCHEMA VALIDATION on request bodies. Every rewritten/new handler (folders/items POST, service-requests POST via repoint, profile PATCH dual-allowlist, library/search POST) trusts `await request.json()` shape. The paywall and folder specs pass user JSON straight into Supabase inserts/queries. No spec introduces input validation; malformed `page`/`limit`/`section` in search, or non-string `entityId`, will surface as 500s or unexpected queries.

3. NO ERROR MONITORING / OBSERVABILITY. Specs replace `console.log` (n8n) and add `console.error` in many places but no spec wires Sentry/structured logging. `dispatchToN8n` swallows failures silently (by design) — with no monitoring, a broken n8n webhook means notifications silently stop with zero alerting. Production launch needs at least one error sink.

4. NO PDPL / DATA-PROTECTION posture. This is a Saudi legal-tech app handling national IDs (register spec 5.5 validates Iqama/ID), legal case content, and consultation attachments. No spec addresses PDPL (Saudi Personal Data Protection Law): consent capture, data-retention limits, audit-log of PII access, or the n8n service-role writes of PII into audit_log/notifications (spec n8n-A). The n8n audit_log rows will contain names/phones written via service-role with no retention policy.

5. 🔒 storage bucket / signed-URL security not audited. Spec 5.2 uploads consultation attachments to the `documents` bucket keyed by requestId, and spec #6 relies on `documents` storage policies from 20260629, but NO spec verifies the storage RLS actually scopes reads to request participants. The consultation attachment verification step even says 'open the file via signed URL' without confirming a non-participant cannot mint one. Storage-object RLS is a known-fragile area (the git log shows 3 recent commits fixing storage.objects policy ownership errors) and deserves an explicit audit finding.

6. cross_section_search materialized view is NOT refreshed after the FTS migration backfill for the DECREE/PRINCIPLE/FEQH content, and no scheduled refresh exists. Spec #2 recreates the MV `with data` at migration time (good), but the MV is only re-populated on manual `refresh_cross_section_search()`. If any seed load runs AFTER the migration (spec #2 itself notes seeds may load later and says triggers auto-populate base-table fts — true — but the MV does NOT auto-refresh). Any search path that reads the MV will be stale. Spec #2's own routes query base tables not the MV, so low impact, but the gap (no periodic MV refresh) is unaddressed for any consumer that does use it.

7. No spec covers the OTHER unauthenticated/public API routes beyond the client-workflow audit. Spec #1's service-role audit table is thorough for service-role holes, but the library detail routes (decrees/precedents/books/laws) are publicly reachable with no auth AND no rate limit — spec #3 secures the paywall content but not abuse. Also /api/ai/library-chat (referenced in n8n spec as the outbound pattern) is not in any audit. A full 'every /api route' inventory with auth+ratelimit+validation columns is missing.

8. 🔒 n8n webhook inbound authentication is asymmetric. Spec n8n-A adds `X-Webhook-Secret` on the OUTBOUND dispatch (app→n8n), but the INBOUND Supabase DB webhooks (profiles/service_requests/lawyer_profiles INSERT → n8n) and the Evolution/WhatsApp inbound webhook have no described shared-secret verification on the n8n side. An attacker who discovers the n8n webhook URLs (/new-user, /new-request) could forge notification/DB-write events. No spec specifies n8n-side auth on inbound webhooks.

**Recommended handling for beta:** do 🔒 items now; add basic IP rate limiting to the 4 unauthenticated POST surfaces (library/search, autocomplete, service-requests POST, folders/items POST) and Zod validation on those same handlers as a fast-follow; wire one error sink (Sentry) before go-live; schedule the PDPL work as an explicit pre-GA milestone.

---

## 9. Pre-flight deploy checklist

- [ ] **`NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND=supabase`** is set in the production env. *(If unset, the whole app silently falls back to client-side demo-role selection = total auth bypass. This one variable gates real-vs-demo behavior — assert it at startup per §7.7.)*
- [ ] **`NEXT_PUBLIC_APP_ENV`** is NOT left at the `.env.example` default of `development` in prod (would no-op the env assertion — §7.7 correction keys the guard off `NODE_ENV` instead).
- [ ] `NEXT_PUBLIC_LIB_DEMO_FALLBACK` is unset/`0` in prod (keeps demo library data out).
- [ ] All migrations from §6 applied; run the `_verify.sql` and confirm: `lawyer_profiles.is_accepting_clients`/`city` exist; `platform_settings.payments_gateway` row exists and is `disabled`; `documents` storage bucket + participant-scoped storage RLS exist; new `fts` columns backfilled (row counts match).
- [ ] `deploy.sh` runs `npx supabase db push` (§7.7).
- [ ] Beta directory pages confirmed unreachable (or gated) per §7.7; monopoly mode verified on staging.
- [ ] `payments_gateway` confirmed `disabled`; all 3 client payment call-sites block; wallet/finance show the "being activated" banner.
- [ ] `demo-accounts.ts` / `test-credentials.ts` are dead in supabase mode (verified) — leave for the Phase-7 teardown, but confirm no build-time leak of `Nzamy@2026` matters (accounts must not exist in the real Supabase Auth DB).
- [ ] `tsc --noEmit` = 0, `next build` = exit 0, `eslint .` passes (after §7.7).
- [ ] Supabase automated backups / PITR enabled.

---

## 10. Risk register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| FTS migration (§7.2) drops/rebuilds columns on a live seeded DB | Med | High (search downtime / data) | Maintenance window; snapshot first; verify backfill row counts before frontend flip |
| Repoint (§7.1) changes the request read/write contract | Med | Med | Delegate to existing `workflowService` (reviewer correction); e2e test create→list→cancel before/after |
| Prereq migrations (`20260616`/`20260630`) not actually applied in prod | Med | High (role reads null; profile/infra break) | §6 step 1 verify queries are a hard gate |
| Beta directory pages reachable → fabricated "licensed lawyers" shown | Low | High (legal/trust) | §7.7 confirm-and-gate step |
| `NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND` misconfigured in prod | Low | Critical (auth bypass) | Startup assertion (§7.7) + deploy checklist |
| No rate limiting on public POST routes (§8) | Med | Med (DoS/spam) | Fast-follow IP limiting on 4 surfaces |
| n8n inbound webhooks unauthenticated (§8 🔒) | Med | Med (forged events/PII writes) | Shared-secret on inbound before enabling |

---

## 11. Out of scope / deferred for the beta

Intentionally **not** part of this launch (documented so nobody "fixes" them under time pressure):

- **Multi-vendor marketplace / public lawyer directory** — hidden by `BETA_MONOPOLY_MODE`. The mock directory pages, `getLawyers()` shape mapper, and `marketplace_visible` write are future work (§7.7 only *confirms they're hidden*).
- **Real payment provider** — gated `disabled`; provider decision (Moyasar/Tap/HyperPay) + wiring is a separate phase (`payments-gateway-admin-gate.md`, `NEXT_STEPS.md` Phase 4).
- **Sector dashboards** (firm/business/provider/gov/ngo/micro admin) — `NEXT_STEPS.md` Phase 6.
- **n8n Section B** (escalation, billing workflows, moderation) — after Section A + payments.
- **Full beta teardown** (delete `demo-accounts.ts`/`test-credentials.ts`, remove `BETA_*` flags) — do when exiting beta; safe to leave now because they're client-only and gated off in supabase mode.
- **AI tools** beyond the library assistant — many are BetaReviewGate-wrapped by design.

---

## 12. Effort & timeline

| Workstream | Effort |
|-----------|--------|
| §7.1 Security IDOR | 5h |
| §7.2 Library search + FTS | 14h |
| §7.3 Library paywall | 3h |
| §7.4 Library fake-content + folders | 14h |
| §7.5 Lawyer profile | 6h |
| §7.6 Client my-group + attachments + mediums | 9h |
| §7.7 Infra (eslint/middleware/deploy/beta) | 7h |
| **MVP subtotal (7.1–7.7)** | **~58h (~1.5–2 wks, 1 eng)** |
| §7.8 n8n Section A | 26h |
| §8 Hardening (rate-limit/Zod/Sentry/PDPL/storage-audit) | ~4–6 days (separate) |

**Recommended cut for a first beta:** §7.1–§7.7 + the two 🔒 §8 items → in-app beta with no automated notifications, then §7.8 as a fast-follow.

---

## 13. Verification & acceptance matrix

Per-spec acceptance criteria are in each §7.x block. System-level acceptance for the beta:

- [ ] A real client registers → creates a service request → it is stored under **their** `auth.uid()` and **cannot** be read/modified by another logged-in user (curl the old `client-workflow` path is 404; the `service-requests` path enforces RLS).
- [ ] A guest opens a decree/precedent/feqh book → only the free-limit items are returned; locked content is **not** in the payload.
- [ ] Library search returns matches from beyond the first 200 rows; `الإثبات` matches stored `الاثبات`; `١٤٤٤` matches `1444`.
- [ ] A lawyer opens their profile → sees **their** real name/data and a verification seal driven by real `verification_status` (not a hardcoded badge); can edit bio → persists across reload.
- [ ] The library shows an honest empty state (no fake laws/folders) when the DB is empty in prod.
- [ ] `my-group` shows no fabricated money-owed/quota; the billing block is gated "قريباً" or real.
- [ ] Consultation attachments actually upload and attach to the created request.
- [ ] `eslint .` passes; `tsc`/`build` stay green; middleware 401/redirects unauthenticated access to `/dashboard/**` and `/api/v1/**`.

---

## 14. GitNexus mandate (apply on every edit)

Per `CLAUDE.md`, before editing any symbol run `impact({target, direction:"upstream"})`, report blast radius, and **stop to warn on HIGH/CRITICAL**. Each §7 spec lists the specific symbols to check. Before committing each workstream, run `detect_changes()` (or `detect_changes({scope:"compare", base_ref:"main"})`) to confirm only the expected symbols/flows changed. Never rename with find-and-replace — use `rename`. Refresh the index first if any tool reports it stale (`node .gitnexus/run.cjs analyze`).

---

## 15. Appendix — what this review did

**Method:** read the canonical docs (`DOCUMENTATION_INDEX.md`, `NEXT_STEPS.md`, `nzamy-audit-fix-status.md`), ran the three build gates, then ran three parallel deep code reviews (library / client / lawyer) whose findings I independently re-verified in the source, then an 8-way parallel remediation analysis + adversarial completeness pass to produce §7–§8.

**Gates run:** `tsc --noEmit` (0 errors), `next build` (exit 0), `eslint .` (config broken), inspected the build output.

**Key files inspected during verification:** `src/app/api/client-workflow/*`, `src/app/api/library/{search,autocomplete,init,folders,decrees,precedents,books,laws}/*`, `src/app/laws/{page.tsx,demo-data-access.ts,components/SmartFolders.tsx}`, `src/app/dashboard/lawyer/profile/page.tsx`, `src/app/api/v1/profile/route.ts`, `src/app/dashboard/client/my-group/page.tsx`, `src/lib/{betaConfig.ts,demo-accounts.ts,test-credentials.ts,clientWorkflowRepository.ts}`, `src/app/login/page.tsx`, `src/hooks/useUser.ts`, `supabase/migrations/*`, `eslint.config.mjs`, `.env.example`.

**Corrections to the older docs:** `nzamy-audit-fix-status.md` marks several of the above as "fixed" (library search/FTS, referral/mediums, lawyer detail pages). The *detail pages* are genuinely real now, but **search is dead code**, the **paywall regressed on 3 content types**, the **lawyer profile never leaves mock**, and **fake laws/folders still render** — treat this file as the current source of truth.

*Provenance of §7/§8: generated by a 9-agent workflow (8 remediation analyses + 1 adversarial review), ~1.02M tokens, all findings verified against current source.*
