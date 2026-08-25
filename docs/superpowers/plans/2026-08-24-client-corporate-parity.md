# Client and corporate parity — plan

**Goal (owner, 24 August 2026):** make العميل (individual) and الشركة (corporate) work the way the lawyer
already does — the user fills a wizard, the request lands in the admin fulfilment queue, and the نظامي team
executes it manually and delivers.

**Research behind this plan:** 6 read-only agents mapped all three pipelines end to end (run
`wf_ccc55d25-3f1`). Every `file:line` below was resolved by an agent or by me. Nothing is assumed.

---

## 0. The headline: the pipeline is already type-agnostic

This is not "build a pipeline for clients". The pipeline accepts them today and nothing refuses them.

- `POST /api/v1/service-requests` has **no `user_type` check of any kind**. Auth (401), the payment gate
  (402) and `intakeGuard` (400) are the only gates — it never reads `profiles.user_type`
  (`route.ts:135-253`).
- The four AI services are **already free by construction**: `createServiceOrder` hardcodes
  `payment {amount: 0, status: "not_required"}` (`serviceOrders.ts:59`), so the 402 never fires for them.
- `src/proxy.ts` restricts `/dashboard/*` by type, but `/ai/*` is only in the auth-required `PROTECTED`
  list — **not** in `ROUTE_ACCESS`. An individual can already load `/ai/draft`.
- The server feature-gate table is **dead code**. `checkAccess()` — the only reader of
  `SERVER_FEATURE_GATES` — has **zero callers** (`access-control.ts:60-80, :124-146`; three grep hits, all
  inside that file). The client mirror `FEATURE_GATES` has **no key at all** for `ai-draft`,
  `ai-wargaming` or `legal-opinion`.
- RLS on `service_requests` is ownership-based (`requester_user_id = auth.uid()`), not type-based.

**And one client path already works end to end in production.** The client AI-consultation writes
`receiver: "ai_workspace"` with `type: "consultation"` (`consultation/new/page.tsx:245`) and appears in the
admin queue **today**, with metadata that has no `intake` key at all. Proof, not theory.

### What actually blocks parity — four things

| # | Blocker | `file:line` | Size |
|---|---|---|---|
| 1 | **The admin queue is locked to one receiver.** Two `.eq("receiver","ai_workspace")` lines. Everything else in the fulfilment chain is receiver-agnostic. | `admin/service-orders/route.ts:54`, `[id]/route.ts:211` | **S** |
| 2 | **22 of 27 client services are un-submittable.** `requiresPayment:true` + no gateway ⇒ the wizard blocks before creating a row. | `clientServiceCatalog.ts`, `requests/new/page.tsx:45,:70` | **S** |
| 3 | **The client wizard discards uploaded files.** It stores `fileCount` and `fileNames` only — no `uploadDocumentFile` call exists in that file. The admin would see a document list it cannot open. | `requests/new/page.tsx:166-170` | **S** |
| 4 | **Nothing in the corporate dashboard reaches `service_requests`.** The one correctly-shaped corporate request writes to **localStorage**. | `business/reviews/new/page.tsx:71,80` → `workflowStore.ts:96` | **M** |

Blockers 1–3 are the whole individual story. Blocker 4 is the corporate story.

---

## 1. Decisions taken (owner, this session)

| Decision | Choice |
|---|---|
| **Intake shape** | **One simple intake for all services** — service picker → guided free text → attachments with descriptions. Not the four lawyer wizards (they ask «صفة الموكل», «نوع المذكرة»), not 27 bespoke forms. |
| **Payment during beta** | **Admin quotes after submission.** Request is submitted free, reaches the queue, the admin sets a price and arranges payment directly. Explicitly temporary — *"until we make the pricing"*. |
| **Corporate** | **Route companies through the client flow**, plus company identity (CR, legal representative) and a document vault. Hide the 19 mock ERP sections. |

---

## 2. Design decisions this plan makes

### 2.1 Keep `receiver: "ai_workspace"`; widen the filter with a shared constant

**Do not mint a new receiver value.** `receiver` is CHECK-constrained, so a new value needs a migration —
and this repo has a documented history of migrations written but never applied to prod.

More importantly the value is already load-bearing beyond the queue:
`20260815_marketplace_excludes_ai_workspace.sql` uses `receiver <> 'ai_workspace'` to hide platform work
from the lawyer marketplace. Under monopoly mode that is exactly the semantics we want — *"the نظامي team
fulfils this, do not offer it to outside lawyers."*

The **name** is a lie (no AI is involved in manual fulfilment), but renaming costs a migration, a backfill
and an RLS change for zero behaviour. Instead:

- [ ] Create `src/lib/services/platformFulfilment.ts` exporting
      `PLATFORM_FULFILLED_RECEIVERS = ["ai_workspace"] as const`, with a docblock recording that the name is
      historical, that it means "fulfilled by the نظامي team, not the marketplace", and that
      `20260815` depends on the literal string.
- [ ] Replace both `.eq("receiver","ai_workspace")` with `.in("receiver", PLATFORM_FULFILLED_RECEIVERS)`.
      One constant, two call sites, no migration. Adding a receiver later is then a one-line change.

**Existing orphans to decide on separately:** `business_legal`, `ngo_admin` and `government_reviewer` rows
exist with no reader at all. Do **not** silently widen the filter to include them — some are localStorage
artifacts. Count them first (§6.1).

### 2.2 The generic intake — `GeneralIntakeV1`

The admin brief renders from `metadata.intake` via `buildOrderPrompt` → `intakeValues` (Arabic labels).
That renderer is **generic** — it walks whatever tree it is given, it is not a per-service switch
(`orderPrompt.ts:77-113`). So a client request gets a proper Arabic brief *for free* the moment it writes a
well-shaped `metadata.intake`.

Today `requests/new` writes `metadata` with no `intake` key at all, so the admin brief is
title + description + «—».

```
GeneralIntakeV1 {
  schemaVersion: 1
  service:        string      // the clientServiceCatalog id, e.g. "contract-review"
  serviceTitleAr: string      // «مراجعة من محامٍ متخصص»
  subject:        string      // «موضوع الطلب» — one line
  details:        string      // «اشرح ما تحتاجه» — min length, the narrative
  urgency?:       "normal" | "urgent"
  attachments:    { documentId, name, size, description? }[]
}
```

Deliberately close to what the four lawyer validators already reduce to — *a discriminant + one
minimum-length narrative + attachments* (`orderIntake.ts:118-144` and siblings). That is why one form can
carry all 27 services.

- [ ] `src/lib/services/orderIntake.general.ts` + `.test.ts` — `validateGeneralIntake`, same
      discriminated-result shape as the other four.
- [ ] Register it in `intakeGuard.ts` `VALIDATOR_BY_SERVICE`. **Trap:** that table is keyed by
      `ServiceKey` (the four AI keys). The general validator must be reachable by a *different* dispatch
      rule — key on `metadata.intake.schemaVersion`/shape or add a `general` key — without breaking the
      existing four. `checkOrderIntake` currently passes any unknown service through **unvalidated**
      (`intakeGuard.ts:80-93`); after this change client intakes must be validated, and everything else must
      still pass through.
- [ ] Arabic labels for the new keys in `intakeValues.ts` (`subject` → «موضوع الطلب», `details` →
      «تفاصيل الطلب», `urgency` → «الاستعجال»). Without this the brief prints raw English keys — the exact
      bug fixed this morning in `a879f6e`.

### 2.3 The quote flow — no payment rows, no gateway

Client submits at `amount: 0`, which bypasses the 402 entirely. The admin then sets a price.

```
client submits (amount 0, status pending_assignment)
   → admin queue
   → admin sets quote → metadata.quote = { amount, currency:"SAR", note, setBy, setAt }
   → client sees «عرض السعر» on their order page + a notification
   → payment arranged offline (WhatsApp / transfer / office)
   → admin claims → delivers
```

No `payments` row, no PSP, no migration. When a gateway does exist, `metadata.quote` becomes the thing the
checkout reads.

- [ ] Add a `set_quote` action to `PATCH /api/v1/admin/service-orders/[id]`, alongside
      `claim`/`deliver`/`cancel`/`resend_whatsapp`.
- [ ] Render the quote in the admin panel and on the client's order page.
- [ ] **Do not** flip `requiresPayment` to `false` in the catalog. The public pages advertise these prices;
      making them silently free creates the same contradiction we removed from the FAQ this morning. The
      catalog price becomes «السعر التقديري» shown *before* submitting, and the admin's quote is the real
      number.

### 2.4 Server-side re-pricing (security, do it in the same round)

`payment.amount` is written straight from the request body (`route.ts:212`) and coupons are a two-entry
client-side map. **A crafted `amount: 0` POST bypasses the payment gate entirely.** That is latent today
because the gateway is off — but this plan makes `amount: 0` the *normal* client path, so the hole must
close before the gateway is ever switched on or it becomes a live bypass on day one.

- [ ] Re-price on the server from `admin_pricing_catalog` (already exists, already merged at runtime by
      `pricingRepository.ts:143-186`) rather than trusting the body.

---

## 3. Phase 1 — the individual client (the whole story is 4 tasks)

- [ ] **1.1 Open the queue.** §2.1: shared constant, two `.eq` → `.in`. **S**
      *Verify:* an existing `receiver:"lawyer"` client row appears in the admin queue.

- [ ] **1.2 Build the generic wizard.** New route `/dashboard/client/requests/new` (replace the current
      one). Service picker from `clientServiceCatalog` → subject → details → attachments.
      - Use `useOrderAttachments` — the **real** upload hook the four wizards use. It uploads with
        `request_id NULL` and the POST route re-binds by `metadata.attachments`
        (`route.ts:293-329`). Do not re-invent it; the current wizard's file handling is the bug.
      - Per-attachment description field (the owner asked for this in obs-6/12; `StepCase.tsx:222` is the
        pattern to copy).
      - Submit through `createServiceOrder`-style always-API path, **not** `createWorkflowRequest` — the
        latter silently falls back to localStorage when the env flag is not `supabase`
        (`clientWorkflowRepository.ts:327-342`).
      - `payment: { amount: 0, status: "not_required" }`, `status: "pending_assignment"`,
        `receiver: "ai_workspace"`, `type: "service"`. **M**

- [ ] **1.3 Client-facing order detail.** `/ai/orders/[id]` is the working template (stepper, deliverable
      download, cancel). Either reuse it for clients or fold it into «طلباتي».
      **Trap:** the delivery notification and the n8n payload both hardcode `/ai/orders/${id}`
      (`[id]/route.ts:81,:351`). A client sent to an `/ai/` URL is confusing at best. Whichever surface
      wins, fix those two links. **M**

- [ ] **1.4 Admin polish for mixed traffic.** **S**
      - `SERVICE_BADGE` maps only the four AI keys (`page.tsx:98-100`) — extend it, or fall back to
        `metadata.serviceTitleAr`.
      - Wire the existing-but-unsent `?service=` filter (`route.ts:59`; the page sends only `?status=`).
      - Add an account-type filter — the badges already exist (`page.tsx:87-96`), the filter does not.

---

## 4. Phase 2 — the company

Companies use the Phase 1 wizard. What they need on top:

- [ ] **2.1 Fix corporate signup.** The trigger reads `raw_user_meta_data->>'company_name'`, which the
      registration form **never sets**, and the CR number is collected and then **dropped**
      (`20260716_security_hardening.sql:71`). Every corporate row today reads «شركة جديدة» with no CR.
      Fix the form→trigger contract, and **backfill existing rows**. **S**

- [ ] **2.2 Company identity on the request.** CR number, legal representative and capacity, read from
      `business_profiles` and stamped onto `metadata.entity` so the admin brief carries it. **S**

- [ ] **2.3 Company document vault.** CR, articles of association, VAT certificate, signatory letter —
      uploaded **once**, auto-attached to every request. Storage today is per-request only
      (`route.ts:307` binds by `request_id`), so this needs an org-scoped column plus RLS. This is the one
      genuinely new capability in the corporate story. **M**

- [ ] **2.4 Hide the mock ERP.** 19 sections render fabricated data — mock requests, mock consultations,
      mock KPIs — with no demo banner. A paying company reading fabricated case data is worse than an empty
      state. Hide them from `CORPORATE_SIDEBAR` until real. **S**

- [ ] **2.5 Capture the two forms that currently throw data away.** **S**
      - `/services/business` «التقييم القانوني المجاني» — the primary CTA, used twice on the page, collects
        company name, size and up to 8 legal needs and **never POSTs** (`_components.tsx:190`).
      - `/book/consultation` — the public booking funnel captures specialty, description, files and
        schedule and submits **nothing**; the only async work is a fake 2200 ms delay
        (`useConsultationForm.ts:36`).
      Both are advertised entry points. This is the cheapest new-request volume on the board.

**Explicitly deferred:** multi-seat corporates. The `business_members` table exists with 9 roles, a
permissions array and RLS already written (`20260603_phase1_002_entities.sql:299-315`) — and **zero code
touches it**. `businessRole` comes from `auth.user_metadata`, not from membership (`useUser.ts:632`). Seats
are cheaper than they look, but one login per company is acceptable for the beta and this plan does not
build them.

---

## 5. What this plan does NOT do

- **Does not build a second admin queue.** There is one, it is receiver-agnostic behind two lines, and it
  already has claim/deliver/cancel/WhatsApp.
- **Does not touch the four lawyer wizards.** They keep their own validators and their lawyer-shaped
  questions. Lawyers are unaffected.
- **Does not add a payment gateway**, a `/pay/[token]` link or a receipt PDF. Still blocked on a PSP.
- **Does not build corporate seats, departments, governance or ERP.**
- **Does not mint a new `receiver` value** or touch a CHECK constraint. Zero migrations in Phase 1.

---

## 6. Traps, in the order they will bite

### 6.1 Count the orphans before widening anything
`business_legal`, `ngo_admin`, `government_reviewer` rows exist with no reader. Some came from a
localStorage path. Run first — this also decides whether pagination is P0:

```sql
select receiver, type, status, count(*) from service_requests group by 1,2,3 order by 4 desc;
```

### 6.2 The admin queue has no pagination
`.limit(200)`, no offset, no cursor, no count (`route.ts:55-56`), and search filters **client-side over that
truncated set** (`page.tsx:410-416`). Adding client + corporate volume to a lawyer-only queue may cross 200
quickly. `src/app/api/v1/service-requests/route.ts:48-58` already implements limit/offset/count — copy it.

### 6.3 `/ai/micro` writes `status: "completed"` at creation
`micro/page.tsx:169-170` creates `receiver: "ai_workspace"` rows already completed. They sit in the
«مُسلّمة» tab having never been worked. Decide whether that is intentional self-service before adding
volume to the same queue.

### 6.4 The onboarding phone gate applies to clients but not lawyers
`onboardingGate.ts:118` exempts `lawyer`/`firm`/`admin`. Any individual or corporate test account must
finish onboarding with a phone before it can reach `/ai/*` at all. Expect this on the first test.

### 6.5 `video-short` is unorderable
The consultation wizard collapses every video mode to `video-full`
(`consultation/new/page.tsx:162-164,:175`), so the 30-minute product can never be ordered — and it is
priced identically to the 60-minute one. Delete it or make it reachable.

### 6.6 Delete the dead gate tables
`SERVER_FEATURE_GATES` + `checkAccess` read like enforcement and enforce nothing. A future reviewer will
assume `ai-contracts` is shield-gated server-side. **Wiring it as written would newly block free-tier
clients from `ai-contracts` and `ai-wargaming` — the exact opposite of this goal.** Delete it.

---

## 7. Verification

Unit tests cover `validateGeneralIntake` and the `intakeGuard` dispatch (including that the four AI
services still validate and that non-AI requests still pass through). Everything else is UI and must be
exercised in a browser — this repo has no React test framework and none may be added.

1. Individual account → wizard → submit with two attachments → **appears in the admin queue**.
2. Admin panel shows the Arabic brief (no raw English keys) and **can open both attachments**.
3. Admin sets a quote → client sees «عرض السعر» + notification.
4. Admin claims → panel survives on the «جديدة» tab → delivers → client downloads.
5. Same five steps as a corporate account, with the CR on the brief.
6. Lawyer regression: `/ai/draft` submit → still lands, still renders, still delivers.
