# 🏛️ NZAMY — n8n Final Master Build Plan

> **This is the SINGLE authoritative file for building all NZAMY n8n workflows.**
> It consolidates and supersedes: `n8n_master_guide_latest.md`, `n8n_workflows_list.md`, `n8n_workflows.md`, `workflows_roadmap.md`, and `n8n/README.md`.
> Use this file to build the workflows **one by one, in priority order**.
>
> **Total: 38 workflows** — 20 operational + 18 AI-powered legal tools.
> **Last Updated: 2026-06-29**

---

## 📌 Current State (read this first)

| Item | Status |
|------|--------|
| **Live n8n instance** | ✅ `https://n8n.asra3.com` — MCP v2.61.0, healthy (verified 2026-06-29). **Shared/personal instance** — already contains ~100+ unrelated workflows (CRM, Salla, Facebook, WhatsApp API, RAG, lessons, etc.). **Zero NZAMY legal workflows imported yet.** |
| **Importable JSON templates** | ✅ 7 Phase‑1 templates exist at `n8n/workflows/wf-*.json` (WF 1.1, 1.2, 2.1, 2.2, 2.3, 4.1, 4.2) — ready to import. The other 31 workflows have no JSON yet. |
| **Next.js trigger layer** | ✅ Built: `POST /api/v1/n8n/trigger` + `src/lib/n8n/payload.ts` + `src/lib/events.ts` (namespaced events + `namespaceEvent`). Endpoint assembles + logs payloads only — **makes no outbound HTTP yet** (needs `N8N_WEBHOOK_BASE_URL` + a `dispatchToN8n()` helper to flip to send). |
| **Live AI→n8n outbound** | Only `/api/ai/library-chat` + `/api/ai/explain-article` make real `fetch()` to n8n today (env vars unset → 503). The 18 `/api/v1/ai/*` routes do **not** exist yet. |
| **Supabase** | ✅ Connected schema; service_role key available. ⚠️ `request_events.metadata` column **missing** (a migration is needed before n8n can route on rich per-event metadata). |
| **Evolution API (WhatsApp)** | ⚠️ Not yet wired to n8n. |
| **SMTP (Resend)** | ⚠️ Not yet configured in n8n. |
| **LLM provider** | ⚠️ Not yet configured in n8n (key must live **only** in n8n credentials, never in Next.js). |
| **Payment gateway** | ⏸️ Admin-gated via `platform_settings.payments_gateway` (`disabled`/`test`/`live`). Real provider NOT wired → Phase 3 blocked. |

> **⚠️ Build status: 0 of 38 NZAMY workflows are built/imported. The Next.js side is ready to feed n8n; the n8n side is the work.**

## 🗂️ Big Workflow Containers (live in n8n.asra3.com)

We grouped **alike workflows into 6 big category workflows** (one canvas per category, multiple triggers feeding labelled branch placeholders). Each branch placeholder is a `NoOp` node named `… (BUILD HERE)` — we replace it with the real nodes when building that workflow. All 6 are created, inactive (drafts), validated.

| Category workflow | n8n ID | Branches (sub-workflows) | Triggers |
|---|---|---|---|
| **NZAMY · Service Requests** | `YkvR5SI8ljcSOfuC` | WF 2.1, 2.2, 2.3, 2.4 | `/new-request`, `/request-assigned`, `/request-completed` + cron hourly |
| **NZAMY · Onboarding & Verification** | `5mg451RaFPJXwME4` | WF 1.1, 1.2 (a+b), 1.3, 1.4 | `/new-user`, `/verification`, `/lawyer-approval`, `/new-firm`, `/new-provider` |
| **NZAMY · Communication** | `Y8SnEGaXTC3dboGA` | WF 4.1, 4.2, 4.3 | `/whatsapp-incoming` + 2× cron 30min |
| **NZAMY · Admin & Moderation** | `vOjQdg5CPgO9naa6` | WF 5.1, 5.2, 5.3 | cron daily 8am, `/auth-failed`, `/new-post` |
| **NZAMY · Billing & Wallet** | `nLcTncqGZnSKCOoQ` | WF 3.1, 3.2, 3.3, 3.4, Wallet, Referral | `/payment`, `/invoice-generate`, `/wallet-tx`, `/referral-complete` + 2× cron 9am ⏸️ |
| **NZAMY · AI Legal Tools** | `rtj1TC9rd6Ule7am` | WF 6.1–6.18 (18 tools) | 18× `/ai/{tool}` webhooks |

**How to build a workflow into its branch:** open the category workflow in n8n (or via MCP `n8n_update_partial_workflow` with the ID above), find the `… (BUILD HERE)` NoOp for that sub-workflow, and replace it with the real node chain from the spec below. Set credentials, upgrade the webhook `typeVersion` to 2.1, add error handling + `Respond to Webhook` (for AI tools), validate, then activate.

---

## 📋 Table of Contents

1. [Before You Start — Setup Checklist](#-before-you-start)
2. [🔥 Priority Build Order — The Master List](#-priority-build-order--the-master-list)
3. [🔴 Phase 1 — Build First (7 workflows, client↔lawyer flow)](#-phase-1--build-first-client--lawyer-flow)
4. [🟡 Phase 2 — Build Next (7 operational workflows)](#-phase-2--build-next-7-operational-workflows)
5. [🔵 Phase 3 — Build After Payments (6 billing workflows)](#-phase-3--build-after-payments-6-billing-workflows)
6. [🤖 Phase 4 — AI Legal Tools (18 workflows)](#-phase-4--ai-legal-tools-18-workflows)
7. [📧 Email Templates (9)](#-email-templates-9)
8. [🔗 Webhook URL Registry + Env Vars](#-webhook-url-registry--env-vars)
9. [🗄️ Supabase DB Webhooks to Create](#-supabase-db-webhooks-to-create)
10. [📦 Payload Contract](#-payload-contract)
11. [🛣️ Next.js API Routes to Create](#-nextjs-api-routes-to-create)
12. [🔑 Credentials Needed in n8n](#-credentials-needed-in-n8n)
13. [📊 Progress Tracker](#-progress-tracker)

---

## ⚙️ Before You Start

Complete these **before building any workflow**:

- [ ] **n8n instance reachable** — ✅ `https://n8n.asra3.com` (shared instance; create a NZAMY folder/tag to keep workflows organized).
- [ ] **n8n connected to Supabase** — Postgres node or HTTP + `SUPABASE_SERVICE_KEY`.
- [ ] **Set in Next.js `.env.local`:**
  - `N8N_WEBHOOK_BASE_URL=https://n8n.asra3.com/webhook` (production webhook base)
  - `N8N_API_KEY` (optional auth header if a webhook requires it)
- [ ] **Flip the trigger endpoint to send** — add `dispatchToN8n(event, payload)` helper in `src/lib/n8n/` + the per-event path mapping; `POST /api/v1/n8n/trigger` then POSTs the payload to `{N8N_WEBHOOK_BASE_URL}/{path}`.
- [ ] **Evolution API** installed + webhook configured → n8n receives WhatsApp messages at `/whatsapp-incoming`.
- [ ] **SMTP provider** configured (Resend recommended).
- [ ] **LLM provider** key configured in n8n credentials (OpenAI / Gemini / Claude).
- [ ] **Create Arabic email templates** — at minimum `welcome` + `request-received` before Phase 1.
- [ ] **DB migration:** add `metadata jsonb` to `request_events`; add `reminder_sent` + `reminder_1h_sent` booleans to `consultations` (needed by WF 4.2).

### ⚠️ Known gaps to close during the build

1. **`request_events.metadata` column missing** — `recordEvent()` accepts metadata in-code but doesn't persist it. Migration required before n8n can route on rich per-event metadata.
2. **No outbound dispatch yet** — trigger endpoint assembles + logs only. Needs `dispatchToN8n()` + env + path mapping (see Webhook Registry).
3. **WF 4.2 reminder columns** — `consultations.reminder_sent` / `reminder_1h_sent` not migrated. Add before activating WF 4.2 in production.
4. **WF 2.2 + WF 2.3 share `/request-status`** — both filter on `entity.status` internally. Optionally split into `/request-assigned` and `/request-completed`.
5. **Payment gateway wiring** — Phase 3 blocked until provider chosen (Moyasar / Tap / HyperPay).
6. **Shared n8n instance** — keep NZAMY workflows tagged (e.g. tag `nzamy`) so they're distinguishable from the ~100 pre-existing unrelated workflows.

### Environment Variables

```env
# ── Next.js .env.local ──
N8N_WEBHOOK_BASE_URL=https://n8n.asra3.com/webhook
N8N_API_KEY=optional

# ── n8n env / credentials ──
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=re_xxxxx
EMAIL_FROM=noreply@nezamy.sa
EMAIL_FROM_NAME=نظامي
RESEND_API_KEY=re_xxxxx
EVOLUTION_API_URL=https://evo.nezamy.sa
EVOLUTION_API_KEY=your-evolution-key
EVOLUTION_INSTANCE_NAME=nzamy_main
LLM_API_KEY=sk-...          # OpenAI / Gemini / Claude — ONLY in n8n
LLM_CLASSIFY_ENDPOINT=...   # WF 4.1 intent classification
LLM_FAQ_ENDPOINT=...        # WF 4.1 FAQ replies
```

---

## 🔥 Priority Build Order — The Master List

> Build top-to-bottom. Each row is one workflow. **Template?** = importable JSON already exists in `n8n/workflows/`.

### Tier 1 — Phase 1 (BLOCKS launch — build first)

| # | Priority | Workflow | Trigger | Template? | Est. |
|---|----------|----------|---------|-----------|------|
| 2.1 | 🥇 P1.1 | New Request → Notify Lawyers | `INSERT` on `service_requests` | ✅ `wf-2.1` | 3–4h |
| 1.1 | 🥇 P1.2 | Welcome Email + WhatsApp | `INSERT` on `profiles` | ✅ `wf-1.1` | 1–2h |
| 4.1 | 🥇 P1.3 | WhatsApp Service Triage (AI) | Evolution webhook | ✅ `wf-4.1` | 4–5h |
| 2.2 | 🥈 P1.4 | Request Assigned → Notify Client | `UPDATE` → `assigned` | ✅ `wf-2.2` | 1–2h |
| 1.2 | 🥈 P1.5 | Lawyer Verification | `INSERT` on `lawyer_profiles` | ✅ `wf-1.2` | 2–3h |
| 4.2 | 🥈 P1.6 | Consultation Reminder (24h+1h) | Cron every 30 min | ✅ `wf-4.2` | 2–3h |
| 2.3 | 🥈 P1.7 | Request Completed + Ask Review | `UPDATE` → `completed` | ✅ `wf-2.3` | 2–3h |
| — | 🥇 | Email templates: `welcome`, `request-received`, `request-assigned`, `review-request` | — | — | 2–3h |

**After Tier 1:** a real client can register → create request → lawyers notified → lawyer accepts → client confirmed → consultation → both reminded → completed → review. (~18–25h total)

### Tier 2 — Phase 2 (operational, non-blocking)

| # | Priority | Workflow | Trigger | Template? |
|---|----------|----------|---------|-----------|
| 2.4 | 🥉 P2.1 | Request Escalation (48h SLA) | Cron hourly | ❌ build |
| 4.3 | 🥉 P2.2 | Hearing Reminder | Cron 30 min | ❌ build |
| 5.1 | 🥉 P2.3 | Daily Admin Digest | Cron daily 8 AM | ❌ build |
| 1.4 | 🥉 P2.4 | Provider Verification | `INSERT` on `provider_profiles` | ❌ build |
| 1.3 | 🥉 P2.5 | Firm Onboarding | `INSERT` on `firm_profiles` | ❌ build |
| 5.3 | 🔘 P2.6 | Content Moderation (AI) | `INSERT` on `community_posts` | ❌ build |
| 5.2 | 🔘 P2.7 | Security Alert (Failed Logins) | Auth webhook | ❌ build |

### Tier 3 — Phase 4 AI Tools (P1 first)

| # | Priority | Workflow | Webhook path | Credits | Template? |
|---|----------|----------|--------------|---------|-----------|
| 6.1 | 🔴 P4.1 | Legal Document Drafter (الصائغ القانوني) | `/ai/draft` | 1 | ❌ |
| 6.8 | 🔴 P4.1 | Legal Research Engine (الباحث القانوني) | `/ai/research` | 1 | ❌ |
| 6.9 | 🔴 P4.1 | Quick Legal Answer (المستشار القانوني) | `/ai/quick-answer` | 0 | ❌ |
| 6.13 | 🔴 P4.1 | Client Letter Drafter (صياغة الخطابات) | `/ai/letter` | 0 | ❌ |
| 6.14 | 🔴 P4.1 | Case AI Insight (تحليل القضية) | `/ai/case-insight` | 0 | ❌ |
| 6.2 | 🟡 P4.2 | Contract Generator (محترف العقود) | `/ai/contracts` | 1 | ❌ |
| 6.3 | 🟡 P4.2 | Contract Reviewer (مراجع العقود) | `/ai/contract-review` | 1 | ❌ |
| 6.4 | 🟡 P4.2 | Direction & Legal Support (داعم الاتجاه) | `/ai/direction-support` | 1 | ❌ |
| 6.5 | 🟡 P4.2 | Wargaming Simulator (محاكي الخصم) | `/ai/wargaming` | 2 | ❌ |
| 6.6 | 🟡 P4.2 | Case Strength Analyzer (محلل قوة الموقف) | `/ai/analyze-strength` | 1 | ❌ |
| 6.7 | 🟡 P4.2 | Smart Secretary (السكرتير الذكي) | `/ai/secretary` | 0 | ❌ |
| 6.10 | 🟢 P4.3 | Legal Translation (المترجم القانوني) | `/ai/translate` | 1 | ❌ |
| 6.11 | 🟢 P4.3 | Case Brief Generator (ملخص القضية) | `/ai/case-brief` | 1 | ❌ |
| 6.12 | 🟢 P4.3 | Fee Calculator (حاسبة الأتعاب) | `/ai/fee-calculator` | 0 | ❌ |
| 6.15 | 🟢 P4.3 | Corporate Advisor (المستشار المؤسسي) | `/ai/corp` | 1 | ❌ |
| 6.16 | 🟢 P4.3 | Government Advisor (المستشار الحكومي) | `/ai/gov` | 1 | ❌ |
| 6.17 | 🟢 P4.3 | Micro Business Advisor (مستشار المؤسسات الصغيرة) | `/ai/micro` | 0 | ❌ |
| 6.18 | 🟢 P4.3 | NGO Advisor (مستشار الجمعيات) | `/ai/ngo` | 0 | ❌ |

### Tier 4 — Phase 3 (BLOCKED on payment gateway)

| # | Workflow | Trigger | Template? |
|---|----------|---------|-----------|
| 3.1 | Payment Success | `INSERT/UPDATE` on `payments` (completed) | ❌ |
| 3.4 | Invoice Generation (PDF) | `INSERT` on `payments` | ❌ |
| 3.2 | Subscription Renewal Reminder | Cron daily 9 AM | ❌ |
| 3.3 | Credit Expiry Warning | Cron daily 9 AM | ❌ |
| — | Wallet Balance Sync | `INSERT` on `wallet_transactions` | ❌ |
| — | Referral Reward Processing | `UPDATE` on `referrals` (completed) | ❌ |

---

## 🔴 Phase 1 — Build First (Client ↔ Lawyer Flow)

> **Why first?** These 7 complete the core business flow. 7 importable JSON templates already exist — fastest path is **n8n → Import from File** → set credentials → activate.

### After Phase 1 is done, this works end-to-end:

```
👤 Client registers → WF 1.1: welcome email + WhatsApp ✅
   → Creates service request → WF 2.1: lawyers notified (email+WhatsApp+bell) + client confirmation ✅
   → Lawyer accepts → WF 2.2: client gets "lawyer assigned" ✅
   → Consultation scheduled → WF 4.2: 24h + 1h reminders to both ✅
   → Lawyer marks completed → WF 2.3: completion notice → 24h later review email ✅

📱 OR via WhatsApp → WF 4.1: AI classifies intent → creates request ✅ → same flow
```

---

### WF 1.1 — Welcome Email + WhatsApp
**Trigger:** Supabase DB Webhook → `INSERT` on `profiles`
**JSON template:** `n8n/workflows/wf-1.1-welcome-new-user.json` (7 nodes)
**Webhook path:** `/new-user`

**Node sequence:**
```
[Supabase Webhook] → [If: Has Phone?] → [Email (Resend)] → [Evolution API WhatsApp] → [Supabase: Log audit]
```

**Webhook input payload:**
```json
{
  "type": "INSERT",
  "table": "profiles",
  "record": {
    "id": "uuid",
    "full_name": "احمد العتيبي",
    "email": "ahmed@example.com",
    "phone": "+966500000000",
    "user_type": "client",
    "created_at": "2026-06-16T04:11:00Z"
  }
}
```

**WhatsApp output:**
```json
{
  "number": "+966500000000",
  "options": { "delay": 1200, "presence": "composing" },
  "textMessage": {
    "text": "مرحباً أحمد العتيبي، يسعدنا انضمامك إلى منصة نظامي القانونية. يمكنك الآن البدء بطلب خدماتك القانونية بكل سهولة."
  }
}
```

**DB updates:** `audit_log` ← log welcome dispatch.
**Edge case:** no phone → skip WhatsApp step.

---

### WF 2.1 — New Request → Notify Lawyers
**Trigger:** Supabase DB Webhook → `INSERT` on `service_requests` (status = `pending_assignment`)
**JSON template:** `n8n/workflows/wf-2.1-new-request-notify-lawyers.json` (10 nodes)
**Webhook path:** `/new-request`

**Node sequence:**
```
[Webhook] → [Query Matching Lawyers] → [Split In Batches] → [Email each lawyer] → [WhatsApp each lawyer]
   → [Insert notifications row per lawyer] → [Email client confirmation]
```

**Lawyer matching query:**
```sql
SELECT p.id, p.email, p.phone
FROM lawyer_profiles lp
JOIN profiles p ON lp.user_id = p.id
WHERE lp.is_verified = true
  AND lp.is_accepting_clients = true
  AND lp.specialization = $1
  AND lp.city = $2;
```

**Per-lawyer in-app notification:**
```json
{
  "user_id": "lawyer_uuid",
  "title": "طلب خدمة جديد متاح",
  "message": "هناك طلب خدمة جديد متوافق مع تخصصك في مدينتك. اضغط لمراجعة التفاصيل.",
  "type": "new_request",
  "read": false
}
```

**DB updates:** `notifications` ← one row per matched lawyer.

---

### WF 2.2 — Request Assigned → Notify Client
**Trigger:** Supabase DB Webhook → `UPDATE` on `service_requests` (status → `assigned`)
**JSON template:** `n8n/workflows/wf-2.2-request-assigned-notify-client.json` (8 nodes)
**Webhook path:** `/request-status` (filters `status=assigned`)

**Node sequence:**
```
[Webhook] → [Fetch Client + Lawyer Info] → [Email Client] → [WhatsApp Client] → [Insert notification]
```

**WhatsApp to client:**
```
"تم تعيين المحامي عبد الله الرميح لمباشرة طلبك القانوني رقم (1093). يمكنك التواصل معه الآن عبر المحادثات."
```

**DB updates:** `notifications` ← client notification row.

---

### WF 2.3 — Request Completed + Ask Review
**Trigger:** Supabase DB Webhook → `UPDATE` on `service_requests` (status → `completed`)
**JSON template:** `n8n/workflows/wf-2.3-request-completed-review.json` (9 nodes)
**Webhook path:** `/request-status` (filters `status=completed`)

**Node sequence:**
```
[Webhook] → [Email: Completion Receipt] → [Insert notification] → [Wait 24 hours] → [Email: Review Request]
```

**Review request email vars:**
```json
{
  "to": "client@example.com",
  "subject": "شاركنا تجربتك مع منصة نظامي",
  "template": "review-request",
  "variables": {
    "clientName": "أحمد",
    "lawyerName": "عبد الله الرميح",
    "reviewLink": "https://nzamy.com/dashboard/client/reviews/new?request_id=1093"
  }
}
```

**DB updates:** `notifications` ← completion notice. ⚠️ Wait node requires n8n in persistent/queue mode for long waits.

---

### WF 1.2 — Lawyer Verification
**Trigger:** Supabase DB Webhook → `INSERT` on `lawyer_profiles`
**JSON template:** `n8n/workflows/wf-1.2-lawyer-verification.json` (11 nodes)
**Webhook paths:** `/verification` (INSERT) + `GET /lawyer-approval` (admin callback)

**Node sequence:**
```
[Webhook] → [Fetch Profile] → [Email Admin: "محامي جديد ينتظر التحقق"] → [Wait for Callback]
  → [If Approved?] → [Update is_verified] → [Email Lawyer: "تم تفعيل حسابك"]
```

**Admin approval link callback:** `POST https://n8n.asra3.com/webhook/lawyer-approval?id=lawyer_uuid&decision=approve`

**Lawyer table update:**
```json
{ "user_id": "lawyer_uuid", "is_verified": true }
```

**DB updates:** `lawyer_profiles.is_verified` = true/false + `audit_log`. Requires an admin account in `profiles` (`user_type='admin'`).

---

### WF 4.2 — Consultation Reminder (24h + 1h)
**Trigger:** Schedule Trigger — every 30 minutes
**JSON template:** `n8n/workflows/wf-4.2-consultation-reminder.json` (9 nodes)

**Node sequence:**
```
[Cron] → [Query upcoming consultations] → [Route: 24h path or 1h path]
  → 24h: [Email + WhatsApp] → [Set reminder_sent = true]
  → 1h:  [WhatsApp urgent] → [Set reminder_1h_sent = true]
```

**Query:**
```sql
SELECT c.id, c.scheduled_at, cp.phone AS client_phone, lp.phone AS lawyer_phone
FROM consultations c
JOIN profiles cp ON c.client_user_id = cp.id
JOIN profiles lp ON c.lawyer_user_id = lp.id
WHERE (c.scheduled_at BETWEEN NOW() AND NOW() + INTERVAL '24 hours' AND COALESCE(c.reminder_sent,false) = false)
   OR (c.scheduled_at BETWEEN NOW() AND NOW() + INTERVAL '1 hour'   AND COALESCE(c.reminder_1h_sent,false) = false);
```

**DB updates:** `consultations.reminder_sent` / `reminder_1h_sent` = true.
⚠️ **Prerequisite migration:** add `reminder_sent` + `reminder_1h_sent` boolean columns to `consultations`.

---

### WF 4.1 — WhatsApp Service Triage (AI)
**Trigger:** Evolution API webhook (incoming WhatsApp message) at `/whatsapp-incoming`
**JSON template:** `n8n/workflows/wf-4.1-whatsapp-triage.json` (9 nodes)

**Node sequence:**
```
[Evolution Webhook] → [Check user exists in profiles] → [AI Classify Intent] → [Switch]
  → "consultation" → [Insert into consultations]
  → "request"      → [Insert into service_requests]
  → "inquiry"      → [AI FAQ Answer] → [Reply WhatsApp]
  → "complaint"    → [Insert into service_requests (type=complaint)]
```

**Incoming Evolution payload:**
```json
{
  "instance": "nzamy_main",
  "data": {
    "key": { "remoteJid": "966500000000@s.whatsapp.net" },
    "message": { "conversation": "أريد حجز استشارة قانونية تجارية عاجلة لمناقشة عقد تأسيس شركة" }
  }
}
```

**Classifier output:**
```json
{ "intent": "consultation", "details": "تجارة، عقد تأسيس شركة" }
```

**DB updates:** `consultations` or `service_requests` (triage insert). Requires `LLM_API_KEY`, `LLM_CLASSIFY_ENDPOINT`, `LLM_FAQ_ENDPOINT` + Evolution sending configured + `profiles.phone` matches incoming JID format.

---

## 🟡 Phase 2 — Build Next (7 operational workflows)

> Non-blocking but valuable. **No JSON templates exist** — build each from scratch in n8n (or generate via the n8n MCP `n8n_generate_workflow`).

### WF 2.4 — Request Escalation (48h SLA)
**Trigger:** Cron hourly (`0 * * * *`)
**Query:** `WHERE status = 'pending_assignment' AND created_at < NOW() - INTERVAL '48 hours'`
**Actions:** set `priority = 'urgent'`, email + WhatsApp admin, insert admin notification.

### WF 4.3 — Hearing Reminder
**Trigger:** Cron every 30 min
**Query:** `WHERE next_hearing_date BETWEEN NOW() AND NOW() + '24 hours' AND hearing_reminder_sent = false`
**Actions:** email + WhatsApp lawyer and client, set `hearing_reminder_sent = true`. ⚠️ needs `hearing_reminder_sent` column on `cases`.

### WF 1.3 — Firm Onboarding
**Trigger:** `INSERT` on `firm_profiles`
**Actions:** welcome email to firm admin → insert default `user_settings` row → notify platform admin. Default settings:
```json
{ "user_id": "firm_admin_uuid", "email_notifications": true, "push_notifications": true, "sms_notifications": false, "theme": "light" }
```

### WF 1.4 — Provider Verification
**Trigger:** `INSERT` on `provider_profiles`
**Actions:** same pattern as lawyer verification — email admin → wait approval → update `is_verified` → notify provider.

### WF 5.1 — Daily Admin Digest
**Trigger:** Cron daily 8:00 AM (`0 8 * * *`)
**Aggregate stats:**
```json
{ "newUsers": 14, "newRequests": 9, "completedRequests": 6, "revenueSAR": 4500.00, "pendingLawyers": 3 }
```
**Actions:** HTML digest → email + WhatsApp admin.

### WF 5.2 — Security Alert (Failed Logins)
**Trigger:** Supabase Auth webhook on login failure
**Logic:** count failures from same IP in last 30 min → if `>= 5` → email + WhatsApp admin + insert `audit_log` (severity=high).
**Auth failure event:**
```json
{ "event": "auth.login_failed", "ip_address": "192.168.1.10", "email": "malicious@attacker.com", "timestamp": "..." }
```

### WF 5.3 — Content Moderation (AI)
**Trigger:** `INSERT` on `community_posts` or `community_answers`
**Actions:** OpenAI moderation → if flagged → set `status = 'under_review'` + notify moderator + admin notification.
**Moderation output:**
```json
{ "flagged": true, "categories": { "harassment": false, "illicit_financial_advice": true } }
```

---

## 🔵 Phase 3 — Build After Payments (6 billing workflows)

> ⏸️ **BLOCKED** — waiting for payment gateway decision (Moyasar / Tap / HyperPay). The gateway is admin-gated via `platform_settings.payments_gateway`.

### WF 3.1 — Payment Success
**Trigger:** `INSERT/UPDATE` on `payments` (status = `completed`)
**Actions:** fetch billing address → email receipt → WhatsApp receipt. Logs to `audit_log`.
**Receipt vars:**
```json
{ "amount": 250.00, "invoice_number": "INV-2026-0091", "payment_method": "mada", "invoice_url": "https://nzamy-invoices.s3.../INV-2026-0091.pdf" }
```

### WF 3.2 — Subscription Renewal Reminder
**Trigger:** Cron daily 9 AM
**Query:** `subscriptions` expiring within 3 days where `auto_renew = false`.
**Actions:** email + WhatsApp renewal warning.

### WF 3.3 — Credit Expiry Warning
**Trigger:** Cron daily 9 AM
**Query:** `credit_transactions` expiring within 7 days, grouped by user.
**Actions:** email credit-expiry notice.

### WF 3.4 — Invoice Generation (PDF)
**Trigger:** `INSERT` on `payments`
**Actions:** HTML→PDF (Gotenberg) → upload to Supabase Storage `invoices/INV-{{id}}.pdf` → update `payments.invoice_url`.

### WF — Wallet Balance Sync & Transaction Processing
**Trigger:** `INSERT` on `wallet_transactions` (kind IN credit/debit/refund)
**Actions:** compute running balance → update `balance_after` → if balance < 50 SAR insert notification + WhatsApp low-balance alert.

### WF — Referral Reward Processing
**Trigger:** `UPDATE` on `referrals` (status → `completed` AND `reward_granted = false`)
**Actions:** fetch referrer → insert `wallet_transactions` credit 50 SAR → set `reward_granted = true`, `reward_amount = 50` → notification + email + WhatsApp to referrer.

**Phase 3 email templates:** `payment-receipt`, `subscription-expiring`, `credit-low`.

---

## 🤖 Phase 4 — AI Legal Tools (18 workflows)

> **Architecture:** Frontend → `POST /api/v1/ai/{tool}` → n8n webhook → LLM → `Respond to Webhook` → back to Next.js.
> **Key rule:** all LLM API keys live **only** in n8n credentials — never in Next.js.
> **Prerequisites:** LLM provider configured in n8n · Saudi Laws Vector DB (for research + direction-support) · `ai_usage_log` table (migration 005 ✅) · Credit/Wallet system (Phase 3).

### Every AI workflow follows this pattern:
```
[Webhook Trigger] → [Auth Check] → [Supabase: user profile + tier] → [If: Has credits? (skip for free)]
  → [Context Builder: input + case data + Saudi law references] → [LLM Node: Arabic system prompt]
  → [Post-Process: format Arabic + article citations] → [Log to ai_usage_log] → [Deduct credit (if paid)]
  → [Respond to Webhook: structured JSON]
```

### P1 — build first (most-used / currently faked on frontend)

#### 6.1 — Legal Document Drafter (الصائغ القانوني) · `/ai/draft` · 1 credit
Currently `useDraftState.ts` uses `setTimeout` mock. Input:
```json
{
  "user_id": "uuid",
  "memo_type": "case|reply|appeal|arbitration|notary|report|minutes",
  "memo_sub_type": "تحرير دعوى|لائحة اعتراضية|...",
  "legal_branch": "labor|commercial|civil|criminal|...",
  "client_role": "plaintiff|defendant",
  "case_text": "وقائع القضية...",
  "support_docs": [{"description":"عقد العمل","file_url":"..."}],
  "lawyer_notes": "...",
  "party_one": {"name":"...","id_number":"..."},
  "party_two": {"name":"...","id_number":"..."},
  "judgment_data": {"number":"٣٤٢/ع/١٤٤٥","court":"المحكمة العمالية بالرياض","date":"2024-04-12","text":"...","reasons":"..."}
}
```
Output: structured Arabic legal document with article citations.

#### 6.8 — Legal Research Engine (الباحث القانوني) · `/ai/research` · 1 credit
Prerequisite: Saudi laws vector DB. Input:
```json
{ "user_id":"uuid", "query":"ما حكم الفصل التعسفي في نظام العمل السعودي؟", "scope":"all|labor|commercial|criminal|family|...", "max_sources":10 }
```
Output: `{ answer, sources: [{law, article, text, relevance}] }`.

#### 6.9 — Quick Legal Answer (المستشار القانوني) · `/ai/quick-answer` · 0 (free, 5/day clients)
Input: `{ user_id, question, context? }`. Output: `{ answer, disclaimer, related_articles:[] }`.

#### 6.13 — Client Letter Drafter (صياغة الخطابات) · `/ai/letter` · 0 (free for clients)
Currently `ClientLetterWorkflow.tsx` uses `setTimeout` mock. Input:
```json
{ "user_id":"uuid", "letter_type":"complaint|request|notice|termination|demand", "recipient_entity":"...", "subject":"...", "details":"...", "tone":"formal|firm|neutral" }
```
Output: `{ blocks: [{type:"header",content:"..."},{type:"body",content:"..."}] }`.

#### 6.14 — Case AI Insight (تحليل القضية) · `/ai/case-insight` · 0 (cached once per case)
Currently hardcoded mock in `cases/[id]`. Input: `{ user_id, case_id, refresh:false }`. Caches to `service_requests.metadata.ai_insight`. Output: `{ insight:"استناداً لنظام العمل المادة ٧٤..." }`.

### P2 — lawyer premium tools

#### 6.2 — Contract Generator (محترف العقود) · `/ai/contracts` · 1 credit
Input: `{ user_id, contract_type:"employment|lease|sale|partnership|service|...", parties:[...], terms:{duration,value,jurisdiction}, special_clauses, language:"ar|en|bilingual" }`.

#### 6.3 — Contract Reviewer (مراجع العقود) · `/ai/contract-review` · 1 credit
Input: `{ user_id, contract_text, contract_file_url?, review_focus:"risks|compliance|completeness|all" }`. Output: `{ risks:[], suggestions:[], score:85 }`.

#### 6.4 — Direction & Legal Support (داعم الاتجاه) · `/ai/direction-support` · 1 credit
Input: `{ user_id, case_summary, legal_branch, direction:"support_plaintiff|support_defendant|neutral" }`. Uses vector search for cited articles.

#### 6.5 — Wargaming Simulator (محاكي الخصم) · `/ai/wargaming` · 2 credits (dual LLM)
Input: `{ user_id, your_position, case_facts, your_arguments:[...], legal_branch }`. LLM as opposing lawyer → LLM as judge. Output: `{ counter_args:[], judge_questions:[], weak_points:[] }`.

#### 6.6 — Case Strength Analyzer (محلل قوة الموقف) · `/ai/analyze-strength` · 1 credit
Input: `{ user_id, case_facts, evidence_list:[...], your_position, legal_branch }`. Output: `{ score:72, factors:[], recommendations:[] }`.

#### 6.7 — Smart Secretary (السكرتير الذكي) · `/ai/secretary` · 0 (subscription)
Input: `{ user_id, date, include:["hearings","deadlines","tasks","follow_ups"] }`. Fetches today's data → LLM briefing. Output: `{ briefing_text, priorities:[], calendar:[], alerts:[] }`.

### P3 — utility + sector tools

#### 6.10 — Legal Translation (المترجم القانوني) · `/ai/translate` · 1 credit
Input: `{ user_id, text, source_lang:"ar|en|auto", target_lang:"ar|en", domain:"legal|commercial|general" }`.

#### 6.11 — Case Brief Generator (ملخص القضية) · `/ai/case-brief` · 1 credit
Input: `{ user_id, case_text, case_file_url?, brief_style:"executive|detailed|timeline" }`. Output: `{ parties:[], facts:[], legal_issues:[], holding:"", reasoning:"" }`.

#### 6.12 — Fee Calculator (حاسبة الأتعاب) · `/ai/fee-calculator` · 0 (free)
Input: `{ user_id, case_type, complexity:"simple|moderate|complex", jurisdiction, estimated_duration_months }`. Output: `{ estimate_min, estimate_max, factors:[], breakdown:[] }`.

#### 6.15 — Corporate Advisor (المستشار المؤسسي) · `/ai/corp` · 1 credit
Corporate law analysis (نظام الشركات، نظام العمل، لوائح هيئة السوق المالية). Output: `{ analysis, recommendations:[], applicable_laws:[] }`.

#### 6.16 — Government Advisor (المستشار الحكومي) · `/ai/gov` · 1 credit
Government procedures + regulatory compliance. Output: `{ analysis, procedure_steps:[], regulations:[] }`.

#### 6.17 — Micro Business Advisor (مستشار المؤسسات الصغيرة) · `/ai/micro` · 0 (free, 3/day)
Small business legal guidance (licensing, contracts, labor, zakat). Output: `{ answer, action_items:[], applicable_regulations:[] }`.

#### 6.18 — NGO Advisor (مستشار الجمعيات) · `/ai/ngo` · 0 (free, 3/day)
Non-profit compliance (نظام الجمعيات والمؤسسات الأهلية، أوقاف). Output: `{ answer, compliance_checklist:[], regulations:[] }`.

---

## 📧 Email Templates (9)

Build with the workflows that need them. Resend + Handlebars.

| # | Template | Arabic subject | Phase | Used by |
|---|----------|----------------|-------|---------|
| 1 | `welcome` | مرحباً بك في منصة نظامي | 1 | WF 1.1 |
| 2 | `request-received` | تم استلام طلبك القانوني | 1 | WF 2.1 |
| 3 | `request-assigned` | تم تعيين محامي لطلبك | 1 | WF 2.2 |
| 4 | `review-request` | شاركنا تجربتك | 1 | WF 2.3 |
| 5 | `verify-email` | تأكيد البريد الإلكتروني | — | Supabase handles natively |
| 6 | `password-reset` | إعادة تعيين كلمة المرور | — | Supabase handles natively |
| 7 | `payment-receipt` | إيصال دفع | 3 | WF 3.1 |
| 8 | `subscription-expiring` | اشتراكك سينتهي قريباً | 3 | WF 3.2 |
| 9 | `credit-low` | رصيد الأرصدة منخفض | 3 | WF 3.3 |

---

## 🔗 Webhook URL Registry + Env Vars

Add to Next.js `.env.local` (base = `https://n8n.asra3.com/webhook`):

```bash
N8N_WEBHOOK_BASE_URL=https://n8n.asra3.com/webhook
# ── Operational ──
N8N_WEBHOOK_NEW_USER=$(BASE)/new-user
N8N_WEBHOOK_NEW_REQUEST=$(BASE)/new-request
N8N_WEBHOOK_PAYMENT=$(BASE)/payment
N8N_WEBHOOK_VERIFICATION=$(BASE)/verification
N8N_WEBHOOK_ESCALATION=$(BASE)/escalation
# ── AI tools ──
N8N_WEBHOOK_AI_DRAFT=$(BASE)/ai/draft
N8N_WEBHOOK_AI_CONTRACTS=$(BASE)/ai/contracts
N8N_WEBHOOK_AI_CONTRACT_REVIEW=$(BASE)/ai/contract-review
N8N_WEBHOOK_AI_DIRECTION=$(BASE)/ai/direction-support
N8N_WEBHOOK_AI_WARGAMING=$(BASE)/ai/wargaming
N8N_WEBHOOK_AI_STRENGTH=$(BASE)/ai/analyze-strength
N8N_WEBHOOK_AI_SECRETARY=$(BASE)/ai/secretary
N8N_WEBHOOK_AI_RESEARCH=$(BASE)/ai/research
N8N_WEBHOOK_AI_QUICK_ANSWER=$(BASE)/ai/quick-answer
N8N_WEBHOOK_AI_TRANSLATE=$(BASE)/ai/translate
N8N_WEBHOOK_AI_CASE_BRIEF=$(BASE)/ai/case-brief
N8N_WEBHOOK_AI_FEE_CALC=$(BASE)/ai/fee-calculator
N8N_WEBHOOK_AI_LETTER=$(BASE)/ai/letter
N8N_WEBHOOK_AI_CASE_INSIGHT=$(BASE)/ai/case-insight
N8N_WEBHOOK_AI_CORP=$(BASE)/ai/corp
N8N_WEBHOOK_AI_GOV=$(BASE)/ai/gov
N8N_WEBHOOK_AI_MICRO=$(BASE)/ai/micro
N8N_WEBHOOK_AI_NGO=$(BASE)/ai/ngo
```

> The two already-live AI routes use separate env vars: `N8N_LIBRARY_CHAT_WEBHOOK_URL`, `N8N_EXPLAIN_WEBHOOK_URL`.

---

## 🗄️ Supabase DB Webhooks to Create

Create in Supabase Dashboard → Database → Webhooks (Option B, bypasses Next.js). Templates are written for Option A's `buildWebhookPayload` shape — if using Option B, add a transform node at the top of each workflow or read from `{{$json.record.id}}` instead of `{{$json.body.entity.id}}`.

| Webhook name | Table | Event | n8n path | Workflow |
|---|---|---|---|---|
| `wh_new_profile` | `profiles` | INSERT | `/new-user` | WF 1.1 |
| `wh_new_request` | `service_requests` | INSERT | `/new-request` | WF 2.1 |
| `wh_request_update` | `service_requests` | UPDATE | `/request-status` | WF 2.2 / 2.3 |
| `wh_new_lawyer` | `lawyer_profiles` | INSERT | `/verification` | WF 1.2 |
| `wh_new_consultation` | `consultations` | INSERT | `/new-consultation` | (future) |
| `wh_consultation_update` | `consultations` | UPDATE | `/consultation-status` | (future) |
| `wh_new_payment` | `payments` | INSERT/UPDATE | `/payment` | WF 3.1 (Phase 3) |
| `wh_new_firm` | `firm_profiles` | INSERT | `/new-firm` | WF 1.3 (Phase 2) |
| `wh_new_provider` | `provider_profiles` | INSERT | `/new-provider` | WF 1.4 (Phase 2) |
| `wh_new_post` | `community_posts` | INSERT | `/new-post` | WF 5.3 (Phase 2) |
| `wh_wallet_tx` | `wallet_transactions` | INSERT | `/wallet-tx` | Wallet sync (Phase 3) |
| `wh_referral_complete` | `referrals` | UPDATE | `/referral-complete` | Referral (Phase 3) |

Evolution API sends incoming WhatsApp messages directly to `/whatsapp-incoming` (WF 4.1) — not a Supabase webhook.

### Event vocabulary (emitted into `request_events`, routed on `event` field)
`service_request.created` · `service_request.status_changed` · `service_request.updated` · `service_request.cancelled` · `service_request.completed` · `consultation.created` · `consultation.status_changed` · `task.created` · `task.status_changed` · `task.deleted` · `contract.created` · `contract.status_changed` · `hearing.created` · `payment.created`

> WF 1.1 + WF 1.2 fire on `INSERT` to `profiles`/`lawyer_profiles` — not on a `service_request.*` event.

---

## 📦 Payload Contract

Every payload from `POST /api/v1/n8n/trigger` (via `buildWebhookPayload` in `src/lib/n8n/payload.ts`) conforms to:

```json
{
  "event": "service_request.status_changed",
  "entity": { "id": "1093", "type": "legal", "status": "assigned" },
  "actor": { "id": "uuid", "name": "عبد الله الرميح", "role": "lawyer" },
  "recipient": { "id": "uuid?", "role": "lawyer" },
  "payment": { "amount": 0, "status": "not_required" },
  "timestamp": "2026-06-28T12:34:56.000Z",
  "data": { "title":"...", "description":"...", "sourcePath":"/requests/1093", "metadata":{}, "receiver":"lawyer", "assignedTo":"uuid", "requester":"client", "createdAt":"..." }
}
```

The webhook body is a **slim envelope** — the first node after each Webhook is a Postgres "Fetch full record" node using `{{$json.body.entity.id}}` to load the full row. Do not rely on `data.*` for everything; re-fetch what you need.

---

## 🛣️ Next.js API Routes to Create

Each AI tool needs a thin proxy route → n8n:

| API route | n8n webhook | Frontend |
|-----------|-----------|----------|
| `POST /api/v1/ai/draft` | `N8N_WEBHOOK_AI_DRAFT` | `/ai/draft` |
| `POST /api/v1/ai/contracts` | `N8N_WEBHOOK_AI_CONTRACTS` | `/ai/contracts` |
| `POST /api/v1/ai/contract-review` | `N8N_WEBHOOK_AI_CONTRACT_REVIEW` | `/ai/contract-reviewer` |
| `POST /api/v1/ai/direction-support` | `N8N_WEBHOOK_AI_DIRECTION` | `/ai/direction-support` |
| `POST /api/v1/ai/wargaming` | `N8N_WEBHOOK_AI_WARGAMING` | `/ai/wargaming` |
| `POST /api/v1/ai/analyze-strength` | `N8N_WEBHOOK_AI_STRENGTH` | `/ai/analyze-strength` |
| `POST /api/v1/ai/secretary` | `N8N_WEBHOOK_AI_SECRETARY` | `/ai/secretary` |
| `POST /api/v1/ai/research` | `N8N_WEBHOOK_AI_RESEARCH` | `/ai/research` |
| `POST /api/v1/ai/quick-answer` | `N8N_WEBHOOK_AI_QUICK_ANSWER` | `/ai/quick-answer` |
| `POST /api/v1/ai/translate` | `N8N_WEBHOOK_AI_TRANSLATE` | `/ai/legal-translate` |
| `POST /api/v1/ai/case-brief` | `N8N_WEBHOOK_AI_CASE_BRIEF` | `/ai/case-brief` |
| `POST /api/v1/ai/fee-calculator` | `N8N_WEBHOOK_AI_FEE_CALC` | `/ai/fee-calculator` |
| `POST /api/v1/ai/letter` | `N8N_WEBHOOK_AI_LETTER` | Client `ClientLetterWorkflow` |
| `POST /api/v1/ai/case-insight` | `N8N_WEBHOOK_AI_CASE_INSIGHT` | Client `cases/[id]` |
| `POST /api/v1/ai/corp` | `N8N_WEBHOOK_AI_CORP` | `/ai/corp` |
| `POST /api/v1/ai/gov` | `N8N_WEBHOOK_AI_GOV` | `/ai/gov` |
| `POST /api/v1/ai/micro` | `N8N_WEBHOOK_AI_MICRO` | `/ai/micro` |
| `POST /api/v1/ai/ngo` | `N8N_WEBHOOK_AI_NGO` | `/ai/ngo` |

---

## 🔑 Credentials Needed in n8n

| Credential | Type | Used by |
|-----------|------|---------|
| **Supabase (Postgres)** | host/db/user/pass, port 5432 | All workflows (every Fetch/Query/Insert/Update) |
| **Resend (SMTP/API)** | API Key (`Authorization: Bearer`) | Email — WF 1.1, 2.1, 2.2, 2.3, 1.2, 4.2 |
| **Evolution API** | API Key (header `apikey`) | WhatsApp — WF 1.1, 2.1, 2.2, 4.1, 4.2 |
| **LLM Provider** | API Key (OpenAI/Gemini/Claude) | WF 4.1 + all Phase-4 AI tools |
| **Payment Gateway** | API Key (Moyasar/Tap) | Phase 3 only |
| **Twilio** (optional) | SID + Auth Token | SMS |

> **LLM keys live ONLY in n8n credentials — never in the Next.js app.**

---

## 📊 Progress Tracker

### Overall status

| Phase | Workflows | Status | Blocking? |
|-------|-----------|--------|-----------|
| 🔴 Phase 1 (Core) | 7 | ⬜ 0/7 — JSON templates ready, not imported | **YES** — needed for launch |
| 🟡 Phase 2 (Operational) | 7 | ⬜ 0/7 — no templates yet | No |
| 🔵 Phase 3 (Billing) | 6 | ⏸️ Blocked on payment gateway | No |
| 🤖 Phase 4 (AI Tools) | 18 | ⬜ 0/18 — pages exist with mock data | No |
| **TOTAL** | **38** | **0/38 built** | |

### Foundation layer

| Layer | Status |
|-------|--------|
| Trigger layer + event standardization | ✅ Done 2026-06-28 — endpoint logs only, no outbound HTTP yet |
| Phase-1 workflow JSON templates (7) | ✅ Done 2026-06-28 — importable at `n8n/workflows/` |
| Live n8n instance | ✅ `n8n.asra3.com` reachable (shared), MCP healthy |
| 38-workflow build in n8n | ⬜ Not started |

### Phase 1 checklist
- [ ] DB migrations: `request_events.metadata`, `consultations.reminder_sent` + `reminder_1h_sent`
- [ ] Email template `welcome`
- [ ] Email template `request-received`
- [ ] Email template `request-assigned`
- [ ] Email template `review-request`
- [ ] Credentials in n8n: Supabase, Resend, Evolution
- [ ] **WF 2.1** New Request → Notify Lawyers (import `wf-2.1`)
- [ ] **WF 1.1** Welcome Email + WhatsApp (import `wf-1.1`)
- [ ] **WF 4.1** WhatsApp Triage AI (import `wf-4.1`)
- [ ] **WF 2.2** Request Assigned → Notify Client (import `wf-2.2`)
- [ ] **WF 1.2** Lawyer Verification (import `wf-1.2`)
- [ ] **WF 4.2** Consultation Reminder (import `wf-4.2`)
- [ ] **WF 2.3** Request Completed + Review (import `wf-2.3`)
- [ ] Flip `dispatchToN8n()` to send + set `N8N_WEBHOOK_BASE_URL`
- [ ] Configure Supabase DB webhooks (Option B) or enable Option A dispatch
- [ ] Configure Evolution API → n8n webhook

### Phase 2 checklist
- [ ] **WF 2.4** Request Escalation (48h SLA)
- [ ] **WF 4.3** Hearing Reminder
- [ ] **WF 1.3** Firm Onboarding
- [ ] **WF 1.4** Provider Verification
- [ ] **WF 5.1** Daily Admin Digest
- [ ] **WF 5.2** Security Alert (Failed Logins)
- [ ] **WF 5.3** Content Moderation (AI)

### Phase 4 checklist (AI tools)
- [ ] **P1:** 6.1 Draft · 6.8 Research · 6.9 Quick Answer · 6.13 Letter · 6.14 Case Insight
- [ ] **P2:** 6.2 Contracts · 6.3 Contract Review · 6.4 Direction · 6.5 Wargaming · 6.6 Strength · 6.7 Secretary
- [ ] **P3:** 6.10 Translate · 6.11 Case Brief · 6.12 Fee Calc · 6.15 Corp · 6.16 Gov · 6.17 Micro · 6.18 NGO

### Phase 3 checklist (blocked)
- [ ] **WF 3.1** Payment Success
- [ ] **WF 3.4** Invoice Generation (PDF)
- [ ] **WF 3.2** Subscription Renewal Reminder
- [ ] **WF 3.3** Credit Expiry Warning
- [ ] **WF** Wallet Balance Sync
- [ ] **WF** Referral Reward Processing

---

## 🧭 How we'll build (operating procedure)

For each workflow, working from the Priority Build Order above:

1. **Pick the next workflow** from the master list (Tier 1 → 2 → 4 → 3).
2. **If a JSON template exists** (`n8n/workflows/wf-*.json`) → import it via the n8n MCP `n8n_create_workflow` / Import-from-File, set credentials, validate (`n8n_validate_workflow`).
3. **If no template** → generate via `n8n_generate_workflow` from the spec in this file, or build node-by-node via `n8n_create_workflow`.
4. **Set credentials** on every node that needs them (Supabase Postgres, Resend, Evolution, LLM).
5. **Validate** the workflow (`n8n_validate_workflow`) and fix via `n8n_autofix_workflow`.
6. **Test** via `n8n_test_workflow` (webhook/form/chat) or manual trigger.
7. **Activate** the workflow; confirm the webhook URL is live at `https://n8n.asra3.com/webhook/{path}`.
8. **Wire the Next.js side** — set the matching `N8N_WEBHOOK_*` env var + (for AI tools) create the `POST /api/v1/ai/{tool}` proxy route.
9. **Mark the checkbox** in the Progress Tracker.

> Source files for deep technical reference: `n8n/workflows/wf-*.json` (exact node definitions) + `n8n/README.md` (integration contract). This file is the action plan + priority order.