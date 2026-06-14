# ⚡ Nzamy — n8n Automation Workflows (Phase 4)

> **Purpose**: All 18 n8n workflows + 9 email templates + WhatsApp integration.
> Each workflow is described as a simple flow, then broken into implementation checkboxes.
> We will build these **one by one** in order of priority.

---

## 🔧 Prerequisites

- [ ] n8n instance running and accessible (self-hosted ✅)
- [ ] Set `N8N_WEBHOOK_URL` in `.env.local`
- [ ] Set `N8N_API_KEY` in `.env.local`
- [ ] Create `/api/v1/n8n/trigger` — generic webhook endpoint to receive n8n callbacks
- [ ] Connect n8n to Supabase (Postgres node or HTTP node with service role key)
- [ ] Evolution API running and accessible (self-hosted ✅)
- [ ] Set `EVOLUTION_API_URL` and `EVOLUTION_API_KEY` in `.env.local`

---

## 📧 Email Templates (Build First)

> These are reused across multiple workflows. Build them before the workflows.

- [ ] **Template 1: `welcome`** — مرحباً بك في نظامي
  - Arabic greeting, account summary, next steps link
- [ ] **Template 2: `verify-email`** — تأكيد البريد الإلكتروني
  - Verification link, 24h expiry notice
- [ ] **Template 3: `password-reset`** — إعادة تعيين كلمة المرور
  - Reset link, 1h expiry, security notice
- [ ] **Template 4: `request-received`** — تم استلام طلبك
  - Request ID, type, estimated response time
- [ ] **Template 5: `request-assigned`** — تم تعيين محامي لقضيتك
  - Lawyer name, specialization, contact info
- [ ] **Template 6: `payment-receipt`** — إيصال الدفع
  - Amount, method, invoice number, PDF link
- [ ] **Template 7: `subscription-expiring`** — اشتراكك على وشك الانتهاء
  - Current plan, expiry date, renewal link
- [ ] **Template 8: `credit-low`** — رصيد الاعتمادات منخفض
  - Current balance, top-up link
- [ ] **Template 9: `review-request`** — شاركنا تجربتك
  - Star rating link, lawyer/provider name

---

## 🟢 Category 1: Onboarding Workflows (4)

### Workflow 1.1: Welcome Email
```
📥 TRIGGER: New row in `profiles` table
    ↓
🔍 STEP 1: Fetch user data (name, email, user_type)
    ↓
📧 STEP 2: Send "welcome" email template
    ↓
📱 STEP 3: Send WhatsApp welcome message (Evolution API)
    ↓
✅ DONE: Log in `audit_log` table
```

**Implementation:**
- [ ] Create Supabase database webhook on `profiles` → INSERT
- [ ] Create n8n workflow: receive webhook → Supabase node (fetch user) → Email node → Evolution API node
- [ ] Test: register new user → verify email + WhatsApp received
- [ ] Handle edge case: user has no phone → skip WhatsApp step

---

### Workflow 1.2: Lawyer Verification
```
📥 TRIGGER: New row in `lawyer_profiles` table
    ↓
🔍 STEP 1: Fetch lawyer data (name, license_number, bar_association)
    ↓
📧 STEP 2: Send email to admin with verification details
    ↓
⏳ STEP 3: Wait for admin approval (webhook callback)
    ↓
📧 STEP 4: Send approval/rejection email to lawyer
    ↓
🔄 STEP 5: Update `lawyer_profiles.is_verified` = true/false
    ↓
✅ DONE: Log in `audit_log`
```

**Implementation:**
- [ ] Create Supabase webhook on `lawyer_profiles` → INSERT
- [ ] Create n8n workflow with admin approval wait step
- [ ] Create admin approval UI (or simple email link with approve/reject)
- [ ] Test: register lawyer → admin gets email → approve → lawyer gets confirmation

---

### Workflow 1.3: Firm Onboarding
```
📥 TRIGGER: New row in `firm_profiles` table
    ↓
🔍 STEP 1: Fetch firm data (name, CR number, contact person)
    ↓
📧 STEP 2: Send welcome email to firm admin
    ↓
📋 STEP 3: Create default firm settings in `user_settings`
    ↓
📧 STEP 4: Send email to platform admin for review
    ↓
✅ DONE: Log in `audit_log`
```

**Implementation:**
- [ ] Create Supabase webhook on `firm_profiles` → INSERT
- [ ] Create n8n workflow
- [ ] Test: register firm → firm admin gets welcome → platform admin notified

---

### Workflow 1.4: Provider Verification
```
📥 TRIGGER: New row in `provider_profiles` table
    ↓
🔍 STEP 1: Fetch provider data (type: notary/arbitrator/bailiff, license)
    ↓
📧 STEP 2: Send verification email to admin
    ↓
⏳ STEP 3: Wait for admin verification
    ↓
📧 STEP 4: Notify provider of approval/rejection
    ↓
🔄 STEP 5: Update `provider_profiles.is_verified`
    ↓
✅ DONE: Log in `audit_log`
```

**Implementation:**
- [ ] Create Supabase webhook on `provider_profiles` → INSERT
- [ ] Create n8n workflow (similar to lawyer verification)
- [ ] Test: register provider → admin verifies → provider notified

---

## 🔵 Category 2: Service Request Workflows (4)

### Workflow 2.1: New Request Notification
```
📥 TRIGGER: New row in `service_requests` table
    ↓
🔍 STEP 1: Fetch request details + client info
    ↓
🔍 STEP 2: Find matching lawyers/providers (by specialization, city)
    ↓
📧 STEP 3: Send notification email to matching lawyers
    ↓
📱 STEP 4: Send WhatsApp notification to matching lawyers
    ↓
🔔 STEP 5: Create `notifications` row for each lawyer
    ↓
✅ DONE: Log in `audit_log`
```

**Implementation:**
- [ ] Create Supabase webhook on `service_requests` → INSERT
- [ ] Create n8n workflow with lawyer matching logic
- [ ] Test: client creates request → lawyers get email + WhatsApp + in-app notification

---

### Workflow 2.2: Request Assigned
```
📥 TRIGGER: `service_requests.status` changed to 'assigned'
    ↓
🔍 STEP 1: Fetch request + assigned lawyer details
    ↓
📧 STEP 2: Send "request-assigned" email to client
    ↓
📱 STEP 3: Send WhatsApp to client with lawyer info
    ↓
🔔 STEP 4: Create `notifications` row for client
    ↓
✅ DONE
```

**Implementation:**
- [ ] Create Supabase webhook on `service_requests` → UPDATE (filter: status = 'assigned')
- [ ] Create n8n workflow
- [ ] Test: assign lawyer to request → client gets notified

---

### Workflow 2.3: Request Completed
```
📥 TRIGGER: `service_requests.status` changed to 'completed'
    ↓
🔍 STEP 1: Fetch request details + client info
    ↓
📧 STEP 2: Send completion email to client
    ↓
📧 STEP 3: Send "review-request" email to client (after 24h delay)
    ↓
🔔 STEP 4: Create `notifications` row for client
    ↓
✅ DONE
```

**Implementation:**
- [ ] Create Supabase webhook on `service_requests` → UPDATE (filter: status = 'completed')
- [ ] Create n8n workflow with 24h delay for review request
- [ ] Test: complete request → client gets completion email → 24h later gets review email

---

### Workflow 2.4: Request Escalation (48h SLA)
```
📥 TRIGGER: Cron job every 1 hour
    ↓
🔍 STEP 1: Query `service_requests` WHERE status = 'pending' AND created_at < NOW() - 48h
    ↓
🔍 STEP 2: For each overdue request, fetch client + admin info
    ↓
📧 STEP 3: Send escalation email to admin
    ↓
📱 STEP 4: Send WhatsApp alert to admin
    ↓
🔔 STEP 5: Create `notifications` row for admin
    ↓
🔄 STEP 6: Update request `priority` to 'urgent'
    ↓
✅ DONE
```

**Implementation:**
- [ ] Create n8n cron workflow (runs every hour)
- [ ] Create Supabase query for overdue requests
- [ ] Test: create request → wait 48h (or change timestamp manually) → admin gets escalation

---

## 🟡 Category 3: Billing Workflows (4)

> ⚠️ Payment gateway not decided yet. These workflows will be completed when the provider is chosen.

### Workflow 3.1: Payment Success
```
📥 TRIGGER: New row in `payments` table with status = 'completed'
    ↓
🔍 STEP 1: Fetch payment + user details
    ↓
📧 STEP 2: Send "payment-receipt" email with PDF invoice
    ↓
📱 STEP 3: Send WhatsApp receipt
    ↓
✅ DONE
```

**Implementation:**
- [ ] Create Supabase webhook on `payments` → INSERT (filter: status = 'completed')
- [ ] Create n8n workflow with PDF invoice generation
- [ ] Test: create payment → user gets receipt email + WhatsApp

---

### Workflow 3.2: Subscription Renewal Reminder
```
📥 TRIGGER: Cron job daily at 9:00 AM
    ↓
🔍 STEP 1: Query `subscriptions` WHERE end_date BETWEEN NOW() AND NOW() + 3 days
    ↓
📧 STEP 2: Send "subscription-expiring" email to each user
    ↓
📱 STEP 3: Send WhatsApp reminder
    ↓
✅ DONE
```

**Implementation:**
- [ ] Create n8n cron workflow (daily 9 AM)
- [ ] Create Supabase query for expiring subscriptions
- [ ] Test: set subscription to expire in 2 days → user gets reminder

---

### Workflow 3.3: Credit Expiry Warning
```
📥 TRIGGER: Cron job daily at 9:00 AM
    ↓
🔍 STEP 1: Query `credit_transactions` WHERE expires_at BETWEEN NOW() AND NOW() + 7 days
    ↓
🔍 STEP 2: Group by user, calculate expiring amount
    ↓
📧 STEP 3: Send "credit-low" email to each user
    ↓
✅ DONE
```

**Implementation:**
- [ ] Create n8n cron workflow (daily 9 AM)
- [ ] Create Supabase query for expiring credits
- [ ] Test: set credits to expire in 3 days → user gets warning

---

### Workflow 3.4: Invoice Generation
```
📥 TRIGGER: New row in `payments` table
    ↓
🔍 STEP 1: Fetch payment + user + service details
    ↓
📄 STEP 2: Generate PDF invoice (n8n HTML-to-PDF or external service)
    ↓
📁 STEP 3: Upload PDF to Supabase Storage
    ↓
🔄 STEP 4: Update `payments.invoice_url` with PDF link
    ↓
✅ DONE
```

**Implementation:**
- [ ] Create Supabase webhook on `payments` → INSERT
- [ ] Create n8n workflow with PDF generation
- [ ] Set up Supabase Storage bucket for invoices
- [ ] Test: create payment → PDF generated → link saved in payments table

---

## 🟣 Category 4: Communication Workflows (3)

### Workflow 4.1: WhatsApp Service Triage
```
📥 TRIGGER: Evolution API webhook (incoming WhatsApp message)
    ↓
🔍 STEP 1: Parse message text
    ↓
🤖 STEP 2: AI intent classification (via n8n AI node)
       → "consultation" / "request" / "inquiry" / "complaint"
    ↓
🔄 STEP 3: Based on intent:
       → consultation: Create row in `consultations` table
       → request: Create row in `service_requests` table
       → inquiry: Reply with FAQ answer
       → complaint: Create row in `service_requests` with type='complaint'
    ↓
📱 STEP 4: Send WhatsApp confirmation reply
    ↓
✅ DONE
```

**Implementation:**
- [ ] Create `/api/v1/whatsapp/webhook` — POST endpoint for Evolution API
- [ ] Configure Evolution API to send webhooks to n8n
- [ ] Create n8n workflow with AI intent classification
- [ ] Map intents to Supabase table inserts
- [ ] Test: send WhatsApp message → n8n processes → service request created → confirmation reply

---

### Workflow 4.2: Consultation Reminder
```
📥 TRIGGER: Cron job every 30 minutes
    ↓
🔍 STEP 1: Query `consultations` WHERE scheduled_at BETWEEN NOW() AND NOW() + 24h
       AND reminder_sent = false
    ↓
📧 STEP 2: Send reminder email to client + lawyer
    ↓
📱 STEP 3: Send WhatsApp reminder to both parties
    ↓
🔄 STEP 4: Update `consultations.reminder_sent` = true
    ↓
--- 1 hour before ---
🔍 STEP 5: Query `consultations` WHERE scheduled_at BETWEEN NOW() AND NOW() + 1h
       AND reminder_1h_sent = false
    ↓
📱 STEP 6: Send urgent WhatsApp reminder
    ↓
✅ DONE
```

**Implementation:**
- [ ] Create n8n cron workflow (every 30 minutes)
- [ ] Add `reminder_sent` and `reminder_1h_sent` columns to `consultations` table (or use `request_events`)
- [ ] Test: schedule consultation → get 24h reminder → get 1h reminder

---

### Workflow 4.3: Hearing Reminder
```
📥 TRIGGER: Cron job every 30 minutes
    ↓
🔍 STEP 1: Query `cases` WHERE next_hearing_date BETWEEN NOW() AND NOW() + 24h
    ↓
📧 STEP 2: Send reminder email to lawyer
    ↓
📱 STEP 3: Send WhatsApp reminder to lawyer + client
    ↓
✅ DONE
```

**Implementation:**
- [ ] Create n8n cron workflow (every 30 minutes)
- [ ] Query cases with upcoming hearings
- [ ] Test: set hearing date to tomorrow → lawyer + client get reminders

---

## 🔴 Category 5: Admin Workflows (3)

### Workflow 5.1: Daily Admin Digest
```
📥 TRIGGER: Cron job daily at 8:00 AM
    ↓
🔍 STEP 1: Count yesterday's metrics:
       → New users (from `profiles`)
       → New requests (from `service_requests`)
       → Completed requests
       → Total revenue (from `payments`)
       → Pending verifications (lawyers + providers)
    ↓
📧 STEP 2: Send digest email to admin
    ↓
📱 STEP 3: Send WhatsApp summary to admin
    ↓
✅ DONE
```

**Implementation:**
- [ ] Create n8n cron workflow (daily 8 AM)
- [ ] Create aggregate Supabase queries for each metric
- [ ] Design digest email template (Arabic, with charts/numbers)
- [ ] Test: run manually → admin gets digest with yesterday's stats

---

### Workflow 5.2: Security Alert (Failed Logins)
```
📥 TRIGGER: Supabase Auth webhook (login failure)
    ↓
🔍 STEP 1: Count failed attempts from same IP in last 30 minutes
    ↓
⚠️ STEP 2: If count >= 5:
       → Send alert email to admin
       → Send WhatsApp alert to admin
       → Log in `audit_log` with severity='high'
    ↓
🔒 STEP 3: (Optional) Block IP temporarily via Supabase Edge Function
    ↓
✅ DONE
```

**Implementation:**
- [ ] Configure Supabase Auth webhook for failed login events
- [ ] Create n8n workflow with IP counting logic
- [ ] Test: attempt 5+ failed logins → admin gets security alert

---

### Workflow 5.3: Content Moderation (AI)
```
📥 TRIGGER: New row in `community_posts` or `community_answers`
    ↓
🤖 STEP 1: Send content to AI moderation (via n8n AI node)
       → Check for: spam, offensive language, legal advice risks
    ↓
⚠️ STEP 2: If flagged:
       → Update post `status` to 'under_review'
       → Send alert email to admin
       → Create `notifications` row for admin
    ↓
✅ STEP 3: If clean: no action needed
    ↓
✅ DONE
```

**Implementation:**
- [ ] Create Supabase webhook on `community_posts` + `community_answers` → INSERT
- [ ] Create n8n workflow with AI moderation (OpenAI or local model)
- [ ] Add `status` column to `community_posts` if not exists
- [ ] Test: post offensive content → gets flagged → admin notified

---

## 📊 Implementation Order (Recommended)

> Build in this order — highest impact first.

| Priority | Workflow | Why First |
|----------|----------|-----------|
| 🥇 1 | **2.1 New Request Notification** | Core business flow — clients need to know lawyers are notified |
| 🥇 2 | **1.1 Welcome Email** | First impression for new users |
| 🥇 3 | **4.1 WhatsApp Triage** | Key differentiator — WhatsApp-first service |
| 🥈 4 | **2.2 Request Assigned** | Client needs confirmation when lawyer takes their case |
| 🥈 5 | **1.2 Lawyer Verification** | Quality control — lawyers must be verified |
| 🥈 6 | **4.2 Consultation Reminder** | Reduce no-shows |
| 🥈 7 | **2.3 Request Completed** | Close the loop + trigger reviews |
| 🥉 8 | **5.1 Daily Admin Digest** | Operational visibility |
| 🥉 9 | **1.4 Provider Verification** | Quality control for notaries/arbitrators |
| 🥉 10 | **2.4 Request Escalation** | SLA enforcement |
| 🥉 11 | **4.3 Hearing Reminder** | Important for active cases |
| 🥉 12 | **1.3 Firm Onboarding** | B2B onboarding flow |
| 🔘 13 | **5.3 Content Moderation** | Community safety |
| 🔘 14 | **5.2 Security Alert** | Security monitoring |
| ⏸️ 15 | **3.1 Payment Success** | Waiting for payment gateway |
| ⏸️ 16 | **3.2 Subscription Renewal** | Waiting for payment gateway |
| ⏸️ 17 | **3.3 Credit Expiry Warning** | Waiting for payment gateway |
| ⏸️ 18 | **3.4 Invoice Generation** | Waiting for payment gateway |

---

## 📊 Progress Tracker

| # | Category | Workflow | Status |
|---|----------|----------|--------|
| 1.1 | Onboarding | Welcome Email | ⬜ |
| 1.2 | Onboarding | Lawyer Verification | ⬜ |
| 1.3 | Onboarding | Firm Onboarding | ⬜ |
| 1.4 | Onboarding | Provider Verification | ⬜ |
| 2.1 | Requests | New Request Notification | ⬜ |
| 2.2 | Requests | Request Assigned | ⬜ |
| 2.3 | Requests | Request Completed | ⬜ |
| 2.4 | Requests | Request Escalation (48h SLA) | ⬜ |
| 3.1 | Billing | Payment Success | ⏸️ (waiting for gateway) |
| 3.2 | Billing | Subscription Renewal | ⏸️ (waiting for gateway) |
| 3.3 | Billing | Credit Expiry Warning | ⏸️ (waiting for gateway) |
| 3.4 | Billing | Invoice Generation | ⏸️ (waiting for gateway) |
| 4.1 | Communication | WhatsApp Triage | ⬜ |
| 4.2 | Communication | Consultation Reminder | ⬜ |
| 4.3 | Communication | Hearing Reminder | ⬜ |
| 5.1 | Admin | Daily Admin Digest | ⬜ |
| 5.2 | Admin | Security Alert | ⬜ |
| 5.3 | Admin | Content Moderation (AI) | ⬜ |
| — | Templates | 9 Email Templates | ⬜ |
| — | Infra | n8n ↔ Supabase Connection | ⬜ |
| — | Infra | Evolution API Webhook | ⬜ |
