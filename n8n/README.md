# n8n Integration — NZAMY (منصة نظامي القانونية)

> Saudi legal platform automation layer. This directory contains the **importable n8n workflow templates** (Phase 1 / Section A) plus the integration contract that binds them to the Next.js app.
>
> **Last Updated: 2026-06-29**
> **Status:** Trigger layer is built on the Next.js side. The 7 workflows below are **importable n8n template files only — 0 are built/imported into any n8n instance yet, and no n8n instance is hosted.** The generic trigger endpoint sends no outbound HTTP today. **Exception:** `/api/ai/library-chat` and `/api/ai/explain-article` DO `fetch()` their n8n webhooks when `N8N_LIBRARY_CHAT_WEBHOOK_URL` / `N8N_EXPLAIN_WEBHOOK_URL` are set (today they're unset → 503 "قريباً"). Building/hosting n8n + importing these templates is the next step.

---

## 1. Overview — نظرة عامة

The automation layer is split across two surfaces:

| Surface | What lives there | Status |
|---|---|---|
| **Next.js app** (this repo) | Trigger endpoint, payload assembler, event recorder | Built, logs only — does NOT send to n8n yet |
| **n8n** (this directory) | Workflow templates that consume the payload and act (email, WhatsApp, DB writes) | Importable templates — n8n instance not yet hosted |

### What's built on the Next.js side

- **`src/lib/events.ts`** — server helper `recordEvent({ supabase, requestId, event, actorUserId, actorName?, metadata? })`. Inserts a row into `request_events`. Exports the `RequestEvent` namespace map + `RequestEventName` type. **Failures are logged and swallowed** — event recording never breaks the parent write.
- **`src/lib/n8n/payload.ts`** — pure assembler `buildWebhookPayload({ event, timestamp, request, actor? })` → stable `{ event, entity, actor, recipient, payment, timestamp, data }` envelope. No I/O, no clock — the caller passes the ISO timestamp.
- **`POST /api/v1/n8n/trigger`** — auth-required endpoint. Body `{ requestId, event? }`. Fetches the `service_requests` row + actor `profiles` row, builds the payload via `buildWebhookPayload`, `console.log`s it, and returns `{ data: payload, delivered: false, note: "n8n not yet wired — payload assembled only" }`. **Makes NO outbound HTTP call today.** When n8n is wired, this endpoint (or each write route directly) will POST that payload to the matching n8n webhook URL.

### What lives in n8n

The 7 workflow JSON files in `n8n/workflows/`. Each is a single workflow object importable via **n8n → Import from File**.

---

## 2. Payload Contract — عقد الحمولة

Every event-driven n8n webhook in this directory expects this exact body shape (produced by `buildWebhookPayload`):

```json
{
  "event": "service_request.status_changed",
  "entity": {
    "id": "1093",
    "type": "legal",
    "status": "assigned"
  },
  "actor": {
    "id": "uuid-of-acting-user",
    "name": "عبد الله الرميح",
    "role": "lawyer"
  },
  "recipient": {
    "id": "uuid-of-assignee-or-requester",
    "role": "lawyer"
  },
  "payment": {
    "amount": 0,
    "status": "not_required"
  },
  "timestamp": "2026-06-28T12:34:56.000Z",
  "data": {
    "title": "استشارة عقارية",
    "description": "...",
    "sourcePath": "/requests/1093",
    "metadata": {},
    "receiver": "lawyer",
    "assignedTo": "uuid",
    "requester": "client",
    "createdAt": "2026-06-28T10:00:00.000Z"
  }
}
```

The webhook body is a **slim envelope** — the first node after each Webhook is a Postgres "Fetch full record" node that uses `{{$json.body.entity.id}}` to load the full row from Supabase. Do not rely on `data.*` for everything; re-fetch what you need.

---

## 3. Event Vocabulary — جدول الأحداث

The namespaced event vocabulary exported from `src/lib/events.ts`. n8n routes on the `event` field (and/or `entity.status`).

| Event | Meaning | Workflow that handles it |
|---|---|---|
| `service_request.created` | A new service request was inserted (status `pending_assignment`) | **WF 2.1** (`/new-request`) |
| `service_request.status_changed` | Request status changed (assigned, completed, cancelled, etc.) | **WF 2.2** (`/request-status`, filters `status=assigned`) + **WF 2.3** (`/request-status`, filters `status=completed`) |
| `service_request.updated` | Generic update | (future) |
| `service_request.cancelled` | Request cancelled | (future) |
| `service_request.completed` | Request marked completed | **WF 2.3** (`/request-status`) |
| `consultation.created` | New consultation scheduled | (future — WF 4.2 polls instead) |
| `consultation.status_changed` | Consultation status changed | (future) |
| `task.created` | Task created | (future) |
| `task.status_changed` | Task status changed | (future) |
| `task.deleted` | Task deleted | (future) |
| `contract.created` | Contract created | (future) |
| `contract.status_changed` | Contract status changed | (future) |
| `hearing.created` | Hearing created | (future — WF 4.3 in Phase 2) |
| `payment.created` | Payment row inserted | (Phase 3 — blocked on payment gateway) |

> **WF 1.1** and **WF 1.2** are triggered by `INSERT` on `profiles` / `lawyer_profiles` respectively, not by a `service_request.*` event — see the Supabase DB webhooks table below.

---

## 4. How to Import — طريقة الاستيراد

1. Start your n8n instance (self-hosted VPS or cloud).
2. In n8n, open **Workflows → Import from File**.
3. Pick any JSON file from `n8n/workflows/`.
4. Repeat for each workflow you want.
5. **Set credentials** (see §8) on each node that needs them:
   - Postgres nodes → **Supabase Postgres** credential (host, db, user, password, port `5432`, ssl `disable` or as your Supabase pooler requires).
   - HTTP Request nodes hitting `api.resend.com` → **Resend API key** (header `Authorization: Bearer ...`).
   - HTTP Request nodes hitting `EVOLUTION_API_URL` → **Evolution API key** (header `apikey: ...`).
   - HTTP Request nodes hitting the LLM endpoint → **LLM API key**.
6. Activate the workflow (top-right toggle). The webhook URL becomes `{N8N_WEBHOOK_BASE_URL}/{path}`.

---

## 5. Trigger Options — خياران للتشغيل

There are two ways to get events into n8n. **Today (2026-06-28) neither sends yet** — the trigger endpoint assembles + logs only.

### Option A — Next.js push (recommended starting point)

The Next.js app calls the n8n webhook URL directly. Two flavors:

- **Centralized:** `POST /api/v1/n8n/trigger` receives `{ requestId, event? }`, builds the payload, and (once wired) POSTs it to `{N8N_WEBHOOK_BASE_URL}/{path}`. Today this endpoint returns `delivered: false` and logs the payload.
- **Distributed:** each write route (e.g. the route that flips `service_requests.status` to `assigned`) POSTs the payload to the matching n8n webhook inline, right after `recordEvent(...)`.

To enable Option A:
1. Set `N8N_WEBHOOK_BASE_URL` in `.env.local`.
2. Flip the trigger endpoint (or add a small `dispatchToN8n(event, payload)` helper in `src/lib/n8n/`) to actually `fetch()` the webhook URL.
3. Add the per-event path mapping (event → `{N8N_WEBHOOK_BASE_URL}/{path}`).

### Option B — Supabase DB webhooks (push directly from Postgres)

Supabase Dashboard → Database → Webhooks. Create webhooks that fire the n8n URL on INSERT/UPDATE. This bypasses Next.js entirely and is lower-latency, but requires the Supabase webhook feature to be enabled and the n8n URL to be publicly reachable.

> **Note:** Option A and Option B both produce the **same payload shape** (§2) if you route A through `buildWebhookPayload`. Supabase DB webhooks (Option B) emit a different raw shape (`{ type, table, record, old_record }`) — if you use Option B, either add a transform node at the top of the workflow or adapt the first Postgres fetch to read from `{{$json.record.id}}` instead of `{{$json.body.entity.id}}`. The templates in this directory are written for **Option A's** `buildWebhookPayload` shape.

---

## 6. Environment Variables — متغيرات البيئة

Set in n8n credentials/environment, and (for Option A) in the Next.js `.env.local`:

| Variable | Where | Purpose |
|---|---|---|
| `N8N_WEBHOOK_BASE_URL` | Next.js `.env.local` | Base URL of the n8n webhook receiver, e.g. `http://your-n8n:5678/webhook` |
| `N8N_API_KEY` | Next.js `.env.local` | Optional auth header for n8n webhook (if n8n webhook requires it) |
| `SUPABASE_URL` | n8n env | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | n8n env | Supabase service_role key (used by Postgres node or HTTP) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | n8n env | SMTP (Resend: `smtp.resend.com` / `587` / `apikey` / `re_xxx`) |
| `EMAIL_FROM` | n8n env | Sender address, e.g. `noreply@nezamy.sa` |
| `EMAIL_FROM_NAME` | n8n env | Sender display name, e.g. `نظامي` |
| `RESEND_API_KEY` | n8n env | Resend API key (used by HTTP Request nodes hitting `api.resend.com`) |
| `EVOLUTION_API_URL` | n8n env | Evolution API base URL, e.g. `https://evo.nezamy.sa` |
| `EVOLUTION_API_KEY` | n8n env | Evolution API key (sent as `apikey` header) |
| `EVOLUTION_INSTANCE_NAME` | n8n env | Evolution instance name, e.g. `nzamy_main` |
| `LLM_API_KEY` | n8n env | LLM provider key (OpenAI / Gemini / Claude) — used by WF 4.1 |
| `LLM_CLASSIFY_ENDPOINT` | n8n env | LLM chat-completions endpoint for intent classification (WF 4.1) |
| `LLM_FAQ_ENDPOINT` | n8n env | LLM chat-completions endpoint for FAQ replies (WF 4.1) |

---

## 7. Supabase DB Webhooks Table — webhooks لواجه Supabase

From the master guide. For Option B, create these in Supabase Dashboard:

| Webhook Name | Table | Event | Target URL (n8n path) |
|---|---|---|---|
| `wh_new_profile` | `profiles` | INSERT | `/new-user` (WF 1.1) |
| `wh_new_request` | `service_requests` | INSERT | `/new-request` (WF 2.1) |
| `wh_request_update` | `service_requests` | UPDATE | `/request-status` (WF 2.2 / WF 2.3) |
| `wh_new_lawyer` | `lawyer_profiles` | INSERT | `/verification` (WF 1.2) |
| `wh_new_consultation` | `consultations` | INSERT | `/new-consultation` (future) |
| `wh_consultation_update` | `consultations` | UPDATE | `/consultation-status` (future) |
| `wh_new_payment` | `payments` | INSERT/UPDATE | `/payment` (Phase 3) |
| `wh_new_firm` | `firm_profiles` | INSERT | `/new-firm` (Phase 2) |
| `wh_new_provider` | `provider_profiles` | INSERT | `/new-provider` (Phase 2) |
| `wh_new_post` | `community_posts` | INSERT | `/new-post` (Phase 2) |
| `wh_wallet_tx` | `wallet_transactions` | INSERT | `/wallet-tx` (Phase 3) |
| `wh_referral_complete` | `referrals` | UPDATE | `/referral-complete` (Phase 3) |

The Evolution API (WhatsApp) sends incoming messages directly to `/whatsapp-incoming` (WF 4.1) — that is not a Supabase webhook.

---

## 8. Credentials Needed — بيانات الاعتماد

| Credential | Type | Used By |
|---|---|---|
| **Supabase (Postgres)** | Postgres connection (host/db/user/pass) | All workflows — every "Fetch …" / Query / Insert / Update node |
| **Resend (SMTP / API)** | API Key | Email notifications — WF 1.1, 2.1, 2.2, 2.3, 1.2, 4.2 |
| **Evolution API** | API Key (header `apikey`) | WhatsApp — WF 1.1, 2.1, 2.2, 4.1, 4.2 |
| **LLM Provider** | API Key (OpenAI / Gemini / Claude) | WF 4.1 (intent classification + FAQ answer) |
| **Payment Gateway** | API Key (Moyasar / Tap / HyperPay) | Phase 3 only — NOT needed for these 7 workflows |

> **LLM keys live ONLY in n8n credentials — never in the Next.js app.** This is the architecture rule for all AI workflows (Phase 4).

---

## 9. Per-Workflow Index — فهرس سير العمل

| File | Trigger | What it does | Prerequisite |
|---|---|---|---|
| `workflows/wf-1.1-welcome-new-user.json` | Webhook `POST /new-user` (INSERT on `profiles`) | Fetches the new profile, sends welcome email + WhatsApp if phone present, logs to `audit_log`. | `audit_log` table; Resend + Evolution credentials. |
| `workflows/wf-2.1-new-request-notify-lawyers.json` | Webhook `POST /new-request` (INSERT on `service_requests`) | Fetches the request, queries matching verified lawyers by specialization + city, loops over them sending email + WhatsApp + in-app notification, then emails the client a receipt confirmation. | `notifications` table; lawyer matching columns (`is_verified`, `is_accepting_clients`, `specialization`, `city`) on `lawyer_profiles`. |
| `workflows/wf-2.2-request-assigned-notify-client.json` | Webhook `POST /request-status` (UPDATE → `status=assigned`) | Fetches request, filters on `status=assigned`, fetches client + lawyer info, emails + WhatsApps the client, inserts a notification. | `notifications` table; `assigned_to` populated on `service_requests`. |
| `workflows/wf-2.3-request-completed-review.json` | Webhook `POST /request-status` (UPDATE → `status=completed`) | Fetches request, filters on `status=completed`, emails completion receipt, inserts notification, waits 24h, emails review request. | `notifications` table; n8n Wait node (requires n8n to be persistent / queue mode for long waits). |
| `workflows/wf-1.2-lawyer-verification.json` | Two webhooks: `POST /verification` (INSERT on `lawyer_profiles`) + `GET /lawyer-approval` (admin callback) | On new lawyer: fetch profile, email admin with approve/reject links. On approval callback: if approve → set `is_verified=true`, email lawyer "تم تفعيل حسابك"; if reject → set `is_verified=false`. | Admin account exists in `profiles` (`user_type='admin'`); `lawyer_profiles.is_verified` column. |
| `workflows/wf-4.2-consultation-reminder.json` | **Schedule Trigger** — every 30 minutes | Queries consultations in the 24h / 1h windows, routes by window: 24h → email + WhatsApp + set `reminder_sent=true`; 1h → urgent WhatsApp + set `reminder_1h_sent=true`. | **`reminder_sent` + `reminder_1h_sent` boolean columns on `consultations` (NOT yet migrated).** Until added, the workflow runs but the WHERE clause treats them as null→false via `COALESCE`. A migration is required for correct idempotency. |
| `workflows/wf-4.1-whatsapp-triage.json` | Webhook `POST /whatsapp-incoming` (Evolution API) | Checks if sender exists in `profiles`, calls an LLM to classify intent (consultation / request / inquiry / complaint), switches: consultation → insert into `consultations`; request → insert into `service_requests`; inquiry → LLM FAQ answer → reply on WhatsApp; complaint → insert into `service_requests` with `type=complaint`. | LLM endpoint env vars (`LLM_API_KEY`, `LLM_CLASSIFY_ENDPOINT`, `LLM_FAQ_ENDPOINT`); Evolution API sending configured; `profiles.phone` matches the incoming JID format. |

### Node counts

| Workflow | Nodes |
|---|---|
| WF 1.1 | 7 |
| WF 2.1 | 10 |
| WF 2.2 | 8 |
| WF 2.3 | 9 |
| WF 1.2 | 11 |
| WF 4.2 | 9 |
| WF 4.1 | 9 |

---

## 10. Known Gaps & Next Steps — الفجوات والخطوات التالية

1. **`request_events.metadata` column missing.** The `recordEvent` helper accepts a `metadata` param for forward-compatibility but does NOT persist it — the `request_events` table (migration `20260518_client_workflow_backend_ready.sql`) has columns `id, request_id, event, actor_user_id, actor_name, created_at` only. A future migration must add `metadata jsonb` before n8n can route on rich per-event metadata.
2. **No outbound dispatch yet.** `POST /api/v1/n8n/trigger` assembles + logs only. A `dispatchToN8n(event, payload)` helper + `N8N_WEBHOOK_BASE_URL` env var + the per-event path mapping must be added before Option A fires.
3. **Realtime chat polling.** Not covered by these workflows. Chat is still HTTP-polling on the frontend; a websocket/realtime layer is a separate workstream.
4. **Payment gateway wiring (Phase 3).** The payment gateway is admin-gated via `platform_settings.payments_gateway` (`status: "disabled" | "test" | "live"`) and the real provider is NOT wired. Phase 3 workflows (payment success, subscription renewal, credit expiry, invoice PDF, wallet sync, referral reward) are blocked on this.
5. **WF 4.2 reminder columns.** `consultations.reminder_sent` / `reminder_1h_sent` are not yet migrated. Add them in a new migration before activating WF 4.2 in production.
6. **WF 2.2 + WF 2.3 share the `/request-status` path.** Both workflows filter on `entity.status` / `status` internally. If you prefer one webhook per event, split the path into `/request-assigned` and `/request-completed` and update the registry in §7.
7. **The remaining 31 workflows.** Phase 2 (7 operational), Phase 3 (6 billing), Phase 4 (18 AI tools) are NOT in this directory. See `n8n_master_guide_latest.md` at the project root for the full spec — another agent owns that file.

---

## 11. Status

- **Last Updated: 2026-06-29**
- **Trigger layer:** Built (`src/lib/events.ts`, `src/lib/n8n/payload.ts`, `POST /api/v1/n8n/trigger`). Generic trigger logs only — does not send. **2026-06-29:** shared `namespaceEvent` helper now lives in `src/lib/events.ts` and is used by `POST /api/v1/service-requests/[id]/events` to namespace free-text client events → `service_request.created`, keeping the audit event stream consistent for n8n routing.
- **Live AI→n8n routes:** `/api/ai/library-chat` + `/api/ai/explain-article` are the only paths that POST to n8n today (when their webhook env vars are set; currently unset → 503). The 18 `/api/v1/ai/*` routes from the spec do not exist yet.
- **Workflows:** The 7 Phase 1 / Section A workflows are **importable template files** in `n8n/workflows/` (well-formed JSON). **0 are imported into / running in any n8n instance yet.**
- **n8n hosting:** Not yet provisioned. No webhook URLs are live. **Building/hosting n8n + importing these templates is the next step.**
- **Payments:** Admin-gated, real provider deferred to Phase 3.