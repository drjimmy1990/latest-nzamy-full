# Nzamy Automation: Comprehensive n8n Workflows Specification

> **Last Updated: 2026-06-17** | **38 total workflows** (20 operational + 18 AI)

This document provides a highly technical, production-grade specification for all automation workflows in the Nzamy ecosystem. It is divided into onboarding, request, billing, communication, admin management, and **AI-powered legal tools** categories.

---

## 🛠️ Global Integrations & Endpoints

### 1. Webhook Handlers
* **Nzamy API Callback**: `POST /api/v1/n8n/trigger` (generic endpoint on the Next.js backend to receive secure callbacks from n8n using an authorization header).
* **Evolution API Webhook**: `POST /api/v1/whatsapp/webhook` (endpoint configured to receive WhatsApp message payloads).
* **AI Tool Webhooks**: All AI tools POST to n8n via `POST {{N8N_WEBHOOK_BASE_URL}}/ai/{tool-name}` (see Category 6 below).

### 2. Common Node Integrations
* **Supabase Node (Postgres)**: Directly updates and reads tables using PostgreSQL or postgrest.
* **Email Node (Resend)**: Sends HTML emails via Resend API using standard handlebars templating.
* **Evolution API (WhatsApp)**: Sends instant WhatsApp text and media templates.
  * *Send Text API*: `POST {{EVOLUTION_API_URL}}/message/sendText/{{INSTANCE_NAME}}`
  * *Headers*: `apikey: {{EVOLUTION_API_KEY}}`
* **LLM Node (AI Provider)**: Routes all AI requests through n8n. The LLM provider API key is stored ONLY in n8n credentials — never in the Next.js app.
  * Supported providers: OpenAI, Google Gemini, Anthropic Claude (configurable per workflow)
  * All responses are streamed back to the Next.js API route via n8n's `Respond to Webhook` node

### 3. Webhook URL Registry

All webhook URLs that must be configured in `.env.local`:

```bash
# ── Operational Webhooks ──
N8N_WEBHOOK_BASE_URL=http://your-n8n:5678/webhook
N8N_WEBHOOK_NEW_USER=http://your-n8n:5678/webhook/new-user
N8N_WEBHOOK_NEW_REQUEST=http://your-n8n:5678/webhook/new-request
N8N_WEBHOOK_PAYMENT=http://your-n8n:5678/webhook/payment
N8N_WEBHOOK_VERIFICATION=http://your-n8n:5678/webhook/verification
N8N_WEBHOOK_ESCALATION=http://your-n8n:5678/webhook/escalation

# ── AI Tool Webhooks ──
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

### 4. Next.js API Routes to Create

Each AI tool needs a thin API route that proxies the request to n8n:

| API Route (create in Next.js) | n8n Webhook Target | Frontend Page |
|-------------------------------|-------------------|---------------|
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

## 🟢 Category 1: Onboarding Workflows (4)

### Workflow 1.1: Welcome Email & WhatsApp
* **Exact Trigger**: Supabase Database Webhook on table `public.profiles` upon `INSERT`.
* **Activation Conditions**: None (triggers for every new profile insertion).
* **Node Sequence**:
  ```
  [Supabase Webhook] ➔ [If: Has Phone?] ➔ [Email Node (Resend)] ➔ [Evolution API Node] ➔ [Supabase Node (Audit Log)]
  ```
* **Input/Output Payloads**:
  * *Webhook Input Payload*:
    ```json
    {
      "type": "INSERT",
      "table": "profiles",
      "schema": "public",
      "record": {
        "id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
        "full_name": "احمد العتيبي",
        "email": "ahmed@example.com",
        "phone": "+966500000000",
        "user_type": "client",
        "created_at": "2026-06-16T04:11:00Z"
      }
    }
    ```
  * *WhatsApp Output Payload*:
    ```json
    {
      "number": "+966500000000",
      "options": {
        "delay": 1200,
        "presence": "composing"
      },
      "textMessage": {
        "text": "مرحباً أحمد العتيبي، يسعدنا انضمامك إلى منصة نظامي القانونية. يمكنك الآن البدء بطلب خدماتك القانونية بكل سهولة."
      }
    }
    ```
* **Target API or Database Updates**:
  * Table: `public.audit_log` (INSERTs a log entry detailing successful welcome dispatch).

---

### Workflow 1.2: Lawyer Verification
* **Exact Trigger**: Supabase Database Webhook on table `public.lawyer_profiles` upon `INSERT`.
* **Activation Conditions**: None.
* **Node Sequence**:
  ```
  [Supabase Webhook] ➔ [Supabase Node (Fetch Profile Details)] ➔ [Email Node (Notify Platform Admin)] ➔ [n8n Wait for Webhook Callback] ➔ [If Approved?] ➔ [Supabase Node (Update Verification)] ➔ [Email Node (Confirm Lawyer)]
  ```
* **Input/Output Payloads**:
  * *Admin Approval Link Callback*: `POST https://n8n.nzamy.com/webhook/lawyer-approval?id=lawyer_uuid&decision=approve`
  * *Lawyer Table Update Payload (Postgres)*:
    ```json
    {
      "user_id": "lawyer_uuid",
      "is_verified": true
    }
    ```
* **Target API or Database Updates**:
  * Table: `public.lawyer_profiles`, Field: `is_verified = true` (or `false` if rejected).
  * Table: `public.audit_log` (logs approval details).

---

### Workflow 1.3: Firm Onboarding
* **Exact Trigger**: Supabase Database Webhook on table `public.firm_profiles` upon `INSERT`.
* **Activation Conditions**: None.
* **Node Sequence**:
  ```
  [Supabase Webhook] ➔ [Email Node (Welcome Firm Admin)] ➔ [Supabase Node (Insert Default User Settings)] ➔ [Email Node (Notify Platform Admin)]
  ```
* **Input/Output Payloads**:
  * *Default User Settings Insertion*:
    ```json
    {
      "user_id": "firm_admin_uuid",
      "email_notifications": true,
      "push_notifications": true,
      "sms_notifications": false,
      "theme": "light"
    }
    ```
* **Target API or Database Updates**:
  * Table: `public.user_settings` (inserts default row for new firm administrator).
  * Table: `public.audit_log` (inserts audit details).

---

### Workflow 1.4: Provider Verification
* **Exact Trigger**: Supabase Database Webhook on table `public.provider_profiles` upon `INSERT`.
* **Activation Conditions**: None.
* **Node Sequence**:
  ```
  [Supabase Webhook] ➔ [Email Node (Notify Admin for Document Review)] ➔ [n8n Wait for Webhook Callback] ➔ [If Approved?] ➔ [Supabase Node (Update Provider Status)] ➔ [Email Node (Send Approval Alert)]
  ```
* **Input/Output Payloads**:
  * *Webhook Request Input*:
    ```json
    {
      "record": {
        "user_id": "provider_uuid",
        "provider_type": "notary",
        "license_number": "LIC-98765",
        "is_verified": false
      }
    }
    ```
* **Target API or Database Updates**:
  * Table: `public.provider_profiles`, Field: `is_verified = true` (or `false`).
  * Table: `public.audit_log` (inserts logs).

---

## 🔵 Category 2: Service Request Workflows (4)

### Workflow 2.1: New Service Request Notification (Lawyer Matching)
* **Exact Trigger**: Supabase Database Webhook on table `public.service_requests` upon `INSERT`.
* **Activation Conditions**: Status must equal `"pending_assignment"`.
* **Node Sequence**:
  ```
  [Supabase Webhook] ➔ [Supabase Postgres Node (Query Matching Lawyers)] ➔ [Split In Batches Node] ➔ [Email Node (Send Alert to Lawyers)] ➔ [Evolution API Node (WhatsApp Lawyers)] ➔ [Supabase Node (Insert In-App Notifications)] ➔ [Email Node (Confirmation to Client)]
  ```
* **Input/Output Payloads**:
  * *Query Matching Lawyers (SQL)*:
    ```sql
    SELECT p.id, p.email, p.phone 
    FROM public.lawyer_profiles lp
    JOIN public.profiles p ON lp.user_id = p.id
    WHERE lp.is_verified = true 
      AND lp.is_accepting_clients = true 
      AND lp.specialization = $1
      AND lp.city = $2;
    ```
  * *Lawyer In-App Notification Insertion*:
    ```json
    {
      "user_id": "lawyer_uuid",
      "title": "طلب خدمة جديد متاح",
      "message": "هناك طلب خدمة جديد متوافق مع تخصصك في مدينتك. اضغط لمراجعة التفاصيل.",
      "type": "new_request",
      "read": false
    }
    ```
* **Target API or Database Updates**:
  * Table: `public.notifications` (adds alert row for each matched lawyer).

---

### Workflow 2.2: Request Assigned
* **Exact Trigger**: Supabase Database Webhook on table `public.service_requests` upon `UPDATE`.
* **Activation Conditions**: The `status` field transitions from any state to `"assigned"`.
* **Node Sequence**:
  ```
  [Supabase Webhook] ➔ [Supabase Node (Fetch Client + Lawyer Info)] ➔ [Email Node (Send Assign Notification to Client)] ➔ [Evolution API Node (WhatsApp Client)] ➔ [Supabase Node (Insert In-App Notification)]
  ```
* **Input/Output Payloads**:
  * *Client WhatsApp Message Payload*:
    ```json
    {
      "number": "+966511111111",
      "textMessage": {
        "text": "تم تعيين المحامي عبد الله الرميح لمباشرة طلبك القانوني رقم (1093). يمكنك التواصل معه الآن عبر المحادثات."
      }
    }
    ```
* **Target API or Database Updates**:
  * Table: `public.notifications` (inserts notification for the client).

---

### Workflow 2.3: Request Completed & Delayed Review
* **Exact Trigger**: Supabase Database Webhook on table `public.service_requests` upon `UPDATE`.
* **Activation Conditions**: The `status` field transitions to `"completed"`.
* **Node Sequence**:
  ```
  [Supabase Webhook] ➔ [Email Node (Send Completion Receipt)] ➔ [Supabase Node (Insert Notification)] ➔ [n8n Wait Node (24 Hours)] ➔ [Email Node (Send Review Template)]
  ```
* **Input/Output Payloads**:
  * *Review Request Email Parameters*:
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
* **Target API or Database Updates**:
  * Table: `public.notifications` (adds immediate client notice).

---

### Workflow 2.4: Request Escalation (48h SLA)
* **Exact Trigger**: Cron schedule running every 1 hour (`0 * * * *`).
* **Activation Conditions**: None (the query filter controls activation).
* **Node Sequence**:
  ```
  [Cron Trigger] ➔ [Supabase Postgres Node (Fetch Overdue Requests)] ➔ [Split In Batches] ➔ [Email Node (Alert Admin)] ➔ [Evolution API Node (WhatsApp Admin)] ➔ [Supabase Node (Update Request Priority)]
  ```
* **Input/Output Payloads**:
  * *Overdue Requests Query*:
    ```sql
    SELECT id, title, requester_user_id 
    FROM public.service_requests 
    WHERE status = 'pending_assignment' 
      AND created_at < NOW() - INTERVAL '48 hours';
    ```
  * *Database Update Payload (Postgres)*:
    ```sql
    UPDATE public.service_requests 
    SET priority = 'urgent' 
    WHERE id = $1;
    ```
* **Target API or Database Updates**:
  * Table: `public.service_requests`, Fields: `priority = 'urgent'`.
  * Table: `public.notifications` (adds admin warning).

---

## 🟡 Category 3: Billing Workflows (4)

### Workflow 3.1: Payment Success
* **Exact Trigger**: Supabase Database Webhook on table `public.payments` upon `INSERT` or `UPDATE`.
* **Activation Conditions**: Field `status` must equal `"completed"`.
* **Node Sequence**:
  ```
  [Supabase Webhook] ➔ [Supabase Node (Fetch Billing Address)] ➔ [Email Node (Send Payment Receipt)] ➔ [Evolution API Node (WhatsApp Receipt)]
  ```
* **Input/Output Payloads**:
  * *Email Receipt Variables*:
    ```json
    {
      "to": "customer@example.com",
      "variables": {
        "amount": 250.00,
        "invoice_number": "INV-2026-0091",
        "payment_method": "mada",
        "invoice_url": "https://nzamy-invoices.s3.amazonaws.com/INV-2026-0091.pdf"
      }
    }
    ```
* **Target API or Database Updates**:
  * Table: `public.audit_log` (logs transactional payload details).

---

### Workflow 3.2: Subscription Renewal Reminder
* **Exact Trigger**: Cron schedule running daily at 9:00 AM (`0 9 * * *`).
* **Activation Conditions**: None.
* **Node Sequence**:
  ```
  [Cron Trigger] ➔ [Supabase Postgres Node (Query Expiring Subscriptions)] ➔ [Split In Batches] ➔ [Email Node (Renewal Warning)] ➔ [Evolution API Node (WhatsApp Alert)]
  ```
* **Input/Output Payloads**:
  * *Query Expiring Subscriptions*:
    ```sql
    SELECT s.user_id, p.email, p.phone, s.end_date 
    FROM public.subscriptions s
    JOIN public.profiles p ON s.user_id = p.id
    WHERE s.end_date BETWEEN NOW() AND NOW() + INTERVAL '3 days' 
      AND s.auto_renew = false;
    ```
* **Target API or Database Updates**:
  * None (purely notification workflow).

---

### Workflow 3.3: Credit Expiry Warning
* **Exact Trigger**: Cron schedule running daily at 9:00 AM (`0 9 * * *`).
* **Activation Conditions**: None.
* **Node Sequence**:
  ```
  [Cron Trigger] ➔ [Supabase Postgres Node (Query Expiring Credits)] ➔ [Split In Batches] ➔ [Email Node (Credit Expiry Notice)]
  ```
* **Input/Output Payloads**:
  * *Query Expiring Credits*:
    ```sql
    SELECT ct.user_id, p.email, SUM(ct.amount) as expiring_balance
    FROM public.credit_transactions ct
    JOIN public.profiles p ON ct.user_id = p.id
    WHERE ct.expires_at BETWEEN NOW() AND NOW() + INTERVAL '7 days'
      AND ct.status = 'active'
    GROUP BY ct.user_id, p.email;
    ```
* **Target API or Database Updates**:
  * None.

---

### Workflow 3.4: Invoice Generation
* **Exact Trigger**: Supabase Database Webhook on table `public.payments` upon `INSERT`.
* **Activation Conditions**: None (triggers immediately for raw records to issue pending/completed receipts).
* **Node Sequence**:
  ```
  [Supabase Webhook] ➔ [n8n HTML-to-PDF / Gotenberg Node] ➔ [Supabase Storage Node (Upload PDF)] ➔ [Supabase Node (Update Payment Invoice URL)]
  ```
* **Input/Output Payloads**:
  * *Storage Upload Target*: `invoices/INV-{{$json.id}}.pdf`
  * *Invoice URL Database Update*:
    ```json
    {
      "id": "payment_uuid",
      "invoice_url": "https://[supabase-url]/storage/v1/object/public/invoices/INV-payment_uuid.pdf"
    }
    ```
* **Target API or Database Updates**:
  * Table: `public.payments`, Field: `invoice_url = "[uploaded-pdf-link]"`.

---

## 🟣 Category 4: Communication Workflows (3)

### Workflow 4.1: WhatsApp Service Triage (AI Agent Gateway)
* **Exact Trigger**: Webhook received from Evolution API upon incoming WhatsApp message.
* **Activation Conditions**: Message must contain non-empty body text.
* **Node Sequence**:
  ```
  [Evolution Webhook] ➔ [Supabase Node (Check User Registration)] ➔ [OpenAI Classifier Node] ➔ [Router / Switch]
       ➔ Intent "consultation"  ➔ [Supabase Node (Insert Consultation)]
       ➔ Intent "request"       ➔ [Supabase Node (Insert Service Request)]
       ➔ Intent "inquiry"       ➔ [OpenAI FAQ Assist Node] ➔ [Evolution API Send Message]
       ➔ Intent "complaint"     ➔ [Supabase Node (Insert Support Request)]
  ```
* **Input/Output Payloads**:
  * *Incoming Evolution API Payload*:
    ```json
    {
      "instance": "nzamy_main",
      "data": {
        "key": {
          "remoteJid": "966500000000@s.whatsapp.net"
        },
        "message": {
          "conversation": "أريد حجز استشارة قانونية تجارية عاجلة لمناقشة عقد تأسيس شركة"
        }
      }
    }
    ```
  * *OpenAI Classifier Schema output*:
    ```json
    {
      "intent": "consultation",
      "details": "تجارة، عقد تأسيس شركة"
    }
    ```
* **Target API or Database Updates**:
  * Table: `public.consultations` or `public.service_requests` (inserts triage items).

---

### Workflow 4.2: Consultation Reminder
* **Exact Trigger**: Cron schedule running every 30 minutes (`*/30 * * * *`).
* **Activation Conditions**: None.
* **Node Sequence**:
  ```
  [Cron Trigger] ➔ [Supabase Postgres (Fetch Reminders)] ➔ [Route by time remaining (24h or 1h)]
       ➔ 24h path ➔ [Email Node] ➔ [WhatsApp Node] ➔ [Supabase Node (Set reminder_sent = true)]
       ➔ 1h path  ➔ [WhatsApp Urgent Node] ➔ [Supabase Node (Set reminder_1h_sent = true)]
  ```
* **Input/Output Payloads**:
  * *Fetch Reminders Query*:
    ```sql
    SELECT c.id, c.scheduled_at, cp.phone as client_phone, lp.phone as lawyer_phone
    FROM public.consultations c
    JOIN public.profiles cp ON c.client_user_id = cp.id
    JOIN public.profiles lp ON c.lawyer_user_id = lp.id
    WHERE (c.scheduled_at BETWEEN NOW() AND NOW() + INTERVAL '24 hours' AND c.reminder_sent = false)
       OR (c.scheduled_at BETWEEN NOW() AND NOW() + INTERVAL '1 hour' AND c.reminder_1h_sent = false);
    ```
* **Target API or Database Updates**:
  * Table: `public.consultations`, Fields: `reminder_sent = true` or `reminder_1h_sent = true`.

---

### Workflow 4.3: Hearing Reminder
* **Exact Trigger**: Cron schedule running every 30 minutes (`*/30 * * * *`).
* **Activation Conditions**: None.
* **Node Sequence**:
  ```
  [Cron Trigger] ➔ [Supabase Postgres (Query Hearing Dates)] ➔ [Split In Batches] ➔ [Email Node (Lawyer)] ➔ [Evolution API Node (WhatsApp Client & Lawyer)]
  ```
* **Input/Output Payloads**:
  * *Query Hearings*:
    ```sql
    SELECT c.id, c.next_hearing_date, cp.phone as client_phone, lp.phone as lawyer_phone
    FROM public.cases c
    JOIN public.profiles cp ON c.client_user_id = cp.id
    JOIN public.profiles lp ON c.assigned_lawyer_id = lp.id
    WHERE c.next_hearing_date BETWEEN NOW() AND NOW() + INTERVAL '24 hours'
      AND c.hearing_reminder_sent = false;
    ```
* **Target API or Database Updates**:
  * Table: `public.cases`, Field: `hearing_reminder_sent = true`.

---

## 🔴 Category 5: Admin Workflows (3)

### Workflow 5.1: Daily Admin Digest
* **Exact Trigger**: Cron schedule running daily at 8:00 AM (`0 8 * * *`).
* **Activation Conditions**: None.
* **Node Sequence**:
  ```
  [Cron Trigger] ➔ [Supabase Node (Execute Aggregate Queries)] ➔ [HTML Compiler] ➔ [Email Node (Send Digest)] ➔ [Evolution API Node (WhatsApp Admin)]
  ```
* **Input/Output Payloads**:
  * *Aggregated Database Stats Output*:
    ```json
    {
      "newUsers": 14,
      "newRequests": 9,
      "completedRequests": 6,
      "revenueSAR": 4500.00,
      "pendingLawyers": 3
    }
    ```
* **Target API or Database Updates**:
  * None.

---

### Workflow 5.2: Security Alert (Failed Logins)
* **Exact Trigger**: Webhook from Supabase Auth upon login failure event.
* **Activation Conditions**: Requires IP address count of failures to be `>= 5` in the last 30 minutes.
* **Node Sequence**:
  ```
  [Auth Webhook] ➔ [Supabase Postgres (Count Recent Failures)] ➔ [If count >= 5?] ➔ [Email Node (Alert Admin)] ➔ [Evolution API Node (WhatsApp Admin)] ➔ [Supabase Node (Log high severity audit)]
  ```
* **Input/Output Payloads**:
  * *Auth Failure Event*:
    ```json
    {
      "event": "auth.login_failed",
      "ip_address": "192.168.1.10",
      "email": "malicious@attacker.com",
      "timestamp": "2026-06-16T04:11:00Z"
    }
    ```
* **Target API or Database Updates**:
  * Table: `public.audit_log` (inserts high severity security log).

---

### Workflow 5.3: Content Moderation (AI)
* **Exact Trigger**: Supabase Database Webhook on tables `public.community_posts` or `public.community_answers` upon `INSERT`.
* **Activation Conditions**: None.
* **Node Sequence**:
  ```
  [Supabase Webhook] ➔ [OpenAI Moderation Node] ➔ [If Flagged?] ➔ [Supabase Node (Update Post status)] ➔ [Email Node (Notify Moderator)] ➔ [Supabase Node (Insert Admin Notification)]
  ```
* **Input/Output Payloads**:
  * *OpenAI Moderation Check API Request*:
    ```json
    {
      "input": "شخص يريد الحصول على استشارة مجانية للتهرب الضريبي في السعودية"
    }
    ```
  * *Moderation Flagged Output*:
    ```json
    {
      "flagged": true,
      "categories": {
        "harassment": false,
        "illicit_financial_advice": true
      }
    }
    ```
* **Target API or Database Updates**:
  * Table: `public.community_posts` (or `community_answers`), Field: `status = 'under_review'`.

---

### 19. Wallet Balance Sync & Transaction Processing
* **Trigger**: Supabase Webhook — `INSERT` on `public.wallet_transactions`.
* **Conditions/Filters**: Only process when `kind IN ('credit', 'debit', 'refund')`.
* **Node Sequence**:
  1. **Webhook Receiver**: Receive new wallet transaction event.
  2. **Balance Calculator**: Query all user transactions, compute running balance, update `balance_after` on the new row.
  3. **Threshold Check**: If balance drops below 50 SAR, trigger low-balance alert.
  4. **Notification Node**: Insert into `notifications` table: `"رصيد المحفظة منخفض — تبقى {balance} ر.س"`.
  5. **WhatsApp (Evolution API)**: Send low-balance alert to user's phone number.
* **Data Payload**:
  ```json
  {
    "user_id": "uuid",
    "amount": 150,
    "kind": "credit",
    "description": "إيداع في المحفظة",
    "reference_id": "payment_xxx",
    "reference_type": "payment"
  }
  ```
* **Target API or Database Updates**:
  * Table: `public.wallet_transactions`, Field: `balance_after` (computed).
  * Table: `public.notifications` (low-balance alert insertion).

---

### 20. Referral Reward Processing
* **Trigger**: Supabase Webhook — `UPDATE` on `public.referrals` (when `status` changes to `'completed'`).
* **Conditions/Filters**: Only fire when `status = 'completed'` AND `reward_granted = false`.
* **Node Sequence**:
  1. **Webhook Receiver**: Receive referral completion event.
  2. **Referrer Lookup**: Fetch referrer's profile from `profiles` table.
  3. **Reward Credit**: Insert a `wallet_transactions` row for the referrer: `kind = 'credit'`, `amount = 50` (or configurable), `description = 'مكافأة إحالة — {referred_name}'`.
  4. **Referral Update**: Set `reward_granted = true` and `reward_amount = 50` on the referral row.
  5. **Notification Node**: Insert into `notifications`: `"تم إيداع مكافأة إحالة بقيمة 50 ر.س في محفظتك!"`.
  6. **Email (SMTP)**: Send reward confirmation email to referrer.
  7. **WhatsApp (Evolution API)**: Send reward notification to referrer's phone.
* **Data Payload**:
  ```json
  {
    "referral_id": "uuid",
    "referrer_user_id": "uuid",
    "referred_user_id": "uuid",
    "status": "completed",
    "reward_amount": 50
  }
  ```
* **Target API or Database Updates**:
  * Table: `public.wallet_transactions` (credit entry for referrer).
  * Table: `public.referrals`, Fields: `reward_granted = true`, `reward_amount = 50`.
  * Table: `public.notifications` (reward notification).

---

## 🤖 Category 6: AI Legal Tools Workflows (18)

> **Architecture**: Frontend → `POST /api/v1/ai/{tool}` → n8n webhook → LLM → Response
>
> All AI workflows follow the same pattern:
> 1. Next.js API route validates auth + input
> 2. Forwards payload to n8n webhook
> 3. n8n enriches with context (user profile, case data, Saudi law references)
> 4. n8n calls LLM provider (OpenAI/Gemini/Claude)
> 5. n8n returns structured response via `Respond to Webhook`
> 6. Next.js API route returns response to frontend
> 7. n8n logs usage to `ai_usage_log` table (user_id, tool, tokens, cost)

---

### Workflow 6.1: الصائغ القانوني — Legal Document Drafter
* **Webhook URL**: `{{N8N_WEBHOOK_BASE_URL}}/ai/draft`
* **Next.js Route**: `POST /api/v1/ai/draft`
* **Frontend**: `/ai/draft` (Lawyer dashboard)
* **Currently**: `useDraftState.ts` uses `setTimeout(r, 2000)` to simulate AI; fills mock judgment data
* **Node Sequence**:
  ```
  [Webhook Trigger] ➔ [Auth Check] ➔ [Supabase: Get user profile + tier] ➔ [If: Has credits?]
    ➔ [Context Builder: merge case facts + party data + legal branch + memo type]
    ➔ [LLM Node: Generate legal document]
    ➔ [Post-Process: Format Arabic output + add article citations]
    ➔ [Supabase: Log usage to ai_usage_log]
    ➔ [Supabase: Deduct 1 credit from wallet]
    ➔ [Respond to Webhook: Return structured document]
  ```
* **Input Payload**:
  ```json
  {
    "user_id": "uuid",
    "memo_type": "case|reply|appeal|arbitration|notary|report|minutes",
    "memo_sub_type": "تحرير دعوى|لائحة اعتراضية|...",
    "legal_branch": "labor|commercial|civil|criminal|...",
    "client_role": "plaintiff|defendant",
    "case_text": "وقائع القضية...",
    "support_docs": [{"description": "عقد العمل", "file_url": "..."}],
    "lawyer_notes": "ملاحظات المحامي",
    "party_one": {"name": "...", "id_number": "..."},
    "party_two": {"name": "...", "id_number": "..."},
    "judgment_data": {
      "number": "٣٤٢/ع/١٤٤٥",
      "court": "المحكمة العمالية بالرياض",
      "date": "2024-04-12",
      "text": "حكمت المحكمة...",
      "reasons": "عولت المحكمة على..."
    }
  }
  ```
* **Output**: Structured legal document in Arabic with article references
* **Credits Cost**: 1 credit per generation

---

### Workflow 6.2: محترف العقود — Contract Generator
* **Webhook URL**: `{{N8N_WEBHOOK_BASE_URL}}/ai/contracts`
* **Next.js Route**: `POST /api/v1/ai/contracts`
* **Frontend**: `/ai/contracts` (Lawyer dashboard)
* **Currently**: Client-side only, no backend
* **Node Sequence**:
  ```
  [Webhook] ➔ [Auth + Credits Check] ➔ [Context: contract type + terms + parties]
    ➔ [LLM: Draft contract following Saudi commercial law]
    ➔ [Post-Process: Structure clauses + number articles]
    ➔ [Log Usage] ➔ [Deduct Credit] ➔ [Respond]
  ```
* **Input Payload**:
  ```json
  {
    "user_id": "uuid",
    "contract_type": "employment|lease|sale|partnership|service|...",
    "parties": [{"name": "...", "role": "first_party"}],
    "terms": {"duration": "12 months", "value": "50000 SAR", "jurisdiction": "الرياض"},
    "special_clauses": "شرط عدم المنافسة...",
    "language": "ar|en|bilingual"
  }
  ```
* **Credits Cost**: 1 credit

---

### Workflow 6.3: مراجع العقود — Contract Reviewer
* **Webhook URL**: `{{N8N_WEBHOOK_BASE_URL}}/ai/contract-review`
* **Next.js Route**: `POST /api/v1/ai/contract-review`
* **Frontend**: `/ai/contract-reviewer` (Shared)
* **Node Sequence**:
  ```
  [Webhook] ➔ [Auth + Credits] ➔ [Extract text from PDF/DOCX if uploaded]
    ➔ [LLM: Analyze contract → identify risks, missing clauses, non-compliant terms]
    ➔ [Structure: Risk matrix with severity levels]
    ➔ [Log + Deduct] ➔ [Respond: {risks: [], suggestions: [], score: 85}]
  ```
* **Input Payload**:
  ```json
  {
    "user_id": "uuid",
    "contract_text": "نص العقد...",
    "contract_file_url": "https://storage.../contract.pdf",
    "review_focus": "risks|compliance|completeness|all"
  }
  ```
* **Credits Cost**: 1 credit

---

### Workflow 6.4: داعم الاتجاه — Direction & Legal Support
* **Webhook URL**: `{{N8N_WEBHOOK_BASE_URL}}/ai/direction-support`
* **Next.js Route**: `POST /api/v1/ai/direction-support`
* **Frontend**: `/ai/direction-support` (Lawyer dashboard)
* **Node Sequence**:
  ```
  [Webhook] ➔ [Auth + Credits] ➔ [Context: case summary + legal branch]
    ➔ [Vector Search: Query Saudi law articles DB for relevant نظام/مادة]
    ➔ [LLM: Match case facts to supporting legal texts + precedents]
    ➔ [Structure: Cited articles with relevance scores]
    ➔ [Log + Deduct] ➔ [Respond]
  ```
* **Input Payload**:
  ```json
  {
    "user_id": "uuid",
    "case_summary": "ملخص القضية...",
    "legal_branch": "labor|commercial|...",
    "direction": "support_plaintiff|support_defendant|neutral"
  }
  ```
* **Credits Cost**: 1 credit

---

### Workflow 6.5: محاكي الخصم — Wargaming / Opposing Counsel Simulator
* **Webhook URL**: `{{N8N_WEBHOOK_BASE_URL}}/ai/wargaming`
* **Next.js Route**: `POST /api/v1/ai/wargaming`
* **Frontend**: `/ai/wargaming` (Lawyer dashboard)
* **Node Sequence**:
  ```
  [Webhook] ➔ [Auth + Credits] ➔ [Context: case facts + your position]
    ➔ [LLM (Role: Opposing Lawyer): Generate counter-arguments, objections, weaknesses]
    ➔ [LLM (Role: Judge): Evaluate both sides, predict questions]
    ➔ [Structure: {counter_args: [], judge_questions: [], weak_points: []}]
    ➔ [Log + Deduct] ➔ [Respond]
  ```
* **Input Payload**:
  ```json
  {
    "user_id": "uuid",
    "your_position": "plaintiff|defendant",
    "case_facts": "وقائع...",
    "your_arguments": ["الحجة الأولى...", "الحجة الثانية..."],
    "legal_branch": "labor|commercial|..."
  }
  ```
* **Credits Cost**: 2 credits (dual LLM calls)

---

### Workflow 6.6: محلل قوة الموقف — Case Strength Analyzer
* **Webhook URL**: `{{N8N_WEBHOOK_BASE_URL}}/ai/analyze-strength`
* **Next.js Route**: `POST /api/v1/ai/analyze-strength`
* **Frontend**: `/ai/analyze-strength` (Lawyer dashboard)
* **Node Sequence**:
  ```
  [Webhook] ➔ [Auth + Credits] ➔ [Context: case facts + evidence + legal branch]
    ➔ [Vector Search: Similar precedent cases]
    ➔ [LLM: Analyze strength → win probability, risk factors, evidence gaps]
    ➔ [Structure: {score: 72, factors: [], recommendations: []}]
    ➔ [Log + Deduct] ➔ [Respond]
  ```
* **Input Payload**:
  ```json
  {
    "user_id": "uuid",
    "case_facts": "...",
    "evidence_list": ["عقد العمل", "كشف حساب", "شهادة شاهد"],
    "your_position": "plaintiff|defendant",
    "legal_branch": "labor|commercial|..."
  }
  ```
* **Credits Cost**: 1 credit

---

### Workflow 6.7: السكرتير الذكي — Smart Secretary / Daily Briefing
* **Webhook URL**: `{{N8N_WEBHOOK_BASE_URL}}/ai/secretary`
* **Next.js Route**: `POST /api/v1/ai/secretary`
* **Frontend**: `/ai/secretary` (Lawyer dashboard)
* **Node Sequence**:
  ```
  [Webhook] ➔ [Auth] ➔ [Supabase: Fetch today's hearings, deadlines, tasks, cases]
    ➔ [LLM: Summarize into daily briefing with priorities + time allocation]
    ➔ [Structure: {briefing_text, priorities: [], calendar: [], alerts: []}]
    ➔ [Log] ➔ [Respond]
  ```
* **Input Payload**:
  ```json
  {
    "user_id": "uuid",
    "date": "2026-06-17",
    "include": ["hearings", "deadlines", "tasks", "follow_ups"]
  }
  ```
* **Credits Cost**: 0 (included in subscription)

---

### Workflow 6.8: الباحث القانوني — Legal Research Engine
* **Webhook URL**: `{{N8N_WEBHOOK_BASE_URL}}/ai/research`
* **Next.js Route**: `POST /api/v1/ai/research`
* **Frontend**: `/ai/research` (Shared)
* **Node Sequence**:
  ```
  [Webhook] ➔ [Auth + Credits] ➔ [Vector Search: Saudi laws + regulations DB]
    ➔ [LLM: Synthesize findings + cite specific articles (نظام/مادة)]
    ➔ [Structure: {answer, sources: [{law, article, text, relevance}]}]
    ➔ [Log + Deduct] ➔ [Respond]
  ```
* **Input Payload**:
  ```json
  {
    "user_id": "uuid",
    "query": "ما حكم الفصل التعسفي في نظام العمل السعودي؟",
    "scope": "all|labor|commercial|criminal|family|...",
    "max_sources": 10
  }
  ```
* **Credits Cost**: 1 credit
* **Prerequisite**: Saudi laws vector database (embedded articles from أنظمة المملكة)

---

### Workflow 6.9: المستشار القانوني — Quick Legal Answer
* **Webhook URL**: `{{N8N_WEBHOOK_BASE_URL}}/ai/quick-answer`
* **Next.js Route**: `POST /api/v1/ai/quick-answer`
* **Frontend**: `/ai/quick-answer` (Shared)
* **Node Sequence**:
  ```
  [Webhook] ➔ [Auth] ➔ [Content Moderation: Check for inappropriate queries]
    ➔ [LLM: Answer legal question with Saudi law context + disclaimer]
    ➔ [Structure: {answer, disclaimer, related_articles: []}]
    ➔ [Log] ➔ [Respond]
  ```
* **Input Payload**:
  ```json
  {
    "user_id": "uuid",
    "question": "هل يحق لي استرداد العربون؟",
    "context": "optional additional context"
  }
  ```
* **Credits Cost**: 0 (free tier — limited to 5/day for clients)

---

### Workflow 6.10: المترجم القانوني — Legal Translation
* **Webhook URL**: `{{N8N_WEBHOOK_BASE_URL}}/ai/translate`
* **Next.js Route**: `POST /api/v1/ai/translate`
* **Frontend**: `/ai/legal-translate` (Shared)
* **Node Sequence**:
  ```
  [Webhook] ➔ [Auth + Credits] ➔ [Detect language]
    ➔ [LLM: Translate preserving legal terminology and Arabic legal style]
    ➔ [Post-Process: Align paragraphs for bilingual output]
    ➔ [Log + Deduct] ➔ [Respond]
  ```
* **Input Payload**:
  ```json
  {
    "user_id": "uuid",
    "text": "النص المراد ترجمته...",
    "source_lang": "ar|en|auto",
    "target_lang": "ar|en",
    "domain": "legal|commercial|general"
  }
  ```
* **Credits Cost**: 1 credit

---

### Workflow 6.11: ملخص القضية — Case Brief Generator
* **Webhook URL**: `{{N8N_WEBHOOK_BASE_URL}}/ai/case-brief`
* **Next.js Route**: `POST /api/v1/ai/case-brief`
* **Frontend**: `/ai/case-brief` (Shared)
* **Node Sequence**:
  ```
  [Webhook] ➔ [Auth + Credits] ➔ [Extract text if PDF]
    ➔ [LLM: Summarize into structured brief (parties, facts, issues, holdings, reasoning)]
    ➔ [Structure: {parties: [], facts: [], legal_issues: [], holding: "", reasoning: ""}]
    ➔ [Log + Deduct] ➔ [Respond]
  ```
* **Input Payload**:
  ```json
  {
    "user_id": "uuid",
    "case_text": "نص القضية الطويل...",
    "case_file_url": "optional PDF URL",
    "brief_style": "executive|detailed|timeline"
  }
  ```
* **Credits Cost**: 1 credit

---

### Workflow 6.12: حاسبة الأتعاب — Fee Calculator
* **Webhook URL**: `{{N8N_WEBHOOK_BASE_URL}}/ai/fee-calculator`
* **Next.js Route**: `POST /api/v1/ai/fee-calculator`
* **Frontend**: `/ai/fee-calculator` (Shared)
* **Node Sequence**:
  ```
  [Webhook] ➔ [Auth] ➔ [Supabase: Get market rate data if available]
    ➔ [LLM: Estimate fees based on case type, complexity, jurisdiction, duration]
    ➔ [Structure: {estimate_min, estimate_max, factors: [], breakdown: []}]
    ➔ [Log] ➔ [Respond]
  ```
* **Input Payload**:
  ```json
  {
    "user_id": "uuid",
    "case_type": "labor_dispute|real_estate|commercial|...",
    "complexity": "simple|moderate|complex",
    "jurisdiction": "الرياض|جدة|...",
    "estimated_duration_months": 6
  }
  ```
* **Credits Cost**: 0 (free tool)

---

### Workflow 6.13: صياغة الخطابات — Client Letter Drafter
* **Webhook URL**: `{{N8N_WEBHOOK_BASE_URL}}/ai/letter`
* **Next.js Route**: `POST /api/v1/ai/letter`
* **Frontend**: Client `_components/ClientLetterWorkflow.tsx`
* **Currently**: Uses `setTimeout(r, 1400)` then appends `[ملاحظة AI: ...]` to blocks
* **Node Sequence**:
  ```
  [Webhook] ➔ [Auth] ➔ [Context: letter type + recipient + subject]
    ➔ [LLM: Generate formal Arabic letter following Saudi correspondence standards]
    ➔ [Structure: {blocks: [{type: "header", content: "..."}, {type: "body", content: "..."}]}]
    ➔ [Log] ➔ [Respond]
  ```
* **Input Payload**:
  ```json
  {
    "user_id": "uuid",
    "letter_type": "complaint|request|notice|termination|demand",
    "recipient_entity": "شركة...|جهة حكومية...",
    "subject": "موضوع الخطاب",
    "details": "تفاصيل...",
    "tone": "formal|firm|neutral"
  }
  ```
* **Credits Cost**: 0 (included for clients)

---

### Workflow 6.14: تحليل AI للقضية — Case AI Insight
* **Webhook URL**: `{{N8N_WEBHOOK_BASE_URL}}/ai/case-insight`
* **Next.js Route**: `POST /api/v1/ai/case-insight`
* **Frontend**: Client `cases/[id]/page.tsx` (`aiInsight` field)
* **Currently**: Hardcoded Arabic insight string in mock data
* **Node Sequence**:
  ```
  [Webhook] ➔ [Auth] ➔ [Supabase: Fetch full case data + events + documents]
    ➔ [LLM: Analyze case → provide legal insight, expected outcomes, relevant articles]
    ➔ [Supabase: Cache insight in service_requests.metadata.ai_insight]
    ➔ [Respond: {insight: "استناداً لنظام العمل المادة ٧٤..."}]
  ```
* **Input Payload**:
  ```json
  {
    "user_id": "uuid",
    "case_id": "uuid",
    "refresh": false
  }
  ```
* **Credits Cost**: 0 (auto-generated once per case, cached)

---

### Workflow 6.15: المستشار المؤسسي — Corporate Legal Advisor
* **Webhook URL**: `{{N8N_WEBHOOK_BASE_URL}}/ai/corp`
* **Next.js Route**: `POST /api/v1/ai/corp`
* **Frontend**: `/ai/corp` (Business dashboard)
* **Node Sequence**:
  ```
  [Webhook] ➔ [Auth + Credits] ➔ [Context: company type + industry + question]
    ➔ [LLM: Corporate law analysis (نظام الشركات, نظام العمل, لوائح هيئة السوق المالية)]
    ➔ [Structure: {analysis, recommendations: [], applicable_laws: []}]
    ➔ [Log + Deduct] ➔ [Respond]
  ```
* **Credits Cost**: 1 credit

---

### Workflow 6.16: المستشار الحكومي — Government Legal Advisor
* **Webhook URL**: `{{N8N_WEBHOOK_BASE_URL}}/ai/gov`
* **Next.js Route**: `POST /api/v1/ai/gov`
* **Frontend**: `/ai/gov` (Government dashboard)
* **Node Sequence**:
  ```
  [Webhook] ➔ [Auth + Credits] ➔ [Context: government entity type + procedure]
    ➔ [LLM: Government procedures + regulatory compliance analysis]
    ➔ [Structure: {analysis, procedure_steps: [], regulations: []}]
    ➔ [Log + Deduct] ➔ [Respond]
  ```
* **Credits Cost**: 1 credit

---

### Workflow 6.17: مستشار المؤسسات الصغيرة — Micro Business Advisor
* **Webhook URL**: `{{N8N_WEBHOOK_BASE_URL}}/ai/micro`
* **Next.js Route**: `POST /api/v1/ai/micro`
* **Frontend**: `/ai/micro` (Micro dashboard)
* **Node Sequence**:
  ```
  [Webhook] ➔ [Auth] ➔ [Context: business type + legal question]
    ➔ [LLM: Small business legal guidance (licensing, contracts, labor, zakat)]
    ➔ [Structure: {answer, action_items: [], applicable_regulations: []}]
    ➔ [Log] ➔ [Respond]
  ```
* **Credits Cost**: 0 (free for micro businesses — limited 3/day)

---

### Workflow 6.18: مستشار الجمعيات — NGO Legal Advisor
* **Webhook URL**: `{{N8N_WEBHOOK_BASE_URL}}/ai/ngo`
* **Next.js Route**: `POST /api/v1/ai/ngo`
* **Frontend**: `/ai/ngo` (NGO dashboard)
* **Node Sequence**:
  ```
  [Webhook] ➔ [Auth] ➔ [Context: NGO type + compliance question]
    ➔ [LLM: Non-profit compliance (نظام الجمعيات والمؤسسات الأهلية, أوقاف)]
    ➔ [Structure: {answer, compliance_checklist: [], regulations: []}]
    ➔ [Log] ➔ [Respond]
  ```
* **Credits Cost**: 0 (free for NGOs — limited 3/day)

---

## 📊 Complete Workflow Summary

| Category | Count | Status | Dependency |
|----------|-------|--------|------------|
| 🟢 Onboarding | 4 | ⬜ Build first | None |
| 🟡 Request Management | 4 | ⬜ Build first | None |
| 🔵 Billing & Payments | 3 | ⬜ After Phase 3 | Payment gateway |
| 🟣 Communication | 4 | ⬜ Build first | Evolution API |
| 🔴 Admin & Moderation | 5 | ⬜ Build later | None |
| 🤖 AI Legal Tools | 18 | ⬜ Build after core | LLM provider + vector DB |
| **TOTAL** | **38** | | |

### AI Workflows Build Order

| Priority | Workflows | Reason |
|----------|-----------|--------|
| 🔴 P1 | 6.1 (Draft), 6.8 (Research), 6.9 (Quick Answer) | Most-used tools, core value prop |
| 🔴 P1 | 6.13 (Letter), 6.14 (Case Insight) | Client-facing, currently faked with setTimeout |
| 🟡 P2 | 6.2 (Contracts), 6.3 (Contract Review), 6.4 (Direction) | Lawyer premium tools |
| 🟡 P2 | 6.5 (Wargaming), 6.6 (Strength), 6.7 (Secretary) | Lawyer advanced tools |
| 🟢 P3 | 6.10 (Translate), 6.11 (Case Brief), 6.12 (Fee Calc) | Shared utility tools |
| 🟢 P3 | 6.15–6.18 (Corp/Gov/Micro/NGO) | Sector-specific, after dashboards wired |

### Prerequisites for AI Workflows

1. **LLM Provider Account** — OpenAI / Google Gemini / Anthropic (API key stored in n8n)
2. **Saudi Laws Vector Database** — Embedded articles from أنظمة المملكة for research + direction-support
3. **`ai_usage_log` table** — Track per-user AI usage (already exists in migration 005)
4. **Credit/Wallet System** — Deduct credits per AI call (depends on Phase 3 payments)
