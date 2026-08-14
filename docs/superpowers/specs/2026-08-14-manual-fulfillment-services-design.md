# Manual Fulfillment for the Four Premium Services — Design

**Date:** 2026-08-14
**Status:** Approved (owner), ready for implementation planning
**Scope:** الصائغ القانوني · محترف العقود · المحاكي الشامل · الرأي الفصل — plus Google sign-in and the n8n/WhatsApp notification contract.

---

## 1. Why this exists

The owner asked to "finish" four services, with the flow kept as-is but **no AI involved**: the admin fulfils each order by hand from the admin panel, and n8n notifies the user on WhatsApp when the deliverable is ready.

Investigation changed the shape of the work in two ways.

### 1.1 There is no AI to remove

The repository contains **no LLM integration at all** — no `openai`, `anthropic`, or `@google/generative-ai` package, no provider key, no call site. All four services are front-end theater:

| Service | Route | How the "result" is produced |
|---|---|---|
| الصائغ القانوني | `/ai/draft` | `await new Promise(r => setTimeout(r, 2000))` — `src/hooks/useDraftState.ts:113` |
| محترف العقود | `/ai/contracts` | same `setTimeout` pattern |
| المحاكي الشامل | `/ai/wargaming` | hardcoded `MOCK_MEMO_BASE` — `src/app/ai/wargaming/page.tsx:73` |
| الرأي الفصل | `/ai/legal-opinion` | `setTimeout` then canned result — `src/app/ai/legal-opinion/page.tsx:94` |

They also **persist nothing** — no API call, no database row, not even `localStorage`. A page refresh mid-wizard discards everything the user typed.

So this is not "swap AI for a human". The backend for these four services does not exist and must be built.

### 1.2 The pipeline is already half-built

`service_requests` was designed for exactly this and never connected:

```sql
type     text check (type in ('service','consultation','business_case','ngo_volunteer','ai_draft'))
receiver text check (receiver in (...,'ai_workspace'))
status   text check (status in ('draft','pending_payment','pending_assignment',
                                'assigned','in_review','completed','cancelled'))
requester_user_id uuid, assigned_to uuid, requester jsonb, payment jsonb,
metadata jsonb, source_path text, created_at, updated_at
```

`'ai_draft'` and `'ai_workspace'` are already in the CHECK constraints. Around that table, already working:

| Capability | Location |
|---|---|
| Generic create (accepts `type`/`receiver`/`metadata`/`status`) | `POST /api/v1/service-requests` |
| Status update + audit event + notify + n8n dispatch | `PATCH /api/v1/service-requests/[id]` |
| Audit trail | `src/lib/events.ts` → `request_events` |
| In-app notifications | `src/lib/notify.ts` → `notifications` |
| Private file storage + 5-min signed URLs | `src/lib/services/documentService.ts` → `documents` bucket |
| n8n outbound dispatch | `src/lib/n8n/dispatch.ts` (`new-request` / `request-assigned` / `request-completed`) |
| Admin "review and decide" pattern to copy | `src/app/api/v1/admin/entitlements/requests/[id]/route.ts` |
| Google OAuth sign-in | `src/app/login/page.tsx:220`, `src/app/register/client/page.tsx:340`, `/auth/callback` |

`.env.local` already carries `N8N_WEBHOOK_BASE_URL` and `EVOLUTION_API_URL` / `EVOLUTION_API_KEY` / `EVOLUTION_INSTANCE_NAME`.

---

## 2. Decisions taken

| # | Decision | Rationale |
|---|---|---|
| D1 | Reuse `service_requests`; do not create a new table | Create/update/audit/notify/dispatch already work on it, and `ai_draft` + `ai_workspace` were put in the CHECK constraints for this |
| D2 | Deliverable = **uploaded file + optional notes** | Owner's choice; admin works in Word offline |
| D3 | Middle wizard steps are **hidden from the client** | Owner: "مش هتظهر حاليا للعميل" — they display mock AI output that will not exist |
| D4 | Orders are **free** — no points deducted | Owner's choice; `payment.status='not_required'`, status goes straight to `pending_assignment` |
| D5 | Owner builds the n8n workflow; we build the webhook + contract | Owner: "خليك بس مجهز الويب هوك و ايه اللي المفروض يرجعلو و انا هعملو" |
| D6 | **الصائغ القانوني first** as the template, then replicate ×3 | Owner's choice; lower risk, one live test before repeating |
| D7 | Google = enable end-user sign-in | Owner's choice; code exists, console configuration does not |
| D8 | Hide steps behind a flag, do not delete them | They return when AI arrives or when two-phase curation is built |
| D9 | WhatsApp carries `orderUrl`, never a download link | A signed URL dies in 5 minutes; a permanent one leaks a private legal document |
| D10 | Google sign-in restricted to clients initially | Google never supplies `user_type`; a lawyer silently landing in the client dashboard is worse than no button |
| D11 | Hand-rolled intake validator, no new dependency | Project has 13 dependencies and no validation library; a plain TS validator is proportionate |

---

## 3. Architecture

```
العميل                            الأدمن                          n8n (المالك)
──────                            ──────                          ────────────
/ai/draft  (٣ خطوات)
  └─ POST /api/v1/service-requests        ← موجود، عام
       type=ai_draft · receiver=ai_workspace
       status=pending_assignment
              │
              ├────────────────►  /dashboard/admin/service-orders
              │                      استلام  → in_review
              │                      رفع الملف + ملاحظات
              │                      تسليم   → completed
              │                            │
              │                            ├─► recordNotification()   (جرس الموقع)
              │                            └─► POST {BASE}/request-completed ──► واتساب
/ai/orders  ◄───────────────────────────────┘                                    │
  تحميل الملف عبر رابط موقّع                                                       │
              ◄──── POST /api/v1/n8n/callback ◄──────────────────────────────────┘
                    (حالة الإرسال: sent / failed / read)
```

### 3.1 Migration

```sql
-- supabase/migrations/20260814_service_orders_types.sql
alter table public.service_requests drop constraint service_requests_type_check;
alter table public.service_requests add constraint service_requests_type_check
  check (type in ('service','consultation','business_case','ngo_volunteer',
                  'ai_draft','ai_contracts','ai_wargaming','ai_legal_opinion'));
```

Idempotent and reversible. No data migration — no rows use the new values yet.

---

## 4. Component: client intake

### 4.1 Step visibility

`src/components/draft/draftConstants.ts` gains `CLIENT_VISIBLE_STEPS`. `src/app/ai/draft/page.tsx` renders from that list instead of `STEPS`.

| Step | Today | After |
|---|---|---|
| `identify` — التعريف | shown | **shown** |
| `case` — الوقائع + المرفقات | shown | **shown** |
| `analysis`, `defenses`, `laws`, `drafting` | mock AI output | **hidden** |
| `review`, `approval` | mock | **hidden** |
| `submit` — مراجعة وإرسال | — | **new** |

Step components stay on disk untouched (D8).

### 4.2 New `StepSubmit`

Read-only summary of what the user entered, attachment list, an optional "ملاحظات للفريق" free-text field, and a submit button. On success it routes to `/ai/orders/<id>`.

### 4.3 Intake contract

New module `src/lib/services/orderIntake.ts`:

```ts
export interface DraftIntakeV1 {
  schemaVersion: 1;
  service: "draft";
  clientRole: "plaintiff" | "defendant";
  memoType: string;
  memoSubType?: string;
  legalBranch: string;
  caseText: string;
  parties: { one: PartyData; two: PartyData };   // PartyData from src/components/draft/draftConstants.ts
  judgment?: { number; court; date; text; reasons };
  lawyerNotes?: string;
  attachments: { documentId: string; name: string; size: number }[];
}

export function validateDraftIntake(input: unknown):
  | { ok: true; value: DraftIntakeV1 }
  | { ok: false; errors: string[] };
```

Called inside the API route before insert. `schemaVersion` lets later shapes coexist in the same `jsonb` column.

### 4.4 Submit payload

```jsonc
POST /api/v1/service-requests
{
  "title": "صياغة مذكرة — دعوى عمالية",
  "description": "<أول ٢٠٠ حرف من الوقائع>",
  "type": "ai_draft",
  "receiver": "ai_workspace",
  "status": "pending_assignment",
  "sourcePath": "/ai/draft",
  "payment": { "amount": 0, "status": "not_required" },
  "requester": { "name": "...", "phone": "...", "email": "..." },
  "metadata": { "service": "draft", "serviceTitleAr": "الصائغ القانوني",
                "schemaVersion": 1, "intake": { /* DraftIntakeV1 */ },
                "attachments": [ /* ... */ ] }
}
```

`payment` is shaped for D4 today; switching points on later means setting `amount` and moving status to `pending_payment` — no schema change.

### 4.5 Attachments

Uploaded via the existing `uploadDocumentFile()` (`documents` bucket, `<user_id>/<timestamp>-<name>`). Only IDs enter `metadata`.

---

## 5. Component: client tracking

New route `/ai/orders` (list) and `/ai/orders/[id]` (detail). Reads the caller's own rows where `receiver='ai_workspace'` — existing RLS (`requester_user_id = auth.uid()`) already permits this, so no policy change.

| DB status | Shown to client |
|---|---|
| `pending_assignment` | بانتظار الاستلام |
| `assigned` / `in_review` | قيد التنفيذ |
| `completed` | جاهز — تحميل |
| `cancelled` | ملغى |

---

## 6. Component: admin queue

New UI `/dashboard/admin/service-orders`; new API `GET /api/v1/admin/service-orders` and `PATCH /api/v1/admin/service-orders/[id]`.

Both cloned from `src/app/api/v1/admin/entitlements/requests/[id]/route.ts`: `requireAdmin()` → `createServiceClient()` → `409` when the transition was already applied → `recordEvent()` + `recordNotification()`.

**RLS note.** `service_requests` has no admin policy — its policies are only `requester_user_id = auth.uid() or assigned_to = auth.uid()`. Admin routes therefore *must* use the service-role client, with `requireAdmin()` as the sole gate. This is the same pattern the existing admin routes use.

| Action | Effect |
|---|---|
| استلام | `status='in_review'`, `assigned_to=<admin>` |
| رفع التسليم | upload file → `metadata.deliverable = { documentId, fileName, notes, deliveredBy, deliveredAt }` |
| تسليم | `status='completed'` → notification + n8n dispatch |
| إلغاء | `status='cancelled'`, reason in `metadata.cancelReason` |

The detail view renders `metadata.intake` as a readable Arabic brief and lists attachments with signed download links.

### 6.1 Deliverable storage

Stored at `orders/<order_id>/<filename>` in the `documents` bucket and served by a new `GET /api/v1/service-requests/[id]/deliverable`, which verifies the caller owns the order (or is admin), then mints a 5-minute signed URL via `getDocumentFileUrl()`.

Ownership is checked in one auditable place rather than being implied by a storage path convention.

---

## 7. Component: n8n contract

### 7.1 Bug that must be fixed first

`deriveRecipient()` in `src/lib/n8n/payload.ts` returns the **assignee** whenever `assigned_to` is set:

```ts
if (assignedTo) return { id: assignedTo, role: receiver };
```

In this flow the assignee is the admin who did the work. Left as-is, the completion webhook would name the **admin** as recipient and WhatsApp the wrong person. `recipient` must resolve to the requester for `service_request.completed`.

### 7.2 Outbound

`POST {N8N_WEBHOOK_BASE_URL}/request-completed`, header `X-Webhook-Secret`, 5s timeout, best-effort (never breaks the admin action).

`WebhookPayload.recipient` is extended with `name`, `phone`, `email`:

```jsonc
{
  "event": "service_request.completed",
  "entity": { "id": "uuid", "type": "ai_draft", "status": "completed" },
  "actor":  { "id": "uuid", "name": "الإدارة", "role": "admin" },
  "recipient": { "id": "uuid", "role": "individual",
                 "name": "محمد العتيبي",
                 "phone": "+9665XXXXXXXX",
                 "email": "m@example.com" },
  "payment": { "amount": 0, "status": "not_required" },
  "timestamp": "2026-08-14T09:12:00.000Z",
  "data": {
    "service": "draft",
    "serviceTitleAr": "الصائغ القانوني",
    "title": "صياغة مذكرة — دعوى عمالية",
    "orderUrl": "https://nezamy.sa/ai/orders/<id>",
    "deliverable": { "fileName": "مذكرة.docx", "notes": "..." }
  }
}
```

**No download link is sent (D9).** A signed URL expires in 5 minutes; a permanent one would expose a private legal document without authentication. The message carries `orderUrl`; the user signs in and downloads.

If `recipient.phone` is null the payload is still sent — n8n decides whether to skip the WhatsApp branch. The app does not silently drop the event.

### 7.3 Inbound — what n8n returns

**Synchronous:** return `200` with `{"ok": true}`. The app reads only `res.ok`.

**Delivery status (new endpoint):**

```
POST /api/v1/n8n/callback
Header: X-Webhook-Secret: <same secret>
Body:   { "orderId": "uuid",
          "channel": "whatsapp",
          "status": "sent" | "failed" | "read",
          "messageId": "string",
          "error": "string (optional)" }
→ 200 { "ok": true }   401 bad secret   404 unknown order   400 bad body
```

Writes a `request_events` row (`notification.whatsapp_sent` / `.failed` / `.read`) so the admin can see **"تم إرسال الواتساب ✓"** or **"فشل الإرسال"** on the order. Without it, a failed message is invisible.

---

## 8. Component: Google sign-in

### 8.1 Console configuration (owner)

1. Google Cloud Console → OAuth consent screen (External; app name, logo, support email; scopes `email`, `profile`, `openid`; authorized domain).
2. Credentials → OAuth Client ID (Web) → authorized redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`.
3. Supabase → Authentication → Providers → Google → paste Client ID + Secret.
4. Supabase → Authentication → URL Configuration → Site URL, and add `https://nezamy.sa/auth/callback` to Redirect URLs.

### 8.2 Code changes (two real defects)

**Phone is null for every Google user.** `handle_new_user()` reads `raw_user_meta_data->>'phone'` / `new.phone`; Google supplies neither, and `/onboarding` does not ask for a phone (verified — zero matches). Every Google signup is therefore unreachable on WhatsApp.

> Fix: `/onboarding` gains a required phone field for any profile with `phone IS NULL`, and order submission is blocked with a clear prompt until it is filled.

**Role is always `individual`.** `v_user_type := COALESCE(raw_user_meta_data->>'user_type','individual')`, and `/auth/callback` routes on `user_metadata.user_type`, which Google never sets. A lawyer signing up with Google gets the client dashboard and no `lawyer_profiles` row.

> Fix: restrict Google sign-in to the client registration surface for now (D10); `/auth/callback` reads `user_type` from `profiles` rather than `user_metadata`, and redirects to `/onboarding` when the phone is missing.

---

## 9. Error handling

| Failure | Behaviour |
|---|---|
| n8n unreachable / slow | `dispatchToN8n` is best-effort with a 5s `AbortSignal.timeout`; returns `{delivered:false}`, never throws. The order still completes. |
| n8n webhook base URL unset | Dispatch is inert by design — no network call, no error. |
| Attachment upload fails | `uploadDocumentFile()` already removes the orphaned object and surfaces the error; submission is blocked, wizard state is retained. |
| Double delivery (two admins) | `PATCH` returns `409` when the order is already `completed`. |
| Notification insert fails | `recordNotification` logs and swallows — never breaks the admin action. |
| Invalid intake | Validator rejects at the API boundary with field-level Arabic errors; nothing is written. |
| Google user with no phone | Order submission blocked with a prompt to complete onboarding; webhook still fires with `phone: null`. |

Principle, consistent with the existing codebase: **side-channels (n8n, notifications, audit) never break the primary write.**

---

## 10. Testing

The project has no unit-test framework — `npm test` runs `node scripts/smoke-routes.mjs`. Proposal proportionate to that:

1. **Unit tests via `node --test`** (built into Node, zero dependencies) for the two pure modules: `validateDraftIntake()` and `buildWebhookPayload()` — including a regression test that `service_request.completed` resolves `recipient` to the **requester**, not the assignee (§7.1).
2. **Extend `scripts/smoke-routes.mjs`** with the new routes: `/ai/orders`, `/dashboard/admin/service-orders`, `POST /api/v1/n8n/callback`.
3. **Manual QA checklist** appended to `DEPLOY_AND_SMOKETEST_RUNBOOK.md`: submit an order → appears in admin queue → claim → upload → deliver → client sees جاهز and downloads → `request_events` shows the full chain → webhook payload logged with correct recipient.

---

## 11. Build order

| # | Work | Depends on |
|---|---|---|
| 1 | Migration + intake validator + draft wizard submits a real order | — |
| 2 | `/ai/orders` list + detail | 1 |
| 3 | Admin queue, deliverable upload, download endpoint | 1 |
| 4 | Fix `deriveRecipient`; extend payload; add `/api/v1/n8n/callback`; write owner-facing webhook doc | 3 |
| 5 | Google console config + phone capture + role restriction | — (parallel) |
| 6 | Replicate the pattern to العقود · المحاكي · الرأي الفصل | 1–4 proven live |

Step 4 is the owner's dependency — it unblocks building the n8n workflow.

---

## 12. Out of scope

- Real AI generation (no provider, no key, deliberately deferred).
- Points/payment deduction (D4) — the payload is shaped for it, the logic is not built.
- Two-phase curation, where the client confirms admin-written defenses (D3 defers this).
- Reinstating hidden steps 3–8.
- Hosting n8n and building the workflows (owner owns this, D5).
- The other services in `src/app/ai/*` beyond the four named.
