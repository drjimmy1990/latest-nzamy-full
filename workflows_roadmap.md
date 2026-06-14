# ⚡ Nzamy — Workflows Roadmap

> **Last Updated**: 2026-06-05
> **Purpose**: Two lists — (1) what we build NOW to finish العميل والمحامي flows, (2) everything else for later.
> **Dashboard Status**: ✅ Both Client (10 pages) and Lawyer (17 pages) dashboards are production-ready.

---

## 🔑 What Needs to Happen Before ANY Workflow

- [ ] n8n connected to Supabase (Postgres node or HTTP + service role key)
- [ ] Set `N8N_WEBHOOK_URL` in `.env.local`
- [ ] Set `N8N_API_KEY` in `.env.local`
- [ ] Create `/api/v1/n8n/trigger` — generic webhook endpoint
- [ ] Evolution API webhook configured → n8n receives WhatsApp messages
- [ ] Create at least 2 email templates first: `welcome` + `request-received`

---

---

# 🔥 SECTION A — BUILD NOW (Client & Lawyer Ready)

> These 7 workflows complete the العميل والمحامي flow end-to-end.
> ✅ **PREREQUISITE MET**: Both client dashboard (10 pages) and lawyer dashboard (17 pages) are migrated to real services.
> After building these, a real client can register → create request → lawyer gets notified → lawyer accepts → client gets confirmation → consultation happens → both get reminders.

---

## A1. Welcome Email + WhatsApp ← (First Impression)

```
📥 TRIGGER: New row in `profiles` table (INSERT)
    ↓
🔍 STEP 1: Fetch user data (name, email, phone, user_type)
    ↓
📧 STEP 2: Send "welcome" email
    ↓
📱 STEP 3: Send WhatsApp welcome (Evolution API)
    ↓  (skip if no phone)
✅ DONE: Log in `audit_log`
```

**What it solves**: Every new user gets a welcome message immediately.

- [ ] Build `welcome` email template (Arabic)
- [ ] Create Supabase DB webhook on `profiles` → INSERT
- [ ] Create n8n workflow: webhook → fetch user → email → WhatsApp
- [ ] Handle: no phone → skip WhatsApp step
- [ ] Test: register new client → gets email + WhatsApp

---

## A2. New Service Request → Notify Lawyers ← (Core Business)

```
📥 TRIGGER: New row in `service_requests` table (INSERT)
    ↓
🔍 STEP 1: Fetch request details + client info
    ↓
🔍 STEP 2: Find matching lawyers (by specialty, city, availability)
    ↓
📧 STEP 3: Email matching lawyers "طلب خدمة جديد"
    ↓
📱 STEP 4: WhatsApp matching lawyers
    ↓
🔔 STEP 5: Create `notifications` row for each lawyer
    ↓
📧 STEP 6: Send "request-received" confirmation to client
    ↓
✅ DONE
```

**What it solves**: Client creates request → lawyers know about it → client gets confirmation.

- [ ] Build `request-received` email template (Arabic)
- [ ] Create Supabase webhook on `service_requests` → INSERT
- [ ] Create n8n workflow with lawyer matching query
- [ ] Insert `notifications` rows for matched lawyers
- [ ] Send confirmation email to client
- [ ] Test: client creates request → lawyers get email + WhatsApp + bell notification → client gets confirmation

---

## A3. Request Assigned → Notify Client ← (Client Sees Progress)

```
📥 TRIGGER: `service_requests.status` changes to 'assigned'
    ↓
🔍 STEP 1: Fetch request + assigned lawyer profile
    ↓
📧 STEP 2: Send "request-assigned" email to client (with lawyer name + specialty)
    ↓
📱 STEP 3: WhatsApp client "تم تعيين محامي لقضيتك"
    ↓
🔔 STEP 4: Create `notifications` row for client
    ↓
✅ DONE
```

**What it solves**: Client knows a lawyer accepted their case.

- [ ] Build `request-assigned` email template (Arabic)
- [ ] Create Supabase webhook on `service_requests` → UPDATE (filter: `status = 'assigned'`)
- [ ] Create n8n workflow
- [ ] Test: assign lawyer → client gets notification

---

## A4. Request Completed → Close Loop + Ask Review ← (Quality)

```
📥 TRIGGER: `service_requests.status` changes to 'completed'
    ↓
🔍 STEP 1: Fetch request + client + lawyer info
    ↓
📧 STEP 2: Send completion email to client "تم إنجاز طلبك"
    ↓
🔔 STEP 3: Create `notifications` row for client
    ↓
⏳ STEP 4: Wait 24 hours
    ↓
📧 STEP 5: Send "review-request" email "شاركنا تجربتك"
    ↓
✅ DONE
```

**What it solves**: Client knows it's done + gets asked for review.

- [ ] Build `review-request` email template (Arabic)
- [ ] Create Supabase webhook on `service_requests` → UPDATE (filter: `status = 'completed'`)
- [ ] Create n8n workflow with 24h delay node
- [ ] Test: complete request → client gets email → 24h later gets review email

---

## A5. Lawyer Verification ← (Quality Control)

```
📥 TRIGGER: New row in `lawyer_profiles` table (INSERT)
    ↓
🔍 STEP 1: Fetch lawyer data (name, license, bar_association)
    ↓
📧 STEP 2: Email admin "محامي جديد ينتظر التحقق"
    ↓
⏳ STEP 3: Wait for admin approval (webhook callback / manual)
    ↓
🔄 STEP 4: Update `lawyer_profiles.is_verified = true`
    ↓
📧 STEP 5: Send approval email to lawyer "تم تفعيل حسابك"
    ↓
✅ DONE
```

**What it solves**: Only verified lawyers appear in search results.

- [ ] Create Supabase webhook on `lawyer_profiles` → INSERT
- [ ] Create n8n workflow with admin notification
- [ ] Build admin approval mechanism (email link or simple form)
- [ ] Test: register lawyer → admin gets email → approves → lawyer gets confirmation → appears in `/find-lawyer`

---

## A6. Consultation Reminder ← (Reduce No-Shows)

```
📥 TRIGGER: Cron every 30 minutes
    ↓
🔍 STEP 1: Query `consultations` WHERE scheduled_at is in next 24h AND reminder_sent = false
    ↓
📧 STEP 2: Email client + lawyer "تذكير: لديك استشارة غداً"
    ↓
📱 STEP 3: WhatsApp both parties
    ↓
🔄 STEP 4: Set `reminder_sent = true`
    ↓
--- 1 hour before ---
🔍 STEP 5: Query WHERE scheduled_at in next 1h AND reminder_1h_sent = false
    ↓
📱 STEP 6: Urgent WhatsApp "استشارتك بعد ساعة"
    ↓
✅ DONE
```

**What it solves**: Both client and lawyer get reminded — 24h and 1h before.

- [ ] Add `reminder_sent` + `reminder_1h_sent` columns to `consultations` (or use `request_events`)
- [ ] Create n8n cron workflow (every 30 min)
- [ ] Test: schedule consultation for tomorrow → get 24h reminder → get 1h reminder

---

## A7. WhatsApp Service Triage ← (Key Differentiator)

```
📥 TRIGGER: Evolution API webhook (incoming WhatsApp message)
    ↓
🔍 STEP 1: Check if sender has an account (match phone in `profiles`)
    ↓
🤖 STEP 2: AI intent classification (n8n AI node)
       → "consultation" / "request" / "inquiry" / "complaint"
    ↓
🔄 STEP 3: Based on intent:
       → consultation → INSERT into `consultations`
       → request → INSERT into `service_requests`
       → inquiry → Reply with FAQ answer
       → complaint → INSERT into `service_requests` (type='complaint')
    ↓
📱 STEP 4: Send WhatsApp confirmation reply
    ↓
✅ DONE
```

**What it solves**: Clients can create requests via WhatsApp — no app needed.

- [ ] Create `/api/v1/whatsapp/webhook` — POST endpoint
- [ ] Configure Evolution API → send webhooks to n8n
- [ ] Create n8n workflow with AI intent classification
- [ ] Map intents to Supabase inserts
- [ ] Test: send WhatsApp → n8n processes → request created → confirmation reply

---

## ✅ Section A — Summary

| # | Workflow | What It Enables | Estimated |
|---|----------|-----------------|-----------|
| A1 | Welcome Email + WhatsApp | First impression | 1-2h |
| A2 | New Request → Notify Lawyers | Core business flow | 3-4h |
| A3 | Request Assigned → Notify Client | Client trust | 1-2h |
| A4 | Request Completed + Review | Quality feedback loop | 2-3h |
| A5 | Lawyer Verification | Quality control | 2-3h |
| A6 | Consultation Reminder | Reduce no-shows | 2-3h |
| A7 | WhatsApp Triage | WhatsApp-first service | 4-5h |
| **Email Templates** | `welcome`, `request-received`, `request-assigned`, `review-request` | 4 of 9 templates | 2-3h |
| **Total** | **7 workflows + 4 templates** | **Client↔Lawyer flow complete** | **~18-25h** |

### After Section A is done, the client↔lawyer flow works like this:

```
👤 Client registers
    → A1: Gets welcome email + WhatsApp ✅
    → Fills profile, browses lawyers
    → Creates service request
    → A2: Lawyers get notified ✅ + Client gets confirmation ✅
    → Lawyer accepts
    → A3: Client gets "lawyer assigned" notification ✅
    → Consultation scheduled
    → A6: Both get 24h + 1h reminders ✅
    → Consultation happens
    → Lawyer marks completed
    → A4: Client gets completion + review request ✅
```

**OR via WhatsApp:**
```
📱 Client sends WhatsApp message
    → A7: AI classifies intent → creates request ✅
    → A2: Lawyers get notified ✅
    → ... same flow continues
```

---

---

# ⏳ SECTION B — BUILD LATER (All Other Workflows)

> These 11 workflows are important but NOT blocking the client↔lawyer launch.
> Some depend on Phase 3 (payments) which is still waiting.

---

## B1. Request Escalation — 48h SLA

```
📥 TRIGGER: Cron every 1 hour
    ↓
🔍 Query: service_requests WHERE status='pending' AND created_at < NOW()-48h
    ↓
📧 Email admin "طلبات متأخرة تحتاج تدخل"
    ↓
📱 WhatsApp admin
    ↓
🔄 Update request priority → 'urgent'
    ↓
✅ DONE
```

- [ ] Create n8n cron workflow (hourly)
- [ ] Test: old pending request → admin gets escalation

---

## B2. Hearing Reminder

```
📥 TRIGGER: Cron every 30 minutes
    ↓
🔍 Query: cases WHERE next_hearing_date in next 24h
    ↓
📧 + 📱 Remind lawyer + client
    ↓
✅ DONE
```

- [ ] Create n8n cron workflow
- [ ] Test: upcoming hearing → both parties reminded

---

## B3. Firm Onboarding

```
📥 TRIGGER: New row in `firm_profiles`
    ↓
📧 Welcome email to firm admin
    ↓
📋 Create default firm settings
    ↓
📧 Notify platform admin
    ↓
✅ DONE
```

- [ ] Create Supabase webhook + n8n workflow
- [ ] Test: register firm → admin notified

---

## B4. Provider Verification

```
📥 TRIGGER: New row in `provider_profiles`
    ↓
📧 Notify admin → wait for approval → notify provider
    ↓
🔄 Update is_verified
    ↓
✅ DONE
```

- [ ] Create workflow (same pattern as Lawyer Verification)
- [ ] Test: register notary → admin verifies → provider approved

---

## B5. Daily Admin Digest

```
📥 TRIGGER: Cron daily at 8:00 AM
    ↓
🔍 Count: new users, new requests, completed, revenue, pending verifications
    ↓
📧 + 📱 Send digest to admin
    ↓
✅ DONE
```

- [ ] Create cron workflow + aggregate queries
- [ ] Test: run manually → admin gets summary

---

## B6. Content Moderation (AI)

```
📥 TRIGGER: New `community_posts` or `community_answers`
    ↓
🤖 AI check: spam, offensive, legal advice risks
    ↓
⚠️ If flagged → status='under_review' + notify admin
    ↓
✅ DONE
```

- [ ] Create webhook + AI moderation workflow
- [ ] Test: post offensive content → flagged

---

## B7. Security Alert (Failed Logins)

```
📥 TRIGGER: Supabase Auth webhook (login failure)
    ↓
🔍 Count failures from same IP in 30 min
    ↓
⚠️ If ≥5 → email + WhatsApp admin + log audit
    ↓
✅ DONE
```

- [ ] Create Auth webhook + n8n workflow
- [ ] Test: 5+ failed logins → admin alerted

---

## B8. Payment Success ⏸️ (Waiting for Payment Gateway)

```
📥 TRIGGER: New `payments` row (status='completed')
    ↓
📧 Send receipt + 📄 PDF invoice
    ↓
✅ DONE
```

- [ ] Waiting for payment gateway decision
- [ ] Build `payment-receipt` email template
- [ ] Create Supabase webhook + n8n workflow

---

## B9. Subscription Renewal Reminder ⏸️

```
📥 TRIGGER: Cron daily 9 AM
    ↓
🔍 Query: subscriptions expiring in 3 days
    ↓
📧 + 📱 Send reminder
    ↓
✅ DONE
```

- [ ] Waiting for subscription system (Phase 3)
- [ ] Build `subscription-expiring` email template

---

## B10. Credit Expiry Warning ⏸️

```
📥 TRIGGER: Cron daily 9 AM
    ↓
🔍 Query: credits expiring in 7 days
    ↓
📧 Send warning
    ↓
✅ DONE
```

- [ ] Waiting for credit system (Phase 3)
- [ ] Build `credit-low` email template

---

## B11. Invoice Generation ⏸️

```
📥 TRIGGER: New `payments` row
    ↓
📄 Generate PDF → upload to Supabase Storage
    ↓
🔄 Update payments.invoice_url
    ↓
✅ DONE
```

- [ ] Waiting for payment gateway (Phase 3)
- [ ] Set up Supabase Storage bucket for invoices

---

## 📧 Remaining Email Templates (5 of 9)

> 4 templates built with Section A. These 5 come later:

| # | Template | When Needed |
|---|----------|-------------|
| 1 | `verify-email` | Always (but Supabase handles it natively) |
| 2 | `password-reset` | Always (Supabase handles it natively) |
| 3 | `payment-receipt` | Phase 3 (Payment Gateway) |
| 4 | `subscription-expiring` | Phase 3 (Subscriptions) |
| 5 | `credit-low` | Phase 3 (Credits) |

---

---

# 📊 Master Progress

| Section | Workflows | Status | Blocking? |
|---------|-----------|--------|-----------|
| **A — NOW** | 7 workflows + 4 templates | ⬜ Not started | YES — needed for launch (dashboards ✅ ready) |
| **B — LATER** | 4 operational (B1-B4) | ⬜ Not started | No |
| **B — LATER** | 3 admin (B5-B7) | ⬜ Not started | No |
| **B — LATER** | 4 billing (B8-B11) | ⏸️ Waiting for Phase 3 | No |
| **Email** | 5 remaining templates | ⬜ Not started | Partially (Phase 3) |

### Grand Total: 18 workflows + 9 email templates

| Category | Count | Ready to Build? |
|----------|-------|-----------------|
| 🔥 Section A (NOW) | 7 | ✅ Yes |
| ⏳ Section B (operational) | 7 | ✅ Yes (but not blocking) |
| ⏸️ Section B (billing) | 4 | ❌ Waiting for Phase 3 |
| 📧 Templates (A) | 4 | ✅ Yes |
| 📧 Templates (B) | 5 | Partial (2 by Supabase, 3 Phase 3) |
