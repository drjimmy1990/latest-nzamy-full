# 🔄 NZAMY — n8n Workflows Master Guide

> **This is the ONLY workflows file you need.**
> It replaces: `n8n_workflows.md`, `workflows_roadmap.md`, and `n8n_workflows_list.md`
>
> **Total: 38 workflows** (20 operational + 18 AI-powered)
> **Last Updated: 2026-06-17**

---

## 📋 Table of Contents

1. [Before You Start — Setup Checklist](#-before-you-start)
2. [🔴 Phase 1 — Build First (7 workflows)](#-phase-1--build-first-client--lawyer-flow)
3. [🟡 Phase 2 — Build Next (7 workflows)](#-phase-2--build-next-operational)
4. [🔵 Phase 3 — Build After Payments (6 workflows)](#-phase-3--build-after-payments-decided)
5. [🤖 Phase 4 — AI Tools (18 workflows)](#-phase-4--ai-legal-tools-18-workflows)
6. [Webhook URL Registry](#-webhook-url-registry)
7. [API Routes to Create](#-api-routes-to-create)
8. [Credentials Needed in n8n](#-credentials-needed-in-n8n)
9. [Progress Tracker](#-progress-tracker)

---

## ⚙️ Before You Start

Complete these **before building any workflow**:

- [ ] **n8n installed** on VPS or cloud (self-hosted recommended)
- [ ] **n8n connected to Supabase** via Postgres node or HTTP + service_role key
- [ ] **Set in `.env.local`:**
  - `N8N_WEBHOOK_BASE_URL` (e.g., `http://your-n8n:5678/webhook`)
  - `N8N_API_KEY`
- [ ] **Evolution API** installed + webhook configured → n8n receives WhatsApp messages
- [ ] **SMTP provider** configured (Resend / SendGrid / Mailgun)
- [ ] **Create at least 2 Arabic email templates:** `welcome` + `request-received`

### Environment Variables for n8n

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=re_xxxxx
EMAIL_FROM=noreply@nezamy.sa
EMAIL_FROM_NAME=نظامي
EVOLUTION_API_URL=https://evo.nezamy.sa
EVOLUTION_API_KEY=your-evolution-key
EVOLUTION_INSTANCE_NAME=nzamy_main
```

---

---

## 🔴 Phase 1 — Build First (Client ↔ Lawyer Flow)

> **Why first?** These 7 workflows complete the core business flow. After building them, a real client can register → create request → lawyer gets notified → lawyer accepts → client gets confirmation → consultation happens → both get reminders.

| # | Workflow | Trigger | What It Does |
|---|---------|---------|-------------|
| 1.1 | Welcome Email + WhatsApp | `INSERT` on `profiles` | New user gets welcome email + WhatsApp |
| 2.1 | New Request → Notify Lawyers | `INSERT` on `service_requests` | Match lawyers by specialty/city, notify them |
| 2.2 | Request Assigned → Notify Client | `UPDATE` on `service_requests` (status=assigned) | Client knows a lawyer took their case |
| 2.3 | Request Completed + Ask Review | `UPDATE` on `service_requests` (status=completed) | Client gets completion notice → 24h later review email |
| 1.2 | Lawyer Verification | `INSERT` on `lawyer_profiles` | Admin notified → approves → lawyer activated |
| 4.2 | Consultation Reminder | Cron every 30 min | 24h + 1h reminders to both parties |
| 4.1 | WhatsApp Triage (AI) | Evolution API webhook | AI classifies WhatsApp messages → creates requests |

### After Phase 1 is done, this is what works:

```
👤 Client registers
    → Gets welcome email + WhatsApp ✅
    → Creates service request
    → Matching lawyers get email + WhatsApp + bell notification ✅
    → Lawyer accepts
    → Client gets "lawyer assigned" notification ✅
    → Consultation scheduled
    → Both get 24h + 1h reminders ✅
    → Lawyer marks completed
    → Client gets completion + review request ✅

📱 OR via WhatsApp:
    → Client sends message → AI classifies → creates request ✅
    → Same flow continues...
```

### Email Templates Needed (Phase 1): 4 templates

| Template | Arabic Subject | Used By |
|----------|---------------|---------|
| `welcome` | مرحباً بك في منصة نظامي | WF 1.1 |
| `request-received` | تم استلام طلبك القانوني | WF 2.1 |
| `request-assigned` | تم تعيين محامي لطلبك | WF 2.2 |
| `review-request` | شاركنا تجربتك | WF 2.3 |

**Estimated Time: ~18-25 hours total**

---

### Workflow Details (Phase 1)

<details>
<summary><b>1.1 — Welcome Email + WhatsApp</b></summary>

**Trigger:** Supabase DB Webhook → `INSERT` on `profiles`

**Nodes:**
```
[Supabase Webhook] → [If: Has Phone?] → [Email (Resend)] → [Evolution API WhatsApp] → [Supabase: Log audit]
```

**Webhook Input:**
```json
{
  "type": "INSERT",
  "table": "profiles",
  "record": {
    "id": "uuid",
    "full_name": "احمد العتيبي",
    "email": "ahmed@example.com",
    "phone": "+966500000000",
    "user_type": "client"
  }
}
```

**WhatsApp Output:**
```json
{
  "number": "+966500000000",
  "textMessage": {
    "text": "مرحباً أحمد العتيبي، يسعدنا انضمامك إلى منصة نظامي القانونية. يمكنك الآن البدء بطلب خدماتك القانونية بكل سهولة."
  }
}
```

**DB Updates:** `audit_log` ← log welcome dispatch
</details>

<details>
<summary><b>2.1 — New Request → Notify Lawyers</b></summary>

**Trigger:** Supabase DB Webhook → `INSERT` on `service_requests` (where status = `pending_assignment`)

**Nodes:**
```
[Webhook] → [Query Matching Lawyers] → [Loop: Email + WhatsApp each lawyer] → [Insert notifications] → [Email client confirmation]
```

**Lawyer Matching Query:**
```sql
SELECT p.id, p.email, p.phone 
FROM lawyer_profiles lp
JOIN profiles p ON lp.user_id = p.id
WHERE lp.is_verified = true 
  AND lp.is_accepting_clients = true 
  AND lp.specialization = $1
  AND lp.city = $2;
```

**DB Updates:** `notifications` ← one row per matched lawyer
</details>

<details>
<summary><b>2.2 — Request Assigned → Notify Client</b></summary>

**Trigger:** Supabase DB Webhook → `UPDATE` on `service_requests` (status changed to `assigned`)

**Nodes:**
```
[Webhook] → [Fetch Client + Lawyer Info] → [Email Client] → [WhatsApp Client] → [Insert notification]
```

**WhatsApp to Client:**
```
"تم تعيين المحامي عبد الله الرميح لمباشرة طلبك القانوني رقم (1093). يمكنك التواصل معه الآن عبر المحادثات."
```

**DB Updates:** `notifications` ← client notification row
</details>

<details>
<summary><b>2.3 — Request Completed + Ask Review</b></summary>

**Trigger:** Supabase DB Webhook → `UPDATE` on `service_requests` (status changed to `completed`)

**Nodes:**
```
[Webhook] → [Email: Completion Receipt] → [Insert notification] → [Wait 24 hours] → [Email: Review Request]
```

**DB Updates:** `notifications` ← completion notice
</details>

<details>
<summary><b>1.2 — Lawyer Verification</b></summary>

**Trigger:** Supabase DB Webhook → `INSERT` on `lawyer_profiles`

**Nodes:**
```
[Webhook] → [Fetch Profile] → [Email Admin: "محامي جديد ينتظر التحقق"] → [Wait for Callback] → [If Approved?] → [Update is_verified] → [Email Lawyer: "تم تفعيل حسابك"]
```

**Admin Approval Link:** `POST https://n8n.nzamy.com/webhook/lawyer-approval?id=lawyer_uuid&decision=approve`

**DB Updates:** `lawyer_profiles.is_verified` = true/false + `audit_log`
</details>

<details>
<summary><b>4.2 — Consultation Reminder</b></summary>

**Trigger:** Cron every 30 minutes

**Nodes:**
```
[Cron] → [Query upcoming consultations] → [Route: 24h path or 1h path]
  → 24h: [Email + WhatsApp] → [Set reminder_sent = true]
  → 1h:  [WhatsApp urgent] → [Set reminder_1h_sent = true]
```

**Query:**
```sql
SELECT c.id, c.scheduled_at, cp.phone, lp.phone
FROM consultations c
JOIN profiles cp ON c.client_user_id = cp.id
JOIN profiles lp ON c.lawyer_user_id = lp.id
WHERE (c.scheduled_at BETWEEN NOW() AND NOW() + INTERVAL '24 hours' AND c.reminder_sent = false)
   OR (c.scheduled_at BETWEEN NOW() AND NOW() + INTERVAL '1 hour' AND c.reminder_1h_sent = false);
```

> ⚠️ **Prerequisite:** Add `reminder_sent` + `reminder_1h_sent` columns to `consultations` table
</details>

<details>
<summary><b>4.1 — WhatsApp Triage (AI)</b></summary>

**Trigger:** Evolution API webhook (incoming WhatsApp message)

**Nodes:**
```
[Evolution Webhook] → [Check user exists in profiles] → [AI Classify Intent] → [Switch]
  → "consultation" → [Insert into consultations]
  → "request"      → [Insert into service_requests]
  → "inquiry"      → [AI FAQ Answer → Reply WhatsApp]
  → "complaint"    → [Insert into service_requests (type=complaint)]
```

**Requires:** LLM provider configured in n8n (OpenAI / Gemini / Claude)
</details>

---

---

## 🟡 Phase 2 — Build Next (Operational)

> **Why next?** These support the platform but don't block the client↔lawyer launch.

| # | Workflow | Trigger | What It Does |
|---|---------|---------|-------------|
| 2.4 | Request Escalation (48h SLA) | Cron hourly | Auto-escalate stale pending requests, alert admin |
| 4.3 | Hearing Reminder | Cron every 30 min | Remind both parties 24h before court hearing |
| 1.3 | Firm Onboarding | `INSERT` on `firm_profiles` | Welcome firm admin, create default settings |
| 1.4 | Provider Verification | `INSERT` on `provider_profiles` | Same pattern as lawyer verification |
| 5.1 | Daily Admin Digest | Cron daily 8:00 AM | New users, requests, revenue summary → admin email |
| 5.2 | Security Alert (Failed Logins) | Auth webhook | Alert admin after 5+ failed logins from same IP |
| 5.3 | Content Moderation (AI) | `INSERT` on `community_posts` | AI checks for spam/offensive → flag for review |

<details>
<summary><b>Workflow Details (Phase 2)</b></summary>

### 2.4 — Request Escalation (48h SLA)
- **Trigger:** Cron hourly (`0 * * * *`)
- **Query:** `WHERE status = 'pending_assignment' AND created_at < NOW() - INTERVAL '48 hours'`
- **Actions:** Set `priority = 'urgent'`, email + WhatsApp admin

### 4.3 — Hearing Reminder
- **Trigger:** Cron every 30 min
- **Query:** `WHERE next_hearing_date BETWEEN NOW() AND NOW() + '24 hours' AND hearing_reminder_sent = false`
- **Actions:** Email + WhatsApp lawyer and client, set `hearing_reminder_sent = true`

### 1.3 — Firm Onboarding
- **Trigger:** `INSERT` on `firm_profiles`
- **Actions:** Welcome email → insert default `user_settings` → notify platform admin

### 1.4 — Provider Verification
- **Trigger:** `INSERT` on `provider_profiles`
- **Actions:** Same pattern as lawyer verification (email admin → wait approval → update `is_verified`)

### 5.1 — Daily Admin Digest
- **Trigger:** Cron daily 8:00 AM
- **Actions:** Aggregate queries (new users, requests, revenue, pending verifications) → email + WhatsApp admin

### 5.2 — Security Alert
- **Trigger:** Supabase Auth webhook on login failure
- **Actions:** Count failures from same IP in 30 min → if ≥5 → alert admin + log high-severity audit

### 5.3 — Content Moderation (AI)
- **Trigger:** `INSERT` on `community_posts` or `community_answers`
- **Actions:** OpenAI moderation check → if flagged → set `status = 'under_review'` + notify moderator
</details>

---

---

## 🔵 Phase 3 — Build After Payments Decided

> **⏸️ BLOCKED** — Waiting for payment gateway decision (Moyasar / Tap / HyperPay)

| # | Workflow | Trigger | What It Does |
|---|---------|---------|-------------|
| 3.1 | Payment Success | `INSERT/UPDATE` on `payments` (status=completed) | Send receipt email + WhatsApp |
| 3.2 | Subscription Renewal Reminder | Cron daily 9 AM | Warn users expiring in 3 days |
| 3.3 | Credit Expiry Warning | Cron daily 9 AM | Warn users with credits expiring in 7 days |
| 3.4 | Invoice Generation (PDF) | `INSERT` on `payments` | Generate PDF → upload to Supabase Storage |
| — | Wallet Balance Sync | `INSERT` on `wallet_transactions` | Compute balance, low-balance alert if < 50 SAR |
| — | Referral Reward Processing | `UPDATE` on `referrals` (status=completed) | Credit 50 SAR to referrer wallet |

### Email Templates Needed (Phase 3): 3 templates

| Template | Arabic Subject |
|----------|---------------|
| `payment-receipt` | إيصال دفع |
| `subscription-expiring` | اشتراكك سينتهي قريباً |
| `credit-low` | رصيد الأرصدة منخفض |

---

---

## 🤖 Phase 4 — AI Legal Tools (18 Workflows)

> **Architecture:** Frontend → `POST /api/v1/ai/{tool}` → n8n webhook → LLM → Response
>
> **Key Rule:** All LLM API keys stored in n8n credentials ONLY — never in Next.js.
>
> **Prerequisites:**
> - LLM Provider account (OpenAI / Gemini / Claude) — configured in n8n
> - Saudi Laws Vector Database (for research + direction-support tools)
> - `ai_usage_log` table (already exists in migration 005)
> - Credit/Wallet system (depends on Phase 3)

### Build Order

| Priority | # | Arabic Name | English Name | Webhook Path | Credits |
|----------|---|-------------|-------------|-------------|---------|
| 🔴 P1 | 6.1 | الصائغ القانوني | Legal Document Drafter | `/ai/draft` | 1 |
| 🔴 P1 | 6.8 | الباحث القانوني | Legal Research Engine | `/ai/research` | 1 |
| 🔴 P1 | 6.9 | المستشار القانوني | Quick Legal Answer | `/ai/quick-answer` | 0 (free) |
| 🔴 P1 | 6.13 | صياغة الخطابات | Client Letter Drafter | `/ai/letter` | 0 (free) |
| 🔴 P1 | 6.14 | تحليل القضية | Case AI Insight | `/ai/case-insight` | 0 (cached) |
| 🟡 P2 | 6.2 | محترف العقود | Contract Generator | `/ai/contracts` | 1 |
| 🟡 P2 | 6.3 | مراجع العقود | Contract Reviewer | `/ai/contract-review` | 1 |
| 🟡 P2 | 6.4 | داعم الاتجاه | Direction & Legal Support | `/ai/direction-support` | 1 |
| 🟡 P2 | 6.5 | محاكي الخصم | Wargaming Simulator | `/ai/wargaming` | 2 |
| 🟡 P2 | 6.6 | محلل قوة الموقف | Case Strength Analyzer | `/ai/analyze-strength` | 1 |
| 🟡 P2 | 6.7 | السكرتير الذكي | Smart Secretary | `/ai/secretary` | 0 (sub) |
| 🟢 P3 | 6.10 | المترجم القانوني | Legal Translation | `/ai/translate` | 1 |
| 🟢 P3 | 6.11 | ملخص القضية | Case Brief Generator | `/ai/case-brief` | 1 |
| 🟢 P3 | 6.12 | حاسبة الأتعاب | Fee Calculator | `/ai/fee-calculator` | 0 (free) |
| 🟢 P3 | 6.15 | المستشار المؤسسي | Corporate Legal Advisor | `/ai/corp` | 1 |
| 🟢 P3 | 6.16 | المستشار الحكومي | Government Legal Advisor | `/ai/gov` | 1 |
| 🟢 P3 | 6.17 | مستشار المؤسسات الصغيرة | Micro Business Advisor | `/ai/micro` | 0 (free) |
| 🟢 P3 | 6.18 | مستشار الجمعيات | NGO Legal Advisor | `/ai/ngo` | 0 (free) |

### Every AI Workflow Follows This Pattern:

```
[Webhook Trigger]
    → [Auth Check: verify user token]
    → [Supabase: Get user profile + subscription tier]
    → [If: Has credits? (skip for free tools)]
    → [Context Builder: merge user input + case data + Saudi law references]
    → [LLM Node: Call OpenAI/Gemini/Claude with Arabic system prompt]
    → [Post-Process: Format Arabic output + add article citations]
    → [Supabase: Log to ai_usage_log (user_id, tool, tokens, cost)]
    → [Supabase: Deduct credit from wallet (if paid tool)]
    → [Respond to Webhook: Return structured JSON]
```

---

---

## 🔗 Webhook URL Registry

Add all of these to your `.env.local` (replace `your-n8n:5678` with your actual n8n URL):

```bash
# ══════════════════════════════════════════
# OPERATIONAL WEBHOOKS (Phase 1-3)
# ══════════════════════════════════════════
N8N_WEBHOOK_BASE_URL=http://your-n8n:5678/webhook
N8N_WEBHOOK_NEW_USER=http://your-n8n:5678/webhook/new-user
N8N_WEBHOOK_NEW_REQUEST=http://your-n8n:5678/webhook/new-request
N8N_WEBHOOK_PAYMENT=http://your-n8n:5678/webhook/payment
N8N_WEBHOOK_VERIFICATION=http://your-n8n:5678/webhook/verification
N8N_WEBHOOK_ESCALATION=http://your-n8n:5678/webhook/escalation

# ══════════════════════════════════════════
# AI TOOL WEBHOOKS (Phase 4)
# ══════════════════════════════════════════
N8N_WEBHOOK_AI_DRAFT=http://your-n8n:5678/webhook/ai/draft
N8N_WEBHOOK_AI_CONTRACTS=http://your-n8n:5678/webhook/ai/contracts
N8N_WEBHOOK_AI_CONTRACT_REVIEW=http://your-n8n:5678/webhook/ai/contract-review
N8N_WEBHOOK_AI_DIRECTION=http://your-n8n:5678/webhook/ai/direction-support
N8N_WEBHOOK_AI_WARGAMING=http://your-n8n:5678/webhook/ai/wargaming
N8N_WEBHOOK_AI_STRENGTH=http://your-n8n:5678/webhook/ai/analyze-strength
N8N_WEBHOOK_AI_SECRETARY=http://your-n8n:5678/webhook/ai/secretary
N8N_WEBHOOK_AI_RESEARCH=http://your-n8n:5678/webhook/ai/research
N8N_WEBHOOK_AI_QUICK_ANSWER=http://your-n8n:5678/webhook/ai/quick-answer
N8N_WEBHOOK_AI_TRANSLATE=http://your-n8n:5678/webhook/ai/translate
N8N_WEBHOOK_AI_CASE_BRIEF=http://your-n8n:5678/webhook/ai/case-brief
N8N_WEBHOOK_AI_FEE_CALC=http://your-n8n:5678/webhook/ai/fee-calculator
N8N_WEBHOOK_AI_LETTER=http://your-n8n:5678/webhook/ai/letter
N8N_WEBHOOK_AI_CASE_INSIGHT=http://your-n8n:5678/webhook/ai/case-insight
N8N_WEBHOOK_AI_CORP=http://your-n8n:5678/webhook/ai/corp
N8N_WEBHOOK_AI_GOV=http://your-n8n:5678/webhook/ai/gov
N8N_WEBHOOK_AI_MICRO=http://your-n8n:5678/webhook/ai/micro
N8N_WEBHOOK_AI_NGO=http://your-n8n:5678/webhook/ai/ngo
```

### Supabase Webhooks to Create (in Supabase Dashboard)

| Webhook Name | Table | Event | Target URL |
|-------------|-------|-------|-----------|
| `wh_new_profile` | `profiles` | INSERT | `{{N8N_WEBHOOK_NEW_USER}}` |
| `wh_new_request` | `service_requests` | INSERT | `{{N8N_WEBHOOK_NEW_REQUEST}}` |
| `wh_request_update` | `service_requests` | UPDATE | `{{N8N_WEBHOOK_BASE_URL}}/request-status` |
| `wh_new_lawyer` | `lawyer_profiles` | INSERT | `{{N8N_WEBHOOK_VERIFICATION}}` |
| `wh_new_consultation` | `consultations` | INSERT | `{{N8N_WEBHOOK_BASE_URL}}/new-consultation` |
| `wh_consultation_update` | `consultations` | UPDATE | `{{N8N_WEBHOOK_BASE_URL}}/consultation-status` |
| `wh_new_payment` | `payments` | INSERT/UPDATE | `{{N8N_WEBHOOK_PAYMENT}}` |
| `wh_new_firm` | `firm_profiles` | INSERT | `{{N8N_WEBHOOK_BASE_URL}}/new-firm` |
| `wh_new_provider` | `provider_profiles` | INSERT | `{{N8N_WEBHOOK_BASE_URL}}/new-provider` |
| `wh_new_post` | `community_posts` | INSERT | `{{N8N_WEBHOOK_BASE_URL}}/new-post` |
| `wh_wallet_tx` | `wallet_transactions` | INSERT | `{{N8N_WEBHOOK_BASE_URL}}/wallet-tx` |
| `wh_referral_complete` | `referrals` | UPDATE | `{{N8N_WEBHOOK_BASE_URL}}/referral-complete` |

---

## 🛣️ API Routes to Create

Each AI tool needs a thin Next.js API route that proxies to n8n:

| API Route | n8n Webhook | Frontend Page |
|-----------|-----------|--------------|
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

| Credential | Type | Used By |
|-----------|------|---------|
| **Supabase** | service_role key | All workflows |
| **SMTP (Resend)** | API Key | Email notifications |
| **Twilio** | SID + Auth Token | SMS (optional) |
| **Evolution API** | API Key | WhatsApp messages |
| **LLM Provider** | API Key (OpenAI/Gemini/Claude) | All AI workflows |
| **Payment Gateway** | API Key (Moyasar/Tap) | Phase 3 billing workflows |

---

## 📊 Progress Tracker

### Overall Status

| Phase | Workflows | Status | Blocking? |
|-------|-----------|--------|-----------|
| 🔴 Phase 1 (Core) | 7 | ⬜ Not started | **YES** — needed for launch |
| 🟡 Phase 2 (Operational) | 7 | ⬜ Not started | No |
| 🔵 Phase 3 (Billing) | 6 | ⏸️ Waiting for payment gateway | No |
| 🤖 Phase 4 (AI Tools) | 18 | ⬜ Not started | No (pages exist with mock data) |
| **TOTAL** | **38** | | |

### Phase 1 Checklist

- [ ] **WF 1.1** — Welcome Email + WhatsApp
- [ ] **WF 2.1** — New Request → Notify Lawyers
- [ ] **WF 2.2** — Request Assigned → Notify Client
- [ ] **WF 2.3** — Request Completed + Ask Review
- [ ] **WF 1.2** — Lawyer Verification Pipeline
- [ ] **WF 4.2** — Consultation Reminder (Cron)
- [ ] **WF 4.1** — WhatsApp Triage (AI)
- [ ] **Email Template:** `welcome`
- [ ] **Email Template:** `request-received`
- [ ] **Email Template:** `request-assigned`
- [ ] **Email Template:** `review-request`

### Phase 2 Checklist

- [ ] **WF 2.4** — Request Escalation (48h SLA)
- [ ] **WF 4.3** — Hearing Reminder
- [ ] **WF 1.3** — Firm Onboarding
- [ ] **WF 1.4** — Provider Verification
- [ ] **WF 5.1** — Daily Admin Digest
- [ ] **WF 5.2** — Security Alert (Failed Logins)
- [ ] **WF 5.3** — Content Moderation (AI)

### Phase 4 Checklist (AI Tools)

- [ ] **P1:** 6.1 Legal Drafter (الصائغ القانوني)
- [ ] **P1:** 6.8 Research Engine (الباحث القانوني)
- [ ] **P1:** 6.9 Quick Answer (المستشار القانوني)
- [ ] **P1:** 6.13 Letter Drafter (صياغة الخطابات)
- [ ] **P1:** 6.14 Case Insight (تحليل القضية)
- [ ] **P2:** 6.2 Contract Generator (محترف العقود)
- [ ] **P2:** 6.3 Contract Reviewer (مراجع العقود)
- [ ] **P2:** 6.4 Direction Support (داعم الاتجاه)
- [ ] **P2:** 6.5 Wargaming (محاكي الخصم)
- [ ] **P2:** 6.6 Strength Analyzer (محلل قوة الموقف)
- [ ] **P2:** 6.7 Smart Secretary (السكرتير الذكي)
- [ ] **P3:** 6.10 Legal Translation (المترجم القانوني)
- [ ] **P3:** 6.11 Case Brief (ملخص القضية)
- [ ] **P3:** 6.12 Fee Calculator (حاسبة الأتعاب)
- [ ] **P3:** 6.15 Corporate Advisor (المستشار المؤسسي)
- [ ] **P3:** 6.16 Government Advisor (المستشار الحكومي)
- [ ] **P3:** 6.17 Micro Business Advisor (مستشار المؤسسات الصغيرة)
- [ ] **P3:** 6.18 NGO Advisor (مستشار الجمعيات)

---

> **💡 Tip:** For detailed technical specs of each workflow (input/output payloads, SQL queries, node configs), see [n8n_workflows_list.md](file:///d:/DEV/projects/SITE%20MAPS%20NZAMY%20%281%29/SITE%20MAPS%20NZAMY/nzamy-website/n8n_workflows_list.md) in the repo — it's the full technical reference.
>
> **This guide is your action plan.** The repo file is your technical reference when building each workflow.
