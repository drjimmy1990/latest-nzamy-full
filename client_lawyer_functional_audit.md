# NZAMY — Client & Lawyer Dashboard Functional Audit (Review + Plan)

> **Generated:** 2026-06-28 · **Method:** four parallel read-only investigations (lawyer dashboard, client dashboard, backend API + webhook data flow, DB schema/RLS/migrations) using GitNexus (`latest-nzamy-full`) + file inspection. No code was modified.
> **Scope:** every client & lawyer dashboard write/create/update action + the backend routes/services/DB that feed them. n8n-dependent notification features are out of scope (not built yet) — but the **data that should persist regardless of n8n** is in scope, and the **webhook/n8n readiness** of the backend is reviewed.
> **Severity:** 🔴 critical (feature broken / silent data loss) · 🟡 high-medium (degraded / latent landmine) · 🟢 low (polish)

---

## ✅ Resolution Status (2026-06-28)

Subsequent fix passes (16-finding audit pass + post-review follow-up commit `432380d` + F7/L11/consultation-room completion pass) closed most of the critical findings below. Verification: `tsc --noEmit` 0 errors, `next build` exit 0, `gitnexus_detect_changes` clean (index `latest-nzamy-full`).

**Now fixed (mark ✅ in the fix plan):**
- **F3 — chat `content`/`body` mapping ✅** — chat service + route aligned; client `consultation/[id]` chat wired to real `chatService` via `related_id`.
- **F4 — task persistence ✅** — `onToggle`/archive/restore persist via `updateLawyerTaskStatus`; Kanban drop in `lawyer/cases` captures `originalCol` for correct revert. (Kanban column/status mapping for cases — L2/L3 — was already addressed in the 16-finding pass.)
- **F6 #3 — detail-page rewire ✅** — see L11 below.
- **F7 — n8n readiness prep ✅** — `src/lib/events.ts` (`recordEvent` + namespaced `RequestEvent` vocabulary), `src/lib/n8n/payload.ts` (`buildWebhookPayload`), `POST /api/v1/n8n/trigger` (assembles + logs, returns `{data, delivered:false}`, no outbound call). All write-route event inserts standardized with `actor_user_id` + `actor_name`. Importable n8n workflow JSONs at `n8n/workflows/` + `n8n/README.md`.
- **F8 — verification ✅** — tsc + build green; `gitnexus_detect_changes` clean.
- **L11 — lawyer `cases/[id]` off `CASES_DB` ✅** — real fetch via new `casesService.getServiceRequestDetail(id)` → `GET /api/v1/service-requests/[id]` (returns `events` + `attachments`); 7 tabs preserved; mock AI score → honest "تحليل AI قريباً".
- **Client `cases/[id]` off `MOCK_CASES` ✅** — real fetch + clean not-found.
- **Lawyer `clients/[id]` off `MOCK_CLIENTS/CASES/CONTRACTS/CONSULTATIONS` ✅** — real client via `getLawyerClients()` + related `service_requests`; `.catch(()=>{})` → error banner.
- **Client `consultation/[id]` off `MOCK_CONSULTATIONS` + fake `setTimeout` lawyer reply ✅** — chat wired to real `chatService`; `SessionChatPane` kept presentational.
- **Payment gate ✅** — admin `platform_settings.payments_gateway` flag, `getPaymentGatewayStatus()`, `GET /api/v1/payments/status` (no-store), 3 gated call-sites (`consultation/new`, `requests/new`, `find-lawyer`) gated on `!payments.loading`; server-side defense in `_supabase.ts`. Real provider deferred. See `payments-gateway-admin-gate.md`.
- **Documents upload ✅** — `documentService` rewritten to match `attachments` table + storage upload + DELETE route; migration `20260628_documents_upload.sql`. (End-to-end upload requires the unapplied `20260629` migration — see below.)
- **Tasks persistence ✅** — see F4.
- **Mock-data sweep ✅** — `MOCK["1"]`/`CASES_DB["1"]`/`MOCK_CASES["2025-001"]`/`MOCK_CLIENTS`/`MOCK_CONSULTATIONS`/`MOCK_MESSAGES`/fake `setTimeout` reply/`REVENUE_DATA`/`ref=JUDGE47`/frozen `٤٧:١٣` timer/`walletBalance=150` etc. removed; sector pages gated behind `DashboardComingSoon.tsx`.

**Still deferred (not done):**
- **F0 — apply migrations.** `20260628_documents_upload.sql` + `20260628_payments_gateway.sql` + `20260629_payments_and_storage_policies.sql` are committed but **NOT applied to the DB**. Run `npx supabase db push`. Until applied: documents bucket + `attachments.request_id` nullable + `payments_gateway` seed + `payments.id` default + `payments.payer_user_id` column + storage.objects RLS for the documents bucket do not exist end-to-end.
- **F1 — mock-modal pattern (remainder).** `AddCaseModal`/`AddHearingModal`/`AddClientModal`/consultations booking confirm/finance "new invoice" — these create flows are still UI-only or partially wired (not part of the F7+L11 pass).
- **F2 — backend insert/query bugs (remainder).** B1/B2/B3/B4/B5/B6/B7/B12 from §5.1/§5.2 not addressed in the F7+L11 pass (some were mitigated by the 16-finding pass; verify against current routes before claiming fixed).
- **F5 — My Group + mock-data display (remainder).** C4/C8/C9/C10/C11 — not in the F7+L11 pass.
- **F6 #1/#2/#4 — response-envelope convention + full `.catch(()=>{})` sweep + `casesService.createConsultation`.** Representative error UI added; full sweep of all ~20 sites not done. Remaining bare `.catch(()=>{})` sites: client `my-group`, lawyer `cases`/`contracts`/`hearings`/`clients`/`finance`/`profile`/`activity`/`tasks`.
- **n8n hosting + sending** — `POST /api/v1/n8n/trigger` only assembles + logs; no outbound delivery.
- **`request_events.metadata` column** — schema gap; `recordEvent` accepts `metadata` for forward-compat but does not persist it. Future migration required.
- **Lawyer `consultations/[id]`** — not re-checked this pass.
- **Sector dashboards** (`business`/`government`/`firm`/`provider`/`admin-celebrities`) — Phase 6, out of scope; mock / `DashboardComingSoon`-gated.
- **Library P2 items** — demo-data gating, FTS/GIN indexes, `seed-library.ts --clean`, `smart_folder_items` DELETE ownership, `parse-feqh.ts volume:1`, `precedents/judgment/[slug]` route, AI stubs gate.

See `nzamy-audit-fix-status.md` for the full done/deferred ledger.

---

## 0. Your specific bug: "I added a case as a lawyer but it didn't appear"

**Root cause (confirmed):** The "Add Case" modal is a **pure UI mock** — it never calls the backend at all.

- `src/app/dashboard/lawyer/_components/AddCaseModal.tsx` — the inputs (client name, title, court, assignee, priority) are uncontrolled `<input>`/`<select>` with **no state**, and the "حفظ واعتماد" button's only handler is `onClick={() => setDone(true)}`. It shows a success screen ("تم إضافة القضية بنجاح!") **without writing anything**. On reload the case is gone.
- This is not an RLS/visibility issue. RLS actually *would* let a verified lawyer see an unassigned case (`20260616_production_readiness_fixes.sql` marketplace policy). The case simply was never created.

**This same "mock modal" pattern is the single biggest class of bugs in both dashboards** — see §3.1 and §4.1. Fixing it is Priority 1.

---

## 1. Executive summary

The dashboards **read** real data correctly in most places, but a large fraction of **create/update actions are local-only UI theatre** — they mutate React state (or localStorage) and never hit Supabase, so the data vanishes on reload. A second class of bugs sends payloads the backend **rejects** (wrong column names, wrong status enums, missing PK defaults), and the failures are **silently swallowed** by `.catch(()=>{})`. A third class is **unapplied migrations** — several "fixed" issues exist only in committed-but-unapplied `.sql` files.

**Headline numbers:**
- 🔴 **~18 critical bugs** across the two dashboards + backend + DB.
- **6 "Add/Create" modals/flows** are pure mocks with no backend call (cases, hearings, consultations booking, contracts draft, clients, finance invoice, tasks add).
- **Entire chat feature is broken** (`content` vs `body` field mismatch — every send 400s, every loaded message renders as an empty bubble).
- **Document upload is impossible** until storage RLS policies are applied (they're commented out in the migration).
- **n8n trigger layer does not exist** — no `/api/v1/n8n/trigger`, no webhook payload assembler. Wiring n8n later requires building this from scratch.
- **~3 migrations are committed but likely not applied** to the DB — including the one that fixes most "didn't appear" symptoms.

---

## 2. Cross-cutting root causes (fix these patterns once, kill many bugs)

### RC-1 · "Add" modals are UI-only mocks (no backend call)
`AddCaseModal`, `AddHearingModal`, `AddClientModal`, contracts `saveDraft`/`sendSign`, consultations booking confirm step, finance "new invoice", tasks `addTask`. All show success without persisting. **Fix:** wire each to `createWorkflowRequest` (or a new POST route) and dispatch `nzamy-workflow-updated` so the list re-syncs.

### RC-2 · camelCase ↔ snake_case + response-envelope mismatches
- v1 routes (`/api/v1/service-requests`, `/consultations`) return `{ data: <row> }`, but `workflowService`/`casesService` call `apiMutate<WorkflowRequest>()` expecting a **bare** object → `.id`, `.status` are `undefined`.
- PATCH sends `sourcePath`/`assignedTo` (camelCase); the `[id]` route has a keyMap but POST does not.
- GET returns snake_case rows (`created_at`, `source_path`); frontend reads `createdAt`/`sourcePath` → `undefined` → invalid dates.
**Fix:** pick one convention. Recommended: standardize on `{ data }` envelope + unwrap once in `apiGet`/`apiMutate`; map snake_case→camelCase in route responses.

### RC-3 · Status vocabulary mismatches vs the DB CHECK constraint
`service_requests.status` CHECK = `draft|pending_payment|pending_assignment|assigned|in_review|completed|cancelled`. Code writes values **not in this list**:
- Tasks: `todo`/`in_progress`/`done`/`archived` → 500.
- Client dashboard summary: filters on `submitted`/`approved` → empty.
- Lawyer clients `activeCount`: checks `in_progress`/`pending` → undercounts.
**Fix:** map task/dashboard statuses to the real enum, or store task state in a `metadata`/`tasks` column instead of overloading `service_requests.status`.

### RC-4 · Silent error swallowing (`.catch(()=>{})`)
Hides every 500/400 so failures look like success. **Fix:** replace with `catch(err => { setError(...); setLoading(false); })` + a shared `<ErrorState/>` banner (the audit pass started this — finish the sweep).

### RC-5 · Non-existent columns queried/inserted
`payments.payer_user_id`, `consultations.notes`, `referrals.referrer_user_id`/`referred_user_id`/`reward_amount`, `lawyer/finance` (`gateway`/`gateway_ref`/`paid_at`/`balance_after`/`note`), `lawyer/activity` (`actor_user_id` on `admin_audit_events` — it's `actor_id`). Each causes a 500 (caught → empty) or a rejected insert. **Fix:** align routes to actual schema columns.

### RC-6 · Unapplied migrations
`20260616_production_readiness_fixes.sql` (the big fix: marketplace RLS, `is_accepting_clients`, `handle_new_user` upgrade, status CHECK, attachments RLS) **may not be on the DB**. `20260628_documents_upload.sql` + `20260628_payments_gateway.sql` are confirmed unapplied. Storage RLS policies are **commented out**. **Fix:** `npx supabase migration list --linked` to verify, then `npx supabase db push`.

---

## 3. Lawyer dashboard findings

### 3.1 Critical (create/update broken)
| # | Bug | File:line | One-line fix |
|---|-----|-----------|--------------|
| L1 🔴 | Add Case modal = mock, no create call | `_components/AddCaseModal.tsx:92` | wire to `createWorkflowRequest({type:"service", receiver:"lawyer", …})` + dispatch `nzamy-workflow-updated` |
| L2 🔴 | Kanban drop sends `undefined` status for 3/4 columns (column keys `active/pending/suspended/closed` vs `statusForCol` keys `new/docs_prep/hearing/appeal/closed`) | `cases/page.tsx:74-85` + `lawyerCasesData.ts:140` | reconcile column sets or remap `active→assigned, pending→pending_assignment, suspended→in_review` |
| L3 🔴 | Drag to "closed" persists (`completed`) but `workflowToCase` maps `completed`→`pending` on read-back → case jumps back | `lawyerCasesData.ts:69-92` | add `completed→closed`, `cancelled→archived` in `workflowToCase` |
| L4 🔴 | Task toggle/status/archive/restore send `todo/in_progress/done/archived` → CHECK 500 → revert | `tasks/page.tsx:176-214` → `lawyer/tasks/route.ts:97` | map to valid statuses or use a `metadata` field |
| L5 🔴 | Task Kanban drag never calls backend (only `setTasks`) | `tasks/page.tsx:242-247` | call `updateLawyerTaskStatus` in `onDrop` |
| L6 🔴 | "Add task" local-only (`id: Date.now()`); no `POST /api/v1/lawyer/tasks` exists | `tasks/page.tsx:227-239` | add POST route + call it |
| L7 🔴 | Task delete local-only | `tasks/page.tsx:198` | `updateLawyerTaskStatus(id,"cancelled")` before filter |
| L8 🔴 | Hearings list casts `WorkflowRequest[]`→`CalEvent[]` with incompatible shapes → every event filtered out → always empty | `hearings/page.tsx:457-464` | write a real `workflowToHearing()` mapper |
| L9 🔴 | Add Hearing modal = mock | `_components/AddHearingModal.tsx:114` | wire to `createWorkflowRequest` with date/time/type metadata |
| L10 🔴 | Consultations booking confirm step discards collected data (no create call) | `consultations/page.tsx:274-281` | call `createWorkflowRequest({type:"consultation", …})` on confirm |
| L11 🔴 | Case detail page is pure mock (`CASES_DB`); real ids 404; all detail actions no-op | `cases/[id]/page.tsx:66-155` | fetch `GET /api/v1/service-requests/{id}` + map; wire write actions |

### 3.2 High / medium
| # | Bug | File:line | Fix |
|---|-----|-----------|-----|
| L12 🟡 | Contracts `saveDraft`/`sendSign` local-only (`id: Date.now()`) | `contracts/page.tsx:151-158` | call `createWorkflowRequest` |
| L13 🟡 | Contracts delete/archive/restore on locally-created contracts → 404 swallowed by `.catch(()=>{})` | `contracts/page.tsx:128-150` | fixed once L12 persists real ids |
| L14 🟡 | Add Client modal local-only; `/api/v1/lawyer/clients` is GET-only | `AddClientModal.tsx:28-44` + `clients/page.tsx:71` | add POST or gate behind real service request |
| L15 🟡 | Lawyer `activeCount` undercounts (invalid statuses) | `api/v1/lawyer/clients/route.ts:37` | use `["pending_assignment","assigned","in_review"]` |
| L16 🟡 | Finance "new invoice" local-only; route is GET-only | `finance/page.tsx:199-200` | add `POST /api/v1/lawyer/finance` (insert into `payments`) |
| L17 🟡 | Hearing step toggles not persisted (UI already warns "غير محفوظ") | `hearings/page.tsx:162-166` | persist to `request_events`/`metadata` |
| L18 🟢 | GET returns snake_case; frontend reads camelCase → invalid `filedDate` | `service-requests/route.ts:58` vs `lawyerCasesData.ts:81` | map in route response (RC-2) |

### 3.3 What works on the lawyer side
- Reading existing cases/contracts/consultations from `service_requests` (reappears on reload).
- Contracts status/delete/archive/restore **on contracts that came from real service requests** (valid ids + valid statuses + `nzamy-workflow-updated` re-sync).
- Profile, Activity (read-only), Finance read path.

---

## 4. Client dashboard findings

### 4.1 Critical
| # | Bug | File:line | Fix |
|---|-----|-----------|-----|
| C1 🔴 | **Messages: every send 400s** — service sends `{content}` but route requires `{body}` (no `content` column on `chat_messages`) | `chatService.ts:91-97` vs `chat/rooms/[id]/messages/route.ts:96-101` | POST `{ body: content, … }`; surface send errors |
| C2 🔴 | **Messages: loaded messages render as empty bubbles** — same `content`/`body` mismatch on GET + realtime | `messages/page.tsx:230` + `useChat.ts:81` | read `m.body`; fix `ChatRoom.last_message` too |
| C3 🔴 | **Documents upload impossible** — `storage.objects` RLS policies are commented out in the migration | `20260628_documents_upload.sql:28-49` + `documentService.ts:84-90` | uncomment/apply storage policies (or dashboard) |
| C4 🔴 | **My Group "join with code" creates a new group instead of joining** — calls `createGroup` not a join; no `joinGroup` service/endpoint | `my-group/page.tsx:297-300` + `groupService.ts` | add `joinGroup` + match code against `group_invitations` |

### 4.2 High / medium
| # | Bug | File:line | Fix |
|---|-----|-----------|-----|
| C5 🟡 | Workflow create silently falls back to **localStorage** on any API failure; list then discards local rows → vanishes cross-device | `clientWorkflowRepository.ts:126-166` | in supabase mode, throw + surface error instead of local fallback |
| C6 🟡 | Documents list errors swallowed → returns `[]` as 200 (indistinguishable from "no documents") | `api/v1/documents/route.ts:26-35` | propagate errors + error banner |
| C7 🟡 | My Group create UI never refreshes + no error feedback (forced F5) | `my-group/page.tsx:259-262` | `try/catch` + `membership.refresh()` |
| C8 🟡 | My Group "دعوة عضو" never invokes `inviteToGroup`; invite link always empty (`invite_code` never set) | `my-group/page.tsx:316,345-348` | wire button; have groups API return invite code |
| C9 🟡 | My Group members render as raw UUIDs (no `profiles` join) | `api/v1/groups/[id]/members/route.ts:24` | join `profiles` |
| C10 🟡 | Wallet shows 7 fake transactions + 3 fake coupons when Supabase returns empty | `wallet/page.tsx:102-166,192-193` | clear mock once API resolves regardless of count |
| C11 🟡 | Referral friends list is hardcoded mock; real `data.friends` fetched then discarded | `referral/page.tsx:70-126,162-169` | render `data.friends` |
| C12 🟡 | `casesService.createConsultation` is a broken parallel impl (sends `type`/`lawyer_id`, route needs `mode`/`lawyer_user_id`/no `notes` column) — latent landmine | `casesService.ts:95-114` vs `consultations/route.ts:65-83` | delete or fix to match route |

### 4.3 What works on the client side
- **Requests (free):** new + list + cancel persist to `service_requests` and reappear after F5.
- **Payment gate:** honest on both sides — disabled gateway blocks creation loudly (not a silent drop).
- **Consultations booking:** persists via `clientWorkflowRepository` (the broken `casesService.createConsultation` is NOT used by the UI).
- **Wallet balance** (honest), **referral code + stats**, **find-lawyer search**, **documents delete + signed URLs** (once upload RLS is fixed), **contracts list** (read-only; sign disabled honestly).

---

## 5. Backend / API findings

### 5.1 Critical
| # | Bug | File:line | Fix |
|---|-----|-----------|-----|
| B1 🔴 | `POST /api/v1/service-requests` omits `id` → PK NOT NULL with no default → every insert 500s | `service-requests/route.ts:90-106` + `20260518…sql:5` | generate `crypto.randomUUID()` server-side |
| B2 🔴 | Payment insert broken: `payer_user_id` column doesn't exist + `payments` has no INSERT RLS policy + result unchecked | `service-requests/route.ts:124-131` | map to real columns; add INSERT policy; surface error |
| B3 🔴 | `POST /api/v1/consultations` requires `body.mode` (frontend sends `type`), reads `lawyer_user_id` (frontend sends `lawyer_id`), inserts `notes` (no such column), drops `topic` | `consultations/route.ts:65-83` | accept `type→mode`, `lawyer_id→lawyer_user_id`, `topic→specialty`, `description→metadata` |
| B4 🔴 | `GET /api/v1/referrals` queries non-existent columns (`referrer_user_id`, `referred_user_id`, `reward_amount`) → 500 | `referrals/route.ts:11-22` | use `referrer_id`/`referee_id`/`commission_amount`; count `status==='converted'` |

### 5.2 High / medium
| # | Bug | File:line | Fix |
|---|-----|-----------|-----|
| B5 🟡 | `lawyer/finance` selects non-existent columns (`gateway`/`gateway_ref`/`paid_at`/`balance_after`/`note`) + unscoped to lawyer → always empty | `lawyer/finance/route.ts:27-38` | use real columns; join `payments→service_requests.assigned_to=uid` |
| B6 🟡 | `lawyer/activity` uses `actor_user_id` on `admin_audit_events` (real column is `actor_id`) → audit log half silently dropped | `lawyer/activity/route.ts:33-35` | `.eq("actor_id", uid)` |
| B7 🟡 | Client dashboard summary filters on `submitted`/`approved` (not in CHECK) → "active cases" always empty | `dashboard/summary/route.ts:38` | use `["pending_assignment","assigned","in_review"]` |
| B8 🟡 | Consultation status vocabulary inconsistent across POST/type/dashboard/schema → unreliable filtering | `consultations/route.ts:79`, `casesService.ts:30`, `lawyer/dashboard/summary/route.ts:49` | pick one enum + add CHECK |
| B9 🟡 | `workflowService`/`casesService` **mutate** response-shape mismatch (`{data}` envelope vs bare) | `workflowService.ts:52,66` | unwrap `.data` (RC-2) |
| B10 🟡 | `client-workflow/_supabase.ts` writes user-scoped data with service-role key (bypasses RLS) + trusts client-supplied `requester_user_id` | `_supabase.ts:8-27,87-115` | auth in route + pass verified `user.id` |
| B11 🟡 | `_supabase.ts` event inserts omit `actor_user_id` → events invisible to lawyer activity feed | `_supabase.ts:29-36,180-184` | persist `actor_user_id` from session |
| B12 🟡 | v1 wrapper `POST /service-requests` skips the payment-gateway gate (client-workflow path enforces it) | `service-requests/route.ts:69-138` | call `getPaymentGatewayStatus()` |
| B13 🟢 | `GET /service-requests` has no `assigned_to` filter | `service-requests/route.ts:32-48` | add query param |
| B14 🟢 | `GET /wallet` returns all coupons unscoped; dead `refund` branch (CHECK is `credit/debit/pending/reversal`) | `wallet/route.ts:25-29` | filter by eligibility; use `reversal` |

### 5.3 What works in the backend
- GET paths for cases/consultations/documents/lawyer tasks/clients/activity/dashboard/summary (envelope + `.data` unwrap correct on reads).
- `client-workflow` path persists requests + events + payments (service-role) — used by the client request/consultation flows that actually work.
- `getPaymentGatewayStatus()` + `/api/v1/payments/status` (real, fail-closed).

---

## 6. DB / schema / RLS / migrations

| # | Issue | Status | Symptom |
|---|-------|--------|---------|
| D1 🔴 | `service_requests` status CHECK missing `'pending'` | Fixed-but-likely-unapplied (`20260616`) | route already uses `pending_assignment` (safe), but parity needed |
| D2 🔴 | `service_requests` SELECT RLS lacks verified-lawyer marketplace branch | Fixed-but-likely-unapplied (`20260616 §3`) | client→lawyer handoff invisible; lawyer marketplace empty |
| D3 🔴 | `attachments` RLS conflict + `request_id` NOT NULL | Fixed-but-likely-unapplied (`20260616 §4` / `20260628`) | document upload blocked |
| D4 🔴 | `storage.objects` RLS policies for `documents` bucket **commented out** | **OPEN** | browser uploads 403 — no document ever uploads (C3) |
| D5 🔴 | `lawyer_profiles.is_accepting_clients` + `city` missing | Fixed-but-likely-unapplied (`20260616 §1`) | lawyer search 500s |
| D6 🟡 | `handle_new_user` doesn't provision `lawyer_profiles`/`firm_profiles`/`user_settings` | Fixed-but-likely-unapplied (`20260616 §5`) | new lawyer invisible/unassignable; can't browse |
| D7 🔴 | `payments` table has no `payer_user_id` column; `id` has no default | **OPEN** (no migration fixes it) | payment insert fails (B2) |
| D8 🟢 | `platform_settings.payments_gateway` seed row | Fixed-but-unapplied (`20260628`) | admin toggle doesn't persist (fail-safe still works) |

**Unapplied migrations to verify + push:**
1. `20260616_production_readiness_fixes.sql` — **the highest-leverage single migration** (resolves D1/D2/D3/D5/D6).
2. `20260628_documents_upload.sql` — bucket + nullable `request_id`.
3. `20260628_payments_gateway.sql` — payment-gate seed.

Verify with: `npx supabase migration list --linked`. Apply with: `npx supabase db push`. Then apply D4 storage policies manually (or uncomment + push).

---

## 7. n8n / webhook readiness (you haven't built n8n yet — this is what's missing when you do)

- **No n8n/WhatsApp/webhook routes exist.** No `/api/v1/n8n/trigger`, no `/api/v1/whatsapp/webhook`, no payments webhook receiver, no DB-trigger payload assembler. Glob under `src/app/api` for `*n8n*/*whatsapp*/*webhook*` = nothing.
- **No fake `setTimeout` n8n replies** in any API route — good. The only stub is the clearly-labeled client-side `createPaymentIntentStub` (`provider:"stub"`), which is honest.
- **When you wire n8n, you must build a payload assembler.** Required fields not collected anywhere today: entity id, user id, user role, event type (namespaced, e.g. `service_request.created`), receiver, payment status. The raw `request_events` + `service_requests` + `profiles` join has all of these, but no code builds the JSON.
- **Event insertion is inconsistent:** v1 wrapper writes `actor_user_id` only; `_supabase.ts` writes `actor_name` only; event `event` strings are free-text (`"created"/"status_change"/"updated"`). Pick one convention + a namespaced vocabulary **before** wiring n8n.
- The schema already anticipates n8n (`admin_audit_events.actor_type` CHECK includes `'n8n'`) — but no code writes such rows.

**Recommended pre-n8n work (do now, independent of n8n):** standardize the event-insertion convention (actor_user_id + actor_name + namespaced event type) so the future webhook consumer has clean data.

---

## 8. Prioritized fix plan

### Phase F0 — Unbreak the DB (do first, ~0.5 day)
1. `npx supabase migration list --linked` → confirm what's applied.
2. `npx supabase db push` → apply `20260616` + both `20260628` migrations.
3. Apply D4 storage RLS policies (uncomment in `20260628_documents_upload.sql` or dashboard).
4. New migration for D7: `alter table payments add column payer_user_id uuid …; alter column id set default gen_random_uuid();` (or fix the route — see F2).
5. Smoke test: register a lawyer → `lawyer_profiles` row exists; client creates request → lawyer sees it in marketplace.

### Phase F1 — Fix the "mock modal" pattern (Priority 1, ~1.5 days)
Wire every create flow to a real backend call. Run `gitnexus_impact` before each symbol edit.
1. **L1** `AddCaseModal` → `createWorkflowRequest({type:"service", receiver:"lawyer", assignedTo: user.id})` + dispatch `nzamy-workflow-updated`.
2. **L9** `AddHearingModal` → `createWorkflowRequest` with date/time/type in `metadata`.
3. **L10** consultations booking confirm → `createWorkflowRequest({type:"consultation", …})`.
4. **L12** contracts `saveDraft`/`sendSign` → `createWorkflowRequest({type:"business_case", status:"draft"|"in_review"})`.
5. **L6** tasks add → new `POST /api/v1/lawyer/tasks` + call it.
6. **L14** Add Client → new `POST /api/v1/lawyer/clients` or gate behind real request.
7. **L16** finance invoice → new `POST /api/v1/lawyer/finance` (insert `payments`).
8. After each: reload (F5) → item reappears.

### Phase F2 — Fix the backend insert/query bugs (~1 day)
1. **B1** generate `id` in `POST /service-requests`.
2. **B2/D7** fix `payments` insert (real columns + policy) — pick column-add or route-fix.
3. **B3** fix `POST /consultations` field mapping.
4. **B4** fix `GET /referrals` columns.
5. **B5** fix `lawyer/finance` columns + scope to lawyer.
6. **B6** fix `lawyer/activity` `actor_id`.
7. **B7** fix client dashboard summary statuses.
8. **B12** add payment-gateway gate to v1 wrapper.

### Phase F3 — Fix the chat feature (C1+C2, ~0.5 day) ✅
1. `chatService.sendMessage` → POST `{ body: content, message_type, metadata }`.
2. Type + map `m.body` (not `m.content`) on GET + realtime; fix `ChatRoom.last_message`.
3. Surface send errors in the page (replace `.catch(console.error)`).

### Phase F4 — Fix the Kanban + status-mapping bugs (~0.5 day) ✅ (task persistence portion)
1. **L2** reconcile Kanban column keys with `statusForCol`.
2. **L3** `workflowToCase`: `completed→closed`, `cancelled→archived`.
3. **L4/L5/L7** tasks: map statuses to valid enum + call backend in `onDrop` + delete via status PATCH.
4. **L8** write `workflowToHearing` mapper.
5. **L15** fix `activeCount` statuses.

### Phase F5 — Fix My Group + mock-data display (~0.5 day)
1. **C4** add `joinGroup` service + endpoint matching `group_invitations`.
2. **C8** wire invite button + return `invite_code`.
3. **C9** join `profiles` in members route.
4. **C10/C11** clear wallet/referral mocks once API resolves.
5. **C5** remove localStorage fallback in supabase mode; surface errors.

### Phase F6 — Response-shape convention + error sweep (~1 day)
1. **RC-2/B9** standardize `{data}` envelope + unwrap in `apiGet`/`apiMutate`; map snake_case→camelCase in route responses.
2. **RC-4** finish the `.catch(()=>{})` sweep across both dashboards with a shared `<ErrorState/>`.
3. **L11** rewire case detail page to real `GET /api/v1/service-requests/{id}`. ✅
4. **C12** delete or fix the broken `casesService.createConsultation`.

### Phase F7 — n8n readiness prep (independent, ~0.5 day) ✅
1. Standardize event insertion: `actor_user_id` + `actor_name` + namespaced `event` type across v1 + `_supabase.ts`.
2. Decide + document the webhook payload schema (entity id, user id, role, event type, receiver, payment status).
3. Stub `/api/v1/n8n/trigger` that assembles + logs the payload (don't send anywhere yet) so the shape is fixed before n8n is built.

### Phase F8 — Verification ✅ (tsc + build green; `gitnexus_detect_changes` clean)
1. `npx tsc --noEmit` = 0 errors, `npx next build` = exit 0 after each phase.
2. `gitnexus_detect_changes()` before committing.
3. Manual E2E per the `library_testing_arabic.md` + `client_lawyer_testing_arabic (1).md` guides: every create → reload → reappears; every status change → reload → persists; messages send + render; documents upload + list.

---

## 9. Quick-reference: top 10 fixes by impact

1. **F0 — apply migrations** (unblocks D1/D2/D3/D5/D6; most "didn't appear" symptoms).
2. **L1 — wire AddCaseModal** (your reported bug).
3. **F3 — fix chat `content`/`body`** (entire messages feature broken).
4. **C3/D4 — apply storage RLS policies** (entire document upload broken).
5. **B1 — generate `id` in `POST /service-requests`** (every v1 insert 500s).
6. **L2+L3 — fix Kanban column/status mapping** (drag-drop doesn't persist correctly).
7. **L4 — fix task status enum** (every task action 500s).
8. **C4 — implement join-group** (currently creates wrong data).
9. **B4/B5/B6 — fix non-existent-column queries** (referrals/finance/activity broken).
10. **RC-2 — response-envelope convention** (unblocks correct read-back of created items).

---

## 10. Notes & caveats

- **Two parallel backend paths exist** and are inconsistent: the v1 wrapper (`/api/v1/service-requests`, RLS-bound) and the client-workflow path (`/api/client-workflow/requests` + `_supabase.ts`, service-role, bypasses RLS). The client flows use the latter (which mostly works); the lawyer flows use the former (which has B1/B2/B9). Consolidating to one path is a longer-term refactor — not required for the fixes above, but worth tracking.
- **Demo mode:** `NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND` defaults to `"demo"`. In demo mode many writes are local-only by design. Your `.env.local` is set to `supabase`, so the bugs above are live. Always confirm this flag when reproducing.
- All findings are read-only; no files were modified. Run `gitnexus_impact` before implementing any fix per `CLAUDE.md`.