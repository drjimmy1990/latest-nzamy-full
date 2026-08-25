# Owner Decisions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute the eight decisions the owner ruled on in his 20 August response document that belong to the existing manual-fulfillment system.

**Architecture:** No new subsystems. Two server-side guards, one privacy redaction, three display fixes, one navigation consolidation, and one status surface. Everything builds on machinery that already exists and is reviewed.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Supabase, Tailwind, Framer Motion, Phosphor icons. Tests: `node --test` (Node 24 native TS), zero new dependencies.

**Predecessor:** `docs/superpowers/plans/2026-08-20-owner-review-fixes.md` (complete, merged at `ae06e30`).

**Source of requirements:** the owner's decision document of 20 August, answering the eleven questions in `دليل_المالك_إصلاحات_الملاحظات_٢٠٢٦-٠٨-٢٠.md`.

## Not in this plan — deliberately

Three of his rulings are separate subsystems and each needs its own plan. Bundling them here would produce a plan nobody can execute cleanly:

- **س١٠ Google sign-in** — a plan already exists at `docs/superpowers/plans/2026-08-14-google-signin.md`, unstarted. It documents three real defects (an inverted onboarding gate in `src/proxy.ts`, a strict `onboarding_completed === false` test that never matches OAuth users, and onboarding writing only to `user_metadata` so `profiles.phone` stays NULL). **Execute that plan, do not rewrite it here.**
- **س٩ «مراجعة وتدقيق مذكرة»** — a fifth service with its own intake, validator, admin handling and pricing. Needs its own plan.
- **Section 3, the offline-to-online retainer flow** — blocked. There is no payment provider in this codebase: `payments_gateway` exists only as an admin settings flag (`disabled | test | live` plus a provider *name*) in `src/app/api/v1/admin/settings/route.ts:11` and `src/app/dashboard/admin/settings/page.tsx:38`. The Apple Pay and mada strings in `wallet/page.tsx` and `whatsappWorkflow.ts` are UI mockups. Apple Pay and mada require a real PSP, a merchant account and credentials — an owner decision, not an engineering one. Everything around the payment step can be built once he names the provider.

## Global Constraints

- **No new npm dependencies.**
- **Next.js 16 uses `src/proxy.ts`, NOT `middleware.ts`.** Route handlers receive `params` as a **Promise**.
- All user-facing copy is Arabic, RTL — including every API error message. **The owner's س٤ ruling raises this bar: field _values_ must be Arabic too, not only labels.**
- `npm run test:unit` baseline is **112 pass / 0 fail, pristine output**. Never regress it.
- **One order-creation transport:** `createServiceOrder` → `apiMutate` → `POST /api/v1/service-requests`.
- **`documentId` traces to `attachments.id`, a Postgres `bigserial` serialised by PostgREST as a JSON _number_.** Coerce with `String(v)` or the exported `documentIdStr`. Never guard with `typeof v === 'string'`.
- **Never weaken these:** `attachment.request_id === order.id` gates every download; every refusal branch of a download route returns one byte-identical 404; admin routes use `createServiceClient()` behind `requireAdmin()`; `stripInternalNotes` is applied at every boundary a non-admin can reach.
- Side channels (`recordEvent`, `recordNotification`, `dispatchToN8n`) are best-effort and never break the primary write.
- **No copy may describe work the system does not do.** Every task sent back across the last two plans was sent back for this, and almost always in pre-existing strings.
- **No control may remain on screen whose value cannot reach the payload.**

---

## Task 1: Lock cancellation server-side once an order is delivered — س٢

**The owner's words:** *«قفل إمكانية الإلغاء على مستوى الـ Backend Server فور تحول الطلب إلى completed، ولا يُعتمد على إخفاء الزر فقط.»*

Today `src/app/api/v1/service-requests/[id]/route.ts` computes, for `receiver === "ai_workspace"`, `permitted = isRequester && targetStatus === "cancelled"` — with **no check on the current status**. The client UI is already stricter (it only offers cancel on the three open statuses), but a direct API call cancels a delivered order.

**Files:**
- Modify: `src/app/api/v1/service-requests/[id]/route.ts`
- Create: `src/lib/services/orderTransitions.ts`, `src/lib/services/orderTransitions.test.ts`

**Interfaces:**
- Produces: `canRequesterCancel(currentStatus: string): boolean`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/services/orderTransitions.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { canRequesterCancel } from "./orderTransitions.ts";

test("a client may cancel an order that has not been worked yet", () => {
  assert.equal(canRequesterCancel("pending_assignment"), true);
});

test("a client may cancel an order the admin has claimed but not delivered", () => {
  assert.equal(canRequesterCancel("assigned"), true);
  assert.equal(canRequesterCancel("in_review"), true);
});

test("a client may NOT cancel a delivered order", () => {
  assert.equal(canRequesterCancel("completed"), false);
});

test("a client may NOT re-cancel an already cancelled order", () => {
  assert.equal(canRequesterCancel("cancelled"), false);
});

test("an unknown status is refused rather than allowed", () => {
  // Fail closed: a status this function does not model must not be
  // cancellable by default, or a future status silently reopens the hole.
  assert.equal(canRequesterCancel("draft"), false);
  assert.equal(canRequesterCancel(""), false);
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npm run test:unit`
Expected: FAIL — `Cannot find module './orderTransitions.ts'`.

- [ ] **Step 3: Implement**

```ts
// src/lib/services/orderTransitions.ts
/**
 * Which statuses a requester may cancel from.
 *
 * The client UI hides the cancel button outside these statuses, but that is
 * presentation, not enforcement — a direct PATCH bypasses it entirely. This
 * is the enforcement, and it deliberately fails closed: a status not listed
 * here is refused, so adding a new status later cannot silently reopen the
 * hole.
 */
const REQUESTER_CANCELLABLE = new Set([
  "pending_assignment",
  "assigned",
  "in_review",
]);

export function canRequesterCancel(currentStatus: string): boolean {
  return REQUESTER_CANCELLABLE.has(currentStatus);
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npm run test:unit`
Expected: PASS — 112 previous plus 5 new = 117.

- [ ] **Step 5: Enforce it in the route**

The handler already selects the row before deciding. **Read it first** — confirm the `select` includes `status`, and add it if it does not; the current select is `"requester_user_id, assigned_to, receiver"` and will need widening.

Then, inside the `receiver === "ai_workspace"` branch, the permission becomes:

```ts
permitted =
  isRequester &&
  targetStatus === "cancelled" &&
  canRequesterCancel(existing.status as string);
```

Leave the non-`ai_workspace` branch alone. It serves the lawyer marketplace and is out of scope.

**The refusal must stay Arabic and must not leak why.** Use the route's existing refusal message rather than inventing a new one that distinguishes "too late to cancel" from "not your order" — read what it currently returns and match it. State in your report what a client receives.

- [ ] **Step 6: Verify**

Run: `rm -rf .next/dev && npx tsc --noEmit`, `npm run test:unit`, `npm run build`.

State in your report: the exact response for a cancel attempt on a `completed` order, and confirmation the client UI still behaves as before for open orders.

- [ ] **Step 7: Commit**

```bash
git commit -- src/lib/services/orderTransitions.ts src/lib/services/orderTransitions.test.ts "src/app/api/v1/service-requests/[id]/route.ts" -m "fix(orders): refuse a client cancel once the order is delivered"
```

---

## Task 2: A timeout on uploads — س٣

**The owner's words:** *«وضع مهلة زمنية (Timeout 60 ثانية) مع إظهار رسالة «تعذّر الرفع، يرجى المحاولة مجدداً» بدلاً من تجميد الشاشة.»*

A hung upload leaves `uploading` true forever. The previous round made this worse on purpose: several "next" and "submit" buttons are now gated on `uploading`, so what used to be a spinner that never stopped is now a client who cannot proceed at all. That trade was right — you must not submit mid-upload — but it needs the timeout to be safe.

**Files:**
- Modify: `src/lib/services/documentService.ts`, `src/hooks/useOrderAttachments.ts`
- Modify: `src/lib/services/fileValidation.test.ts` **only if** you add a pure helper worth testing

- [ ] **Step 1: Add the timeout at the network boundary**

`uploadDocumentFile` in `src/lib/services/documentService.ts` performs the Supabase Storage upload and then the metadata POST. Wrap the upload so it rejects after 60 seconds rather than hanging.

Supabase's storage client does not take an `AbortSignal` on `.upload()` in this version — **verify that against the installed package before designing around it.** If it does, use it. If it does not, race the promise:

```ts
const UPLOAD_TIMEOUT_MS = 60_000;

function withTimeout<T>(work: Promise<T>, ms: number, token: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(token)), ms);
    work.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}
```

**Be honest in a comment about what racing does and does not do:** it stops the *caller* waiting, it does not cancel the in-flight request. The upload may still land server-side after the client has given up, producing an orphaned storage object with `request_id` null — which is already this app's documented norm for abandoned uploads.

Throw the literal token `upload_timeout`.

- [ ] **Step 2: Map the token to Arabic**

`attachErrorMessageAr` in `src/hooks/useOrderAttachments.ts` already maps internal tokens to user-facing Arabic and logs the raw cause. Add:

```ts
  if (raw === "upload_timeout") {
    return "تعذّر الرفع — استغرق وقتاً طويلاً. تحقق من اتصالك وحاول مجدداً.";
  }
```

**The token must never reach a user.** That is the established rule in this file; read the existing branches and match them.

- [ ] **Step 3: Confirm `uploading` always clears**

The whole point is that the client is released. `attachFile`'s `finally` and `attachFiles`'s `finally` both call `setUploading(false)`. **Trace both and confirm a timeout rejection reaches them** — a throw that escapes before the `try` would leave the flag stuck, which is the exact bug this task exists to fix.

State the trace in your report.

- [ ] **Step 4: Verify**

Run: `rm -rf .next/dev && npx tsc --noEmit`, `npm run test:unit`, `npm run build`.

State in your report what the client sees after 60 seconds on a hung upload, and confirm the gated buttons release.

- [ ] **Step 5: Commit**

```bash
git commit -- src/lib/services/documentService.ts src/hooks/useOrderAttachments.ts -m "fix(upload): time out after 60s instead of freezing the client"
```

---

## Task 3: Send n8n only what it needs — س٧

**The owner's words:** *«إرسال (الاسم، الجوال، ورابط الطلب) فقط إلى n8n لحماية أسرار ووقائع القضايا والمذكرات.»*

`buildWebhookPayload` (`src/lib/n8n/payload.ts:170-188`) currently sends `data.description` and the whole `data.metadata`. For an AI-service order, `description` is the first 200 characters of the client's case text and `metadata.intake` is the full narrative — party names, national IDs, judgment text.

**`buildWebhookPayload` serves every receiver, not just AI orders.** The lawyer-marketplace workflows may depend on fields this task would remove. **Redact for `receiver === "ai_workspace"` only.** A blanket redaction is a wider blast radius than the owner asked for and could break workflows nobody is testing.

**Files:**
- Modify: `src/lib/n8n/payload.ts`, `src/lib/n8n/payload.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
test("an ai_workspace payload carries no case narrative", () => {
  const p = buildWebhookPayload({
    event: "service_request.completed",
    request: {
      id: "ord-1",
      receiver: "ai_workspace",
      title: "مذكرة دعوى — عمالي",
      description: "وقائع حساسة عن نزاع العميل",
      metadata: { service: "draft", intake: { caseText: "سر", parties: { one: { fullName: "محمد" } } } },
    },
    requesterProfile: { display_name: "عميل", phone: "+966500000000", email: "c@example.com" },
  });
  const s = JSON.stringify(p);
  assert.ok(!s.includes("وقائع حساسة"));
  assert.ok(!s.includes("سر"));
  assert.ok(!s.includes("محمد"));
});

test("an ai_workspace payload still carries what WhatsApp needs", () => {
  const p = buildWebhookPayload({
    event: "service_request.completed",
    request: { id: "ord-1", receiver: "ai_workspace", title: "t", metadata: { service: "draft" } },
    requesterProfile: { display_name: "عميل", phone: "+966500000000", email: "c@example.com" },
  });
  assert.equal(p.recipient.phone, "+966500000000");
  assert.equal(p.recipient.name, "عميل");
  assert.equal(p.entity?.id ?? p.data.orderId, "ord-1");
});

test("a lawyer-marketplace payload is NOT redacted — other workflows depend on it", () => {
  const p = buildWebhookPayload({
    event: "service_request.completed",
    request: {
      id: "req-9", receiver: "lawyer", title: "t",
      description: "تفاصيل الطلب", metadata: { note: "يبقى" },
    },
  });
  assert.equal(p.data.description, "تفاصيل الطلب");
  assert.deepEqual(p.data.metadata, { note: "يبقى" });
});
```

**Read `payload.test.ts` and `payload.ts` before writing these** — the exact argument shape and the `entity`/`orderId` field naming must match what the code actually produces. Adjust the assertions to the real shape rather than forcing the code to match the test above.

- [ ] **Step 2: Run and watch them fail**

Run: `npm run test:unit`

- [ ] **Step 3: Implement the redaction**

For `receiver === "ai_workspace"`, `data` keeps: the order id, `title`, `sourcePath`, `receiver`, `requesterUserId`, `createdAt`, and the order URL if the route already adds one. It drops `description` and reduces `metadata` to the non-sensitive keys only — `service`, `serviceTitleAr`, `schemaVersion` — dropping `intake`, `attachments`, `deliverable` and anything else.

**Allow-list, do not deny-list.** A deny-list means the next field someone adds to intake leaks by default. Build the reduced object by naming the keys that may pass.

Keep `stripInternalNotes` where it is — it protects every other receiver too.

- [ ] **Step 4: Run and watch them pass**

Run: `npm run test:unit`
Expected: 117 previous plus 3 new = 120.

- [ ] **Step 5: Tell the owner what changed for his workflow**

His n8n workflow may currently read fields this task removes. Write, in your report, **the exact before-and-after payload for a completed `ai_draft` order**, so he can compare against what his workflow expects. This is the deliverable he acts on — a summary is not enough.

- [ ] **Step 6: Verify and commit**

Run: `rm -rf .next/dev && npx tsc --noEmit`, `npm run test:unit`, `npm run build`.

```bash
git commit -- src/lib/n8n/payload.ts src/lib/n8n/payload.test.ts -m "feat(n8n): send only name, phone and order link for AI orders"
```

---

## Task 4: Arabic field values, not only Arabic labels — س٤

**The owner's words:** *«تعريب كامل لقيم الحقول (مثل warning ➔ إنذار رسمي، deep ➔ بحث متعمق) لتكون الواجهة عربية 100%.»*

The previous round added 46 Arabic **labels** to the client's order page. The **values** beside them are still English — `نوع الخطاب: warning`, `عمق البحث: deep`.

**Files:**
- Create: `src/app/ai/orders/[id]/_components/intakeValues.ts`
- Modify: `src/app/ai/orders/[id]/_components/OrderSummary.tsx`
- Modify: `src/lib/services/orderPrompt.ts` **only if** the admin brief shows the same raw values

- [ ] **Step 1: Enumerate the real values from source — do not guess**

Every enum a client can produce lives in the wizards. Read these and list the actual stored values with the Arabic each already displays in its own picker, because the picker's own label is the right translation and inventing a second one creates drift:

- `src/app/ai/legal-opinion/_constants.ts` — `OUTPUT_TYPES`, `LETTER_TYPES`, `GOV_ENTITIES`, the depth tiers
- `src/app/ai/legal-opinion/page.tsx` — `buildSettings()`, for every sub-flow branch
- `src/components/legal-opinion/*.tsx` — the audience, side, research-type, scope and goal pickers
- `src/app/ai/wargaming/page.tsx` — `CASE_ROLES`, `CASE_AREAS`, `SIM_TARGETS`
- `src/components/contracts/**` — contract type, language, court type, party type
- `src/components/draft/draftConstants.ts` — memo types, party types

**Produce the inventory table in your report before you write the dictionary:** stored value → the Arabic its own picker shows → the file and line you took it from.

- [ ] **Step 2: Build one dictionary, keyed by value**

```ts
// src/app/ai/orders/[id]/_components/intakeValues.ts
/**
 * Stored intake values are machine ids in English. The client reads this page,
 * so they must render in Arabic — the same Arabic the picker showed when the
 * client chose them, taken from each wizard's own constant rather than
 * re-translated here, so the two can never drift apart.
 *
 * Keyed by value, not by field, because the same id (e.g. "plaintiff") means
 * the same thing in every service. Where a value is genuinely field-specific,
 * key it as `field:value` and look that up first.
 */
export const INTAKE_VALUE_AR: Record<string, string> = {
  // filled from the Step 1 inventory
};

export function valueLabelAr(field: string, value: unknown): string {
  if (typeof value !== "string") return String(value);
  return INTAKE_VALUE_AR[`${field}:${value}`] ?? INTAKE_VALUE_AR[value] ?? value;
}
```

The fallback returns the raw value. **Keep that** — an untranslated value is bad, a crash or a blank is worse, and a future field must degrade rather than break.

- [ ] **Step 3: Use it in the summary**

`OrderSummary.tsx` currently renders values through `String(v)`. Route scalar values through `valueLabelAr(key, v)` instead. **Do not translate free text** — a client's own sentence must appear exactly as they wrote it. Only values that came from a picker are translatable, and the dictionary miss-fallback handles the difference automatically.

- [ ] **Step 4: Check the admin brief**

`buildOrderPrompt` renders the same intake for the admin. Decide whether the admin should see Arabic values too, and say which you chose and why. **Argument for yes:** the admin is Arabic-speaking and pastes this into an assistant. **Argument for no:** raw ids are unambiguous for debugging. Either is defensible; an unexplained choice is not.

- [ ] **Step 5: Verify and commit**

Run: `rm -rf .next/dev && npx tsc --noEmit`, `npm run test:unit`, `npm run build`.

State in your report, for one order of each of the four services, every value row before and after.

```bash
git commit -- "src/app/ai/orders/[id]/_components/" src/lib/services/orderPrompt.ts -m "feat(orders): render intake values in Arabic, not only the labels"
```

---

## Task 5: Two badges in the admin queue — س٥ and س٦

Both are display changes in the same file, so they are one task.

**س٥ — the owner's words:** *«وضع شارة واضحة (Badge) تميّز "ملف المذكرة المراد نقضها" عن باقي المستندات المرفقة للقضية في لوحة الأدمن والعميل.»*

**س٦ — the owner's words:** *«إضافة شارة ملونة وموحدة لـ provider (🟣 مزوّد خدمة) في لوحة الأدمن.»*

**Files:**
- Modify: `src/app/dashboard/admin/service-orders/page.tsx`
- Modify: `src/app/ai/orders/[id]/_components/OrderSummary.tsx`

- [ ] **Step 1: The provider badge**

`ACCOUNT_BADGE` in the admin page maps `user_type` to an Arabic label and colour classes, and deliberately renders nothing for an unmapped type. Add:

```ts
  provider: { label: "مزوّد خدمة", cls: "bg-violet-500/10 text-violet-500" },
```

Check the colour does not collide with a neighbouring type's — `government` and `ngo` already use violet in the existing map. Pick a distinct one and say which.

- [ ] **Step 2: The memo badge — the data already exists**

Wargaming's intake carries `memoAttachmentIds: string[]`, holding the `documentId` of every file the client attached **through the memo control specifically** (added in `7b5480b`). An attachment whose id appears in that list is the memo; every other is a case file.

Match with the bigserial-safe coercion — `String(a.documentId)` against `String(id)` — never `typeof === "string"`.

Render a small badge, `مذكرة`, beside those attachments in the admin's attachment list. **Do nothing when `memoAttachmentIds` is absent**, which is every non-wargaming service and every wargaming order placed before that commit.

- [ ] **Step 3: The same badge on the client's page**

The owner asked for it in both places. `OrderSummary.tsx` renders the attachment list for the client. Apply the same rule there.

- [ ] **Step 4: Verify and commit**

Run: `rm -rf .next/dev && npx tsc --noEmit`, `npm run test:unit`, `npm run build`.

State in your report what an admin sees for a wargaming order with one memo file and two case files, and what they see for a draft order with two files.

```bash
git commit -- src/app/dashboard/admin/service-orders/page.tsx "src/app/ai/orders/[id]/_components/OrderSummary.tsx" -m "feat(admin): mark the memo attachment, and badge provider accounts"
```

---

## Task 6: One unified «طلباتي» for the client — س١

**The owner's words:** *««طلباتي» هو المركز الموحد الشامل لكافة طلبات العميل… لا يتم تشتيت العميل بإنشاء روابط مكررة مثل "طلباتي الذكية".»*

Good news, established by recon: `/dashboard/client/requests` **already understands AI orders**. `WorkflowRequest["type"]` at `src/lib/workflowStore.ts:44` includes `"ai_draft"`, and `receiver` at `:48` includes `"ai_workspace"`. `TYPE_CFG` in the page has an `ai_draft` entry.

What is missing is the other three types.

**Files:**
- Modify: `src/lib/workflowStore.ts`, `src/app/dashboard/client/requests/page.tsx`
- Modify: `src/constants/navigation.sidebars.business.ts` — see Step 4

- [ ] **Step 1: Widen the type union**

`src/lib/workflowStore.ts:44` becomes:

```ts
  type: "service" | "consultation" | "business_case" | "ngo_volunteer"
      | "ai_draft" | "ai_contracts" | "ai_wargaming" | "ai_legal_opinion";
```

These four strings must match the database CHECK constraint exactly. **Verify against `supabase/migrations/20260814_service_orders_types.sql` rather than trusting this plan.**

- [ ] **Step 2: Give each one a row config**

`TYPE_CFG` needs three new entries. Its existing `ai_draft` entry reads `label: "مسودة AI"` — **that label is itself half-English and contradicts the owner's س٤ ruling.** Rename it. Suggested set, matching the service names the client already saw:

```ts
  ai_draft:         { label: "صياغة مذكرة",  icon: PencilSimple, color: "..." },
  ai_contracts:     { label: "عقود",          icon: FileText,     color: "..." },
  ai_wargaming:     { label: "محاكاة",        icon: Scales,       color: "..." },
  ai_legal_opinion: { label: "رأي قانوني",   icon: Lightbulb,    color: "..." },
```

Use icons already imported in that file or add them from `@phosphor-icons/react`, which is already a dependency. Pick colours that do not collide with the four existing types.

- [ ] **Step 3: Confirm the data actually arrives**

A type union is a type. **Read whatever feeds this page** — `src/lib/services/clientWorkflowRepository.ts` and anything it calls — and confirm an `ai_workspace` order for the signed-in client is genuinely returned. If the query filters by receiver or type in a way that excludes them, widening the union changes nothing and the task fails silently. **This is the step that decides whether the feature works.** State exactly what you found and what you changed.

If the row shape differs from `WorkflowRequest`, map it rather than reshaping the AI orders — other callers depend on that store.

- [ ] **Step 4: Remove the duplicate link where the owner's rule applies**

The previous round added «طلباتي الذكية» to eight sidebars. The owner's rule is about **the client**, and lawyers and firms are a different path — theirs stay.

`PROVIDER_SIDEBAR` and `NGO_SIDEBAR` in `src/constants/navigation.sidebars.business.ts` are the ambiguous ones. **Do not decide this yourself — it is an open question with the owner.** Leave both as they are, and note in your report that the answer is pending. If the controller has since supplied the answer, it will be in your dispatch.

- [ ] **Step 5: Verify and commit**

Run: `rm -rf .next/dev && npx tsc --noEmit`, `npm run test:unit`, `npm run build`.

State in your report: what a client with one order of each of the four services now sees at `/dashboard/client/requests`, and whether the filter chips still work across the new types.

```bash
git commit -- src/lib/workflowStore.ts src/app/dashboard/client/requests/page.tsx -m "feat(client): AI orders appear in the unified requests page"
```

---

## Task 7: Show whether the WhatsApp notice was sent — س١١

**The owner's words:** *«إظهار علامة «📱 تم إرسال إشعار الواتساب للعميل بنجاح ✓» في تفاصيل الطلب بلوحة الأدمن مع تفعيل الـ Webhook Secret.»*

The receiving end already works. `src/app/api/v1/n8n/callback/route.ts` authenticates on `X-Webhook-Secret`, fails closed when the secret is unset, and records `notification.${channel}_${status}` into `request_events` (`:62-67`). **Nothing surfaces it.**

**The owner must set `N8N_WEBHOOK_SECRET` in `.env.vps` himself.** It is empty today, so the callback rejects everything by design. No code change substitutes for that, and this task's UI will correctly show "no status yet" until he does. Say so plainly in your report so it is not mistaken for a bug.

**Files:**
- Modify: `src/app/api/v1/admin/service-orders/route.ts`, `src/app/dashboard/admin/service-orders/page.tsx`

- [ ] **Step 1: Return the notification events with each order**

The admin list route already enriches orders with `profiles` in a second query, because there is no PostgREST FK from `service_requests` to `profiles` (see its own comment). Do the same for events: one query against `request_events` for the visible order ids, filtered to events whose name starts with `notification.`, then attach the latest per order.

**One query for all visible orders, not one per order.** The queue renders many rows.

- [ ] **Step 2: Render three honest states**

For each order, exactly one of:

| State | What it means | Copy |
|---|---|---|
| a `notification.whatsapp_sent` event exists | n8n confirmed delivery | `📱 تم إرسال إشعار الواتساب ✓` |
| a `notification.whatsapp_failed` event exists | n8n reported a failure | `⚠️ تعذّر إرسال إشعار الواتساب` |
| no notification event at all | nothing has reported back | `لم يصل تأكيد الإرسال بعد` |

**The third state is the important one and must not be dressed up as success.** No callback can mean the secret is unset, n8n is down, or the workflow never ran — and the client may genuinely have received nothing. Anything that reads as "sent" here would be exactly the class of false claim this project has spent two plans removing.

Show it only on delivered or cancelled orders — those are the events that dispatch a notification. **Confirm which events actually dispatch** by reading the admin PATCH route rather than assuming.

- [ ] **Step 3: Verify and commit**

Run: `rm -rf .next/dev && npx tsc --noEmit`, `npm run test:unit`, `npm run build`.

State in your report what the admin sees for an order delivered while the secret is unset — which is today's real state and what the owner will see first.

```bash
git commit -- src/app/api/v1/admin/service-orders/route.ts src/app/dashboard/admin/service-orders/page.tsx -m "feat(admin): surface whether the WhatsApp notice actually reached the client"
```

---

## Task 8: Update the owner's QA checklist

**Files:**
- Modify: `DEPLOY_AND_SMOKETEST_RUNBOOK.md`

- [ ] **Step 1: Correct what this plan invalidates**

Read the checklist and find every row this plan makes wrong. Do not trust a count from this plan — read it.

- [ ] **Step 2: Add rows for what is new**

One each for: a cancel refused on a delivered order (via the UI, and noting the server now refuses too); a hung upload releasing after 60 seconds; Arabic values on the order page; the memo badge in both places; the provider badge; AI orders appearing in «طلباتي»; and the three WhatsApp states — **including the "no confirmation yet" state, which is what he will see until he sets the secret.**

- [ ] **Step 3: Add the secret as a deploy step**

`N8N_WEBHOOK_SECRET` must be set in `.env.vps` for Task 7 to ever show a positive state. Put it in the deploy section, not buried in a row.

- [ ] **Step 4: Verify every label against source**

Two checklist rounds have now been sent back for naming controls that do not exist. Read the code for every button label, route and status word.

- [ ] **Step 5: Verify and commit**

Run `npx tsc --noEmit` and `npm run test:unit`. You change no source file, so skip the build. `git status` must show one file.

```bash
git commit -- DEPLOY_AND_SMOKETEST_RUNBOOK.md -m "test: owner checklist for the decisions round"
```

---

## Self-review

**Coverage of the owner's decisions.** س٢ → Task 1. س٣ → Task 2. س٧ → Task 3. س٤ → Task 4. س٥ and س٦ → Task 5. س١ → Task 6. س١١ → Task 7. س٨ → **no task, deliberately: his decision was "do not add the screen", so the correct implementation is to change nothing.** س٩, س١٠ and Section 3 → separate plans, stated at the top with reasons.

**One thing I am flagging rather than hiding.** His reasoning for س٨ says the AI and the lawyer will extract the judgment details from the uploaded file. There is no AI in this pipeline — a human admin reads the document. The decision stands and needs no code, but the rationale as written assumes automation that does not exist, and he should know that before he is surprised by an admin asking him for details.

**One open question inside Task 6.** Whether `PROVIDER_SIDEBAR` and `NGO_SIDEBAR` keep «طلباتي الذكية». His rule is about the client; provider and NGO are business accounts with their own dashboards. Task 6 Step 4 deliberately leaves them untouched and says so rather than guessing.

**Type consistency.** `canRequesterCancel` (Task 1), `valueLabelAr` (Task 4) and the four `ai_*` type strings (Task 6) are the only new cross-task names, and each is defined once in the task that introduces it.
