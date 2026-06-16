# Nzamy Automation: Comprehensive n8n Workflows Specification

This document provides a highly technical, production-grade specification for all 18 automation workflows in the Nzamy ecosystem. It is divided into onboarding, request, billing, communication, and admin management categories.

---

## 🛠️ Global Integrations & Endpoints

### 1. Webhook Handlers
* **Nzamy API Callback**: `POST /api/v1/n8n/trigger` (generic endpoint on the Next.js backend to receive secure callbacks from n8n using an authorization header).
* **Evolution API Webhook**: `POST /api/v1/whatsapp/webhook` (endpoint configured to receive WhatsApp message payloads).

### 2. Common Node Integrations
* **Supabase Node (Postgres)**: Directly updates and reads tables using PostgreSQL or postgrest.
* **Email Node (Resend)**: Sends HTML emails via Resend API using standard handlebars templating.
* **Evolution API (WhatsApp)**: Sends instant WhatsApp text and media templates.
  * *Send Text API*: `POST {{EVOLUTION_API_URL}}/message/sendText/{{INSTANCE_NAME}}`
  * *Headers*: `apikey: {{EVOLUTION_API_KEY}}`

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
