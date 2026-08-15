# Session Log — Manual Fulfillment Order Pipeline

**Date:** 2026-08-15
**Branch:** `feat/manual-fulfillment-services` (38 commits ahead of `main`)
**Status:** ✅ **COMPLETE — deployable, pending a live round-trip test.** All tasks built and independently reviewed. Both migrations applied and verified on the live database by the owner. See §10 for why the live test is not optional.

---

## 1. What was asked

Finish four premium services — **الصائغ القانوني · محترف العقود · المحاكي الشامل · الرأي الفصل** — with the flow intact but **no AI**: the admin fulfils each order by hand from the admin panel, and n8n notifies the client on WhatsApp when the document is ready. Plus enable Google sign-in.

## 2. What investigation changed

### 2.1 There was no AI to remove

The repository contains **no LLM integration at all** — no `openai`, `anthropic`, or `@google/generative-ai` package, no key, no call site. All four services were front-end theater:

| Service | Route | How the "result" was produced |
|---|---|---|
| الصائغ القانوني | `/ai/draft` | `await new Promise(r => setTimeout(r, 2000))` |
| محترف العقود | `/ai/contracts` | same `setTimeout` pattern |
| المحاكي الشامل | `/ai/wargaming` | hardcoded `MOCK_MEMO_BASE` constant |
| الرأي الفصل | `/ai/legal-opinion` | `setTimeout`, then canned result |

They persisted **nothing** — no API call, no DB row, not even `localStorage`. A page refresh discarded everything the user typed.

### 2.2 The pipeline was already half-built

`service_requests` already carried `'ai_draft'` in its `type` CHECK and `'ai_workspace'` in `receiver`. Around it, already working: `recordEvent()` → `request_events`, `recordNotification()` → `notifications`, `documentService` → private `documents` bucket with 300s signed URLs, and `dispatchToN8n()` resolving `new-request` / `request-assigned` / `request-completed`. `.env.local` already held `N8N_WEBHOOK_BASE_URL` and the three `EVOLUTION_API_*` keys.

**Google sign-in was already coded** — `signInWithOAuth({provider:"google"})` in login and client registration, with `/auth/callback` present. It needs console configuration, not code.

## 3. Decisions taken (owner rulings)

| # | Decision |
|---|---|
| D1 | Reuse `service_requests`; no new table |
| D2 | Deliverable = uploaded file + optional notes |
| D3 | Middle wizard steps hidden from the client |
| D4 | Orders are free — no points deducted |
| D5 | Owner builds the n8n workflow; we build the webhook + contract |
| D6 | الصائغ القانوني first as the template |
| D7 | Google = enable end-user sign-in |
| D9 | WhatsApp carries `orderUrl`, never a download link |
| — | Attachments must actually work → Task 5b |
| — | Fix Arabic copy leaks immediately |
| — | Add subtypes so the four `?mode=` links work → Task 5c |
| — | Status gate scoped by `receiver`, not by role alone |

---

## 4. Work completed

| Task | Commits | Outcome |
|---|---|---|
| **T1** Migration — 4 order types | `9ca0207` | ✅ file written, **not applied to Supabase** |
| **T2** Intake types + validator | `90efbde`…`3af3f47` | ✅ 9 unit tests |
| **T3** n8n recipient fix | `435a98c`, `391039c` | ✅ 5 unit tests |
| **T2b** Repair 3 dead test files | `bc59a2a`, `9f9f83e` | ✅ suite green, output pristine |
| **T4** Hide mock steps + submit step | `85d557a`, `1825ceb` | ✅ |
| **T5** Wire real order submission | `f816f42`, `96d27d0` | ✅ |
| **T5b** Real attachment uploads | `c2d7111`, `eb2727f` | ✅ |
| **T5c** Fix 4 `?mode=` dead ends | `b1741e9` | ✅ |
| **T6** Deliverable download endpoint | `93548f7`…`f08adda` | ✅ |
| **T6b** PATCH column allowlist | `df0232b`, `1aee89b` | ✅ |
| **T6c** Upload ownership validation | `fb3473e` | ✅ |
| **T6d** Role-gated status transitions | `3cc645b`…`7c7d391` | ✅ |
| **T7** Client order tracking pages | `bb8e162`…`5d5ada2` | ✅ |
| **T7b** Marketplace RLS PII fix | `a617e92`, `8210d12` | ✅ **blocker closed** |
| **T8** Admin queue API | `70d3f68` | ✅ approved first pass |
| **T9** Admin queue UI | `89db01b`…`e238348` | ✅ |
| **T9b** Admin access to intake attachments | `cd68cfd`…`7218dc5` | ✅ |
| **T10** n8n delivery-status callback | `884a5af`, `78b1619` | ✅ |
| **T11** Owner-facing webhook contract | `a4a857f`…`78778e3` | ✅ `n8n/CONTRACT-service-orders.md` |
| **T12** Smoke routes + QA checklist | `b2f3a5e` | ✅ |

**Controller-verified at HEAD `b2f3a5e`** (run directly, not taken from agent reports):
`npm run test:unit` → **20 pass / 0 fail**; `npx tsc --noEmit` → **exit 0, zero errors**;
`npm run build` → **exit 0**, all seven new routes present in the route table.

> An initial `tsc` run reported 63 errors, every one of them inside
> `.next/dev/types/routes.d.ts` — a Next.js dev-server artifact left **truncated mid-string**
> (line 240 cut at 1328 chars) when the process was killed during a network disconnection.
> `.next/` is gitignored build output; clearing it resolved all 63. **Zero errors were ever in
> `src/`.**

Test suite: **17 pass / 0 fail, pristine output** (`npm run test:unit`).

## 4b. The bug no static check could catch

`attachments.id` is Postgres **bigserial**. PostgREST serialises it as a JSON **number** — but
`documentId` is typed `string` throughout the TypeScript. A `typeof v === 'string'` guard (the
first draft of T9b) would have made the entire attachment feature a **silent no-op**: empty
binding, zero download buttons, admin still unable to read case files — while `tsc`, the test
suite, and `npm run build` all stayed green.

It was caught by an advisor review, not by tooling, and fixed by coercing with `String()` in the
bind logic, the admin render filter, and `validateDraftIntake`.

This is the concrete reason a live round-trip test is required before the feature is used with
real clients. No verification available in this environment — no browser, no live Supabase —
could have surfaced it.

T9b also added a `.is('request_id', null)` guard beyond its brief: without it, resubmitting a
`documentId` already bound to a prior order would silently steal it and permanently 404 that
order's download.

## 5. Work NOT done

| Task | What it is | Why it matters |
|---|---|---|
| **T8** 🔴 | Admin queue API | Without it **no one can fulfil an order** |
| **T9** | Admin queue UI | Same |
| **T10** | `POST /api/v1/n8n/callback` | WhatsApp delivery status invisible |
| **T11** | Owner-facing webhook contract doc | **This is what the owner is waiting for** |
| **T12** | Smoke routes + QA checklist | |
| **T6e** | Self-completion on non-`ai_workspace` receivers | Filed, not fixed |
| Google | Console config + phone capture + role fix | Separate plan, untouched |

**Consequence:** a client can submit an order and watch its status, but **nothing can move it forward**. Orders would accumulate in `pending_assignment` with no interface to work them.

---

## 6. Security findings

Five distinct issues surfaced. **Four were already live in production.** One is caused by this feature.

### 6.1 Any client could write any column on their own order — *pre-existing* ✅ fixed T6b

`PATCH /api/v1/service-requests/[id]` forwarded the request body straight to `.update()` with no allowlist, and RLS permits `requester_user_id = auth.uid()` to update. So any authenticated client could set `metadata`, `status`, `assigned_to`, `payment`, `type`, `receiver` on their own order.

### 6.2 Unvalidated `storage_path` on document upload — *pre-existing* ✅ fixed T6c

`POST /api/v1/documents` inserted a client-supplied `storage_path`; the only insert policy checked `owner_user_id`. A caller could register an attachment row pointing at another tenant's object.

### 6.3 Cross-tenant document leak — *pre-existing chain, newly weaponisable* ✅ fixed T6

`attachments.id` is `bigserial` — sequential, enumerable. Combined with 6.1, a client could PATCH `metadata.deliverable.documentId` to any integer and pull a signed URL for **any file on the platform** via the new download endpoint. Closed by binding the attachment to its own order, with all refusal branches returning an identical 404 so nothing can be enumerated.

### 6.4 Self-assign → self-complete → false WhatsApp — *pre-existing* ✅ fixed for AI orders (T6d)

`assigned_to` is client-controlled at creation and the INSERT policy never constrained it. A client could self-assign, then mark their own order `completed` — firing `dispatchToN8n` to `/request-completed` and the "تم إكمال طلبك" notification to themselves.

Fixed by scoping the gate on `receiver`: `ai_workspace` orders permit only requester-cancel through the RLS-scoped handler. Lying about `receiver` to dodge the gate also removes the order from the admin queue, which filters on the same field.

**Residual (T6e, filed):** the same attack still works for other receivers, and `receiver='lawyer'` is reachable by ordinary clients through the legitimate wizard.

### 6.5 🔴 Every verified lawyer can read every client's case file — **caused by this feature**

`service_requests_select_policy` (`20260616_production_readiness_fixes.sql:58-75`) grants verified lawyers read access to any row where `assigned_to IS NULL AND status IN ('pending','pending_assignment')` — with **no `receiver` filter**, because it predates `ai_workspace`.

AI orders are created with exactly that shape. So every verified lawyer could read every client's drafting order including `metadata.intake`: case narrative, party names, national ID numbers, commercial registration numbers, judgment text, and private notes to the fulfillment team.

**✅ Fixed — T7b, `a617e92`.** `supabase/migrations/20260815_marketplace_excludes_ai_workspace.sql` adds `AND receiver <> 'ai_workspace'` to the marketplace clause only. Review verified clause-by-clause equivalence against the live baseline file (not the brief's quote), confirmed `receiver` is `text not null` throughout the migration history so the comparison cannot silently drop rows via NULL semantics, and confirmed marketplace browse still works for all six other receiver values.

**Narrowing discovered during review — the uploaded files were never exposed.** `supabase/storage_policies_documents.sql:30-35` restricts bucket SELECT to `auth.uid()::text = (storage.foldername(name))[1]` — owner-only, narrower even than `attachments_select_policy` (`20260616:88-103`), which itself has no marketplace branch. Only the order's text metadata was readable, never the client's documents.

---

## 7. Plan defects found during execution

Errors in the plan and spec I authored, caught by review:

1. **Validator never checked its own discriminant** — a contracts payload would validate and be silently relabelled `draft`.
2. **"No unit tests" was false** — three existed from `07b27ae`, written for `npx tsx`, that nothing ran. The new `test:unit` glob swept them in and turned the command red.
3. **Orphaned File Structure entry** — the plan said to wire `requesterProfile` into `service-requests/[id]/route.ts`; no task did it. That route can complete an order too, so the T3 fix would have been bypassed on one of two paths.
4. **State machine split across two tasks** — T4 hid the steps but left navigation walking the old 8-item array: blank screens, a submit step reachable only by accident, and a dead السابق button.
5. **A false premise in a brief** — I wrote that `assigned_to` is null for AI orders. That described current data, not an enforced invariant, and the implementer built a correct gate on it that was bypassable by self-assignment.
6. **`casesService.ts` was not a caller** of the route I claimed — it targets `/api/v1/consultations/[id]`, which already had its own allowlist.

---

## 8. Deployment prerequisites

Two migrations, in this order:

1. `supabase/migrations/20260814_service_orders_types.sql` — widens a CHECK constraint. Safe any time; inert until the app deploys.
2. `supabase/migrations/20260815_marketplace_excludes_ai_workspace.sql` — closes §6.5. **Must be applied before the app code ships.**

Both are safe to run now. Verify:

```sql
-- expect: contains ai_legal_opinion
select pg_get_constraintdef(oid) from pg_constraint
where conname = 'service_requests_type_check';

-- expect: contains receiver <> 'ai_workspace'
-- AND still contains requester_user_id = auth.uid() and assigned_to = auth.uid()
select pg_get_expr(polqual, polrelid) from pg_policy
where polname = 'service_requests_select_policy';
```

**Do not deploy the application code** until T8/T9 provide a fulfillment interface — otherwise orders accumulate in `pending_assignment` with no way to work them. Deployment is now blocked on missing functionality, not on security.

---

## 9. Method note

Every task ran: fresh implementer → independent reviewer → fix loop → scoped re-review. Each of the five security findings, and every one of the six plan defects, was found by a reviewer reading the diff against the schema — not by the implementer, and not by me re-reading my own plan.
