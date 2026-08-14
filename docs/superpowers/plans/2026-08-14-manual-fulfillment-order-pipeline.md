# Manual Fulfillment Order Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/ai/draft` (الصائغ القانوني) from a front-end mock into a real order that a client submits, an admin fulfils by hand, and n8n announces on WhatsApp — as the reusable template for the other three services.

**Architecture:** Orders are rows in the existing `service_requests` table (`type='ai_draft'`, `receiver='ai_workspace'`), created through the existing generic `POST /api/v1/service-requests`. The mock middle wizard steps are hidden behind a constant, not deleted. A new admin queue uses the service-role client behind `requireAdmin()` because `service_requests` has no admin RLS policy. Completion fires the already-wired `dispatchToN8n` to `/request-completed`, and a new callback endpoint records WhatsApp delivery status.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Supabase (`@supabase/ssr` 0.10, `supabase-js` 2.107), Tailwind, Framer Motion, Phosphor Icons. Tests: `node --test` with native TypeScript type-stripping (Node 24) — zero new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-14-manual-fulfillment-services-design.md`

## Global Constraints

- **No new npm dependencies.** The project has 13 dependencies and no validation or test library. Hand-roll validators; use `node --test`.
- **Next.js 16 uses `src/proxy.ts`, not `middleware.ts`.** Never create `middleware.ts` — having both breaks `next build`.
- **All user-facing copy is Arabic**, RTL (`dir="rtl"`), matching existing pages.
- **Service-role client (`createServiceClient()`) only ever runs behind `requireAdmin()`** — `service_requests` RLS is `requester_user_id = auth.uid() or assigned_to = auth.uid()` with no admin policy.
- **Side-channels never break the primary write.** `recordEvent`, `recordNotification`, and `dispatchToN8n` are best-effort: log and swallow.
- **Never send a download link over WhatsApp.** Signed URLs live 300s; permanent links leak private legal documents. Send `orderUrl` only.
- **`documents` is the storage bucket; `attachments` is the metadata table.** Do not invent a `documents` table.
- **There is no PostgREST FK from `service_requests` to `profiles`** — enrich requester profiles in a second `.in()` query (cap ~396 ids per call).
- Service key values are exactly: `draft`, `contracts`, `wargaming`, `legal_opinion`. Type values: `ai_draft`, `ai_contracts`, `ai_wargaming`, `ai_legal_opinion`.

---

## File Structure

**Create:**
| Path | Responsibility |
|---|---|
| `supabase/migrations/20260814_service_orders_types.sql` | Extend `service_requests.type` CHECK |
| `src/lib/services/orderIntake.ts` | Intake types + pure validator (no I/O) |
| `src/lib/services/orderIntake.test.ts` | Validator unit tests |
| `src/lib/services/serviceOrders.ts` | Client-side order create/list/get |
| `src/lib/n8n/payload.test.ts` | Payload builder tests incl. recipient regression |
| `src/components/draft/steps/StepSubmit.tsx` | Review-and-send step |
| `src/app/ai/orders/page.tsx` | Client order list |
| `src/app/ai/orders/[id]/page.tsx` | Client order detail + download |
| `src/app/api/v1/service-requests/[id]/deliverable/route.ts` | Ownership-checked signed URL |
| `src/app/api/v1/admin/service-orders/route.ts` | Admin queue list |
| `src/app/api/v1/admin/service-orders/[id]/route.ts` | Claim / deliver / cancel |
| `src/app/dashboard/admin/service-orders/page.tsx` | Admin queue UI |
| `src/app/api/v1/n8n/callback/route.ts` | WhatsApp delivery status |
| `n8n/CONTRACT-service-orders.md` | Owner-facing webhook contract |

**Modify:**
| Path | Change |
|---|---|
| `src/components/draft/draftConstants.ts` | Add `CLIENT_VISIBLE_STEPS` |
| `src/app/ai/draft/page.tsx` | Render visible steps; mount `StepSubmit` |
| `src/lib/n8n/payload.ts` | Fix `deriveRecipient`; add `name`/`phone`/`email` |
| `src/app/api/v1/service-requests/[id]/route.ts` | Pass requester profile into payload |
| `scripts/smoke-routes.mjs` | Add new routes |
| `package.json` | Add `test:unit` script |
| `DEPLOY_AND_SMOKETEST_RUNBOOK.md` | Manual QA checklist |

---

## Task 1: Migration — allow the four service order types

**Files:**
- Create: `supabase/migrations/20260814_service_orders_types.sql`

**Interfaces:**
- Consumes: nothing
- Produces: `service_requests.type` accepts `ai_draft`, `ai_contracts`, `ai_wargaming`, `ai_legal_opinion`

- [ ] **Step 1: Write the migration**

```sql
-- 20260814_service_orders_types.sql
-- Extend service_requests.type so the four premium services can be ordered.
-- 'ai_draft' already existed; the other three are new. Idempotent.

begin;

alter table public.service_requests
  drop constraint if exists service_requests_type_check;

alter table public.service_requests
  add constraint service_requests_type_check
  check (type in (
    'service', 'consultation', 'business_case', 'ngo_volunteer',
    'ai_draft', 'ai_contracts', 'ai_wargaming', 'ai_legal_opinion'
  ));

commit;
```

- [ ] **Step 2: Apply it to the local/dev Supabase project**

Run the SQL in the Supabase SQL editor (or `psql`) against the dev project.
Expected: `ALTER TABLE` twice, no error.

- [ ] **Step 3: Verify the constraint accepts the new values**

```sql
select pg_get_constraintdef(oid)
from pg_constraint
where conname = 'service_requests_type_check';
```

Expected: output contains `ai_legal_opinion`.

- [ ] **Step 4: Verify a bad value is still rejected**

```sql
-- expect: ERROR  new row violates check constraint
insert into public.service_requests (id, type, title, receiver, status)
values ('probe-1', 'not_a_real_type', 't', 'ai_workspace', 'pending_assignment');
```

Expected: FAILS with a check-constraint violation. (Nothing to clean up — the insert did not happen.)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260814_service_orders_types.sql
git commit -m "feat(db): allow the four AI service order types on service_requests"
```

---

## Task 2: Intake types and validator

The `metadata` column is untyped `jsonb`. This module is the only thing standing between a malformed wizard payload and the database, so it is written test-first.

**Files:**
- Create: `src/lib/services/orderIntake.ts`
- Create: `src/lib/services/orderIntake.test.ts`
- Modify: `package.json` (add `test:unit`)

**Interfaces:**
- Consumes: `PartyData` from `src/components/draft/draftConstants.ts`
- Produces:
  - `type ServiceKey = "draft" | "contracts" | "wargaming" | "legal_opinion"`
  - `interface DraftIntakeV1`
  - `interface OrderAttachment { documentId: string; name: string; size: number }`
  - `validateDraftIntake(input: unknown): { ok: true; value: DraftIntakeV1 } | { ok: false; errors: string[] }`
  - `SERVICE_TYPE_BY_KEY: Record<ServiceKey, string>`

- [ ] **Step 1: Add the test script to package.json**

In `"scripts"`, add:

```json
"test:unit": "node --test \"src/**/*.test.ts\""
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/services/orderIntake.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateDraftIntake, SERVICE_TYPE_BY_KEY } from "./orderIntake.ts";

const valid = {
  schemaVersion: 1,
  service: "draft",
  clientRole: "plaintiff",
  memoType: "case",
  legalBranch: "عمالي",
  caseText: "و".repeat(40),
  parties: { one: { type: "individual", fullName: "محمد" }, two: { type: "company", companyName: "شركة" } },
  attachments: [],
};

test("accepts a well-formed intake", () => {
  const r = validateDraftIntake(valid);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.legalBranch, "عمالي");
});

test("rejects a non-object", () => {
  const r = validateDraftIntake(null);
  assert.equal(r.ok, false);
});

test("rejects caseText shorter than 30 characters", () => {
  const r = validateDraftIntake({ ...valid, caseText: "قصير" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes("الوقائع")));
});

test("rejects an unknown clientRole", () => {
  const r = validateDraftIntake({ ...valid, clientRole: "judge" });
  assert.equal(r.ok, false);
});

test("collects every error, not just the first", () => {
  const r = validateDraftIntake({ ...valid, caseText: "x", legalBranch: "" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.length >= 2);
});

test("rejects an attachment missing documentId", () => {
  const r = validateDraftIntake({ ...valid, attachments: [{ name: "a.pdf", size: 10 }] });
  assert.equal(r.ok, false);
});

test("maps every service key to a service_requests type", () => {
  assert.equal(SERVICE_TYPE_BY_KEY.draft, "ai_draft");
  assert.equal(SERVICE_TYPE_BY_KEY.legal_opinion, "ai_legal_opinion");
});
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `npm run test:unit`
Expected: FAIL — cannot resolve `./orderIntake.ts`.

- [ ] **Step 4: Write the implementation**

Create `src/lib/services/orderIntake.ts`:

```ts
/**
 * orderIntake.ts — pure intake contract for AI service orders.
 *
 * service_requests.metadata is untyped jsonb, so this module is the single
 * validation boundary before a wizard payload is persisted. Pure: no I/O, no
 * clock, no Supabase — unit-testable with `node --test`.
 */

import type { PartyData } from "@/components/draft/draftConstants";

export type ServiceKey = "draft" | "contracts" | "wargaming" | "legal_opinion";

export const SERVICE_TYPE_BY_KEY: Record<ServiceKey, string> = {
  draft: "ai_draft",
  contracts: "ai_contracts",
  wargaming: "ai_wargaming",
  legal_opinion: "ai_legal_opinion",
};

export const SERVICE_TITLE_AR: Record<ServiceKey, string> = {
  draft: "الصائغ القانوني",
  contracts: "محترف العقود",
  wargaming: "المحاكي الشامل",
  legal_opinion: "الرأي الفصل",
};

export interface OrderAttachment {
  documentId: string;
  name: string;
  size: number;
}

export interface DraftIntakeV1 {
  schemaVersion: 1;
  service: "draft";
  clientRole: "plaintiff" | "defendant";
  memoType: string;
  memoSubType?: string;
  legalBranch: string;
  caseText: string;
  parties: { one: Partial<PartyData>; two: Partial<PartyData> };
  judgment?: {
    number?: string; court?: string; date?: string;
    text?: string; reasons?: string;
  };
  lawyerNotes?: string;
  attachments: OrderAttachment[];
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

const MIN_CASE_TEXT = 30;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function validateDraftIntake(input: unknown): ValidationResult<DraftIntakeV1> {
  const errors: string[] = [];

  if (!isRecord(input)) {
    return { ok: false, errors: ["البيانات المرسلة غير صالحة"] };
  }

  const clientRole = str(input.clientRole);
  if (clientRole !== "plaintiff" && clientRole !== "defendant") {
    errors.push("صفة الموكل غير محددة");
  }

  const memoType = str(input.memoType);
  if (!memoType) errors.push("نوع المذكرة مطلوب");

  const legalBranch = str(input.legalBranch);
  if (!legalBranch) errors.push("الفرع القانوني مطلوب");

  const caseText = str(input.caseText);
  if (caseText.length < MIN_CASE_TEXT) {
    errors.push(`الوقائع قصيرة جداً — الحد الأدنى ${MIN_CASE_TEXT} حرفاً`);
  }

  const partiesRaw = isRecord(input.parties) ? input.parties : null;
  if (!partiesRaw || !isRecord(partiesRaw.one) || !isRecord(partiesRaw.two)) {
    errors.push("بيانات الأطراف غير مكتملة");
  }

  const attachmentsRaw = Array.isArray(input.attachments) ? input.attachments : [];
  const attachments: OrderAttachment[] = [];
  attachmentsRaw.forEach((a, i) => {
    if (!isRecord(a) || !str(a.documentId)) {
      errors.push(`المرفق رقم ${i + 1} غير صالح`);
      return;
    }
    attachments.push({
      documentId: str(a.documentId),
      name: str(a.name) || "مرفق",
      size: typeof a.size === "number" && a.size >= 0 ? a.size : 0,
    });
  });

  if (errors.length > 0) return { ok: false, errors };

  const judgmentRaw = isRecord(input.judgment) ? input.judgment : null;

  return {
    ok: true,
    value: {
      schemaVersion: 1,
      service: "draft",
      clientRole: clientRole as "plaintiff" | "defendant",
      memoType,
      ...(str(input.memoSubType) ? { memoSubType: str(input.memoSubType) } : {}),
      legalBranch,
      caseText,
      parties: {
        one: (partiesRaw!.one as Partial<PartyData>),
        two: (partiesRaw!.two as Partial<PartyData>),
      },
      ...(judgmentRaw
        ? {
            judgment: {
              number: str(judgmentRaw.number), court: str(judgmentRaw.court),
              date: str(judgmentRaw.date), text: str(judgmentRaw.text),
              reasons: str(judgmentRaw.reasons),
            },
          }
        : {}),
      ...(str(input.lawyerNotes) ? { lawyerNotes: str(input.lawyerNotes) } : {}),
      attachments,
    },
  };
}
```

- [ ] **Step 5: Run the tests and make sure they pass**

Run: `npm run test:unit`
Expected: PASS — 7 tests.

- [ ] **Step 6: Commit**

```bash
git add package.json src/lib/services/orderIntake.ts src/lib/services/orderIntake.test.ts
git commit -m "feat(orders): typed intake contract with validator and unit tests"
```

---

## Task 3: Fix the n8n recipient bug and carry contact details

`deriveRecipient()` returns the **assignee** when `assigned_to` is set. In this pipeline the assignee is the admin who did the work, so a completion webhook would name the admin and WhatsApp the wrong person. Fixed test-first.

**Files:**
- Modify: `src/lib/n8n/payload.ts`
- Create: `src/lib/n8n/payload.test.ts`

**Interfaces:**
- Consumes: nothing new
- Produces:
  - `WebhookPayload["recipient"]` gains `name?: string`, `phone?: string`, `email?: string`
  - `BuildWebhookPayloadOpts` gains `requesterProfile?: Record<string, unknown> | null`

- [ ] **Step 1: Write the failing test**

Create `src/lib/n8n/payload.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWebhookPayload } from "./payload.ts";

const ts = "2026-08-14T09:00:00.000Z";

const completedRequest = {
  id: "order-1",
  type: "ai_draft",
  status: "completed",
  receiver: "ai_workspace",
  requester_user_id: "client-uuid",
  assigned_to: "admin-uuid",
  payment: { amount: 0, status: "not_required" },
  metadata: { service: "draft" },
};

const requesterProfile = {
  id: "client-uuid", display_name: "محمد العتيبي",
  phone: "+966500000000", email: "m@example.com", user_type: "individual",
};

test("REGRESSION: completed events address the requester, not the assignee", () => {
  const p = buildWebhookPayload({
    event: "service_request.completed",
    timestamp: ts,
    request: completedRequest,
    actor: { id: "admin-uuid", display_name: "الإدارة", user_type: "admin" },
    requesterProfile,
  });
  assert.equal(p.recipient.id, "client-uuid");
  assert.notEqual(p.recipient.id, "admin-uuid");
});

test("completed events carry the phone WhatsApp needs", () => {
  const p = buildWebhookPayload({
    event: "service_request.completed", timestamp: ts,
    request: completedRequest, requesterProfile,
  });
  assert.equal(p.recipient.phone, "+966500000000");
  assert.equal(p.recipient.name, "محمد العتيبي");
});

test("a missing phone yields undefined, and the payload still builds", () => {
  const p = buildWebhookPayload({
    event: "service_request.completed", timestamp: ts,
    request: completedRequest,
    requesterProfile: { ...requesterProfile, phone: null },
  });
  assert.equal(p.recipient.phone, undefined);
  assert.equal(p.recipient.id, "client-uuid");
});

test("non-completion events keep addressing the assignee", () => {
  const p = buildWebhookPayload({
    event: "service_request.status_changed", timestamp: ts,
    request: { ...completedRequest, status: "assigned" },
  });
  assert.equal(p.recipient.id, "admin-uuid");
});

test("timestamp and entity pass through unchanged", () => {
  const p = buildWebhookPayload({
    event: "service_request.completed", timestamp: ts, request: completedRequest,
  });
  assert.equal(p.timestamp, ts);
  assert.equal(p.entity.id, "order-1");
  assert.equal(p.entity.type, "ai_draft");
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npm run test:unit`
Expected: FAIL — the first test reports `recipient.id === "admin-uuid"`.

- [ ] **Step 3: Fix `deriveRecipient` and extend the type**

In `src/lib/n8n/payload.ts`, extend the interface:

```ts
export interface WebhookPayload {
  // ...unchanged fields...
  recipient: {
    id?: string;
    role?: string;
    name?: string;
    phone?: string;
    email?: string;
  };
  // ...
}

export interface BuildWebhookPayloadOpts {
  event: string;
  timestamp: string;
  request: Record<string, unknown>;
  actor?: Record<string, unknown> | null;
  /** Requester's profile row — supplies name/phone/email for outbound channels. */
  requesterProfile?: Record<string, unknown> | null;
}
```

Replace `deriveRecipient` with an event-aware version:

```ts
/**
 * Derive the recipient for an event.
 *
 * Completion is addressed to the REQUESTER: on an AI service order the
 * assignee is the admin who did the work, so returning the assignee here
 * would message the wrong person.
 */
function deriveRecipient(
  request: Record<string, unknown>,
  event: string,
  requesterProfile?: Record<string, unknown> | null,
): WebhookPayload["recipient"] {
  const assignedTo = typeof request.assigned_to === "string" ? request.assigned_to : undefined;
  const receiver = typeof request.receiver === "string" ? request.receiver : undefined;
  const requesterUserId =
    typeof request.requester_user_id === "string" ? request.requester_user_id : undefined;

  const contact = (id?: string): WebhookPayload["recipient"] => {
    const base: WebhookPayload["recipient"] = {};
    if (id) base.id = id;
    if (receiver) base.role = receiver;
    if (requesterProfile && id && requesterProfile.id === id) {
      const name = typeof requesterProfile.display_name === "string" ? requesterProfile.display_name : undefined;
      const phone = typeof requesterProfile.phone === "string" ? requesterProfile.phone : undefined;
      const email = typeof requesterProfile.email === "string" ? requesterProfile.email : undefined;
      const role = typeof requesterProfile.user_type === "string" ? requesterProfile.user_type : undefined;
      if (name) base.name = name;
      if (phone) base.phone = phone;
      if (email) base.email = email;
      if (role) base.role = role;
    }
    return base;
  };

  const addressesRequester =
    event === "service_request.completed" ||
    event === "service_request.cancelled";

  if (addressesRequester && requesterUserId) return contact(requesterUserId);
  if (assignedTo) return contact(assignedTo);
  if (receiver) return { role: receiver };
  if (requesterUserId) return contact(requesterUserId);
  return {};
}
```

Update the call site inside `buildWebhookPayload` to pass the new arguments:

```ts
recipient: deriveRecipient(request, opts.event, opts.requesterProfile ?? null),
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npm run test:unit`
Expected: PASS — 12 tests total (7 from Task 2, 5 here).

- [ ] **Step 5: Commit**

```bash
git add src/lib/n8n/payload.ts src/lib/n8n/payload.test.ts
git commit -m "fix(n8n): address completion webhooks to the requester, not the assignee

deriveRecipient returned assigned_to whenever it was set. On an AI service
order the assignee is the admin who fulfilled it, so the completion webhook
named the admin and WhatsApp would have messaged the wrong person.

Also carries the requester's name/phone/email, which the WhatsApp workflow
needs and the payload did not previously include."
```

---

## Task 4: Hide the mock wizard steps and add a submit step

**Files:**
- Modify: `src/components/draft/draftConstants.ts`
- Create: `src/components/draft/steps/StepSubmit.tsx`
- Modify: `src/app/ai/draft/page.tsx`

**Interfaces:**
- Consumes: `STEPS`, `StepKey` (existing); `DraftIntakeV1` (Task 2)
- Produces: `CLIENT_VISIBLE_STEPS`, `StepSubmit` component

- [ ] **Step 1: Add the visible-step list**

Append to `src/components/draft/draftConstants.ts`:

```ts
// ─── Client-visible steps ─────────────────────────────────────────────────────
// The middle steps (analysis/defenses/laws/drafting/review/approval) render
// mock AI output (MOCK_DEFENSES et al). Until real generation exists, the
// client sees intake + submit only. The step components stay on disk so this
// is a one-line reversal.

export const SUBMIT_STEP = { key: "submit", label: "الإرسال", num: 3 } as const;

export const CLIENT_VISIBLE_STEPS = [
  STEPS[0], // identify
  STEPS[1], // case
  SUBMIT_STEP,
] as const;

export type VisibleStepKey = (typeof CLIENT_VISIBLE_STEPS)[number]["key"];
```

- [ ] **Step 2: Create the submit step**

Create `src/components/draft/steps/StepSubmit.tsx`:

```tsx
"use client";

import { useState } from "react";
import { PaperPlaneTilt, Warning, Paperclip } from "@phosphor-icons/react";

interface Props {
  isDark: boolean;
  summary: { label: string; value: string }[];
  attachments: { name: string; size: number }[];
  notes: string;
  setNotes: (v: string) => void;
  submitting: boolean;
  errors: string[];
  onSubmit: () => void;
}

export function StepSubmit({
  isDark, summary, attachments, notes, setNotes, submitting, errors, onSubmit,
}: Props) {
  const [confirmed, setConfirmed] = useState(false);
  const card = isDark
    ? "bg-zinc-900 border border-white/[0.06] rounded-2xl"
    : "bg-white border border-zinc-200/70 rounded-2xl";

  return (
    <div className={`${card} p-5 space-y-5`} dir="rtl">
      <div>
        <h2 className={`text-[15px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>
          مراجعة وإرسال
        </h2>
        <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
          سيتولى فريق نظامي إعداد المذكرة يدوياً، وسيصلك إشعار عند جهوزيتها.
        </p>
      </div>

      <dl className="space-y-2">
        {summary.map((row) => (
          <div key={row.label} className="flex gap-3 text-[12px]">
            <dt className={isDark ? "text-zinc-500 w-32 shrink-0" : "text-zinc-400 w-32 shrink-0"}>
              {row.label}
            </dt>
            <dd className={isDark ? "text-zinc-200" : "text-zinc-800"}>{row.value || "—"}</dd>
          </div>
        ))}
      </dl>

      {attachments.length > 0 && (
        <div className="space-y-1.5">
          <p className={`text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
            المرفقات ({attachments.length})
          </p>
          {attachments.map((a) => (
            <div key={a.name} className={`flex items-center gap-2 text-[11px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
              <Paperclip size={12} /> {a.name}
            </div>
          ))}
        </div>
      )}

      <div>
        <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
          ملاحظات للفريق (اختياري)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className={`w-full rounded-xl p-3 text-[12px] border ${
            isDark ? "bg-zinc-950 border-white/[0.07] text-zinc-200" : "bg-white border-zinc-200 text-zinc-800"
          }`}
        />
      </div>

      {errors.length > 0 && (
        <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-3 space-y-1">
          {errors.map((e) => (
            <p key={e} className="flex items-center gap-1.5 text-[11px] text-red-500">
              <Warning size={12} /> {e}
            </p>
          ))}
        </div>
      )}

      <label className="flex items-start gap-2 cursor-pointer">
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" />
        <span className={`text-[11px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
          أقر بأن البيانات المدخلة صحيحة، وأوافق على معالجتها لإعداد المذكرة.
        </span>
      </label>

      <button
        onClick={onSubmit}
        disabled={!confirmed || submitting}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0B3D2E] px-6 py-3 text-[13px] font-bold text-white shadow-md disabled:opacity-40"
      >
        <PaperPlaneTilt size={15} />
        {submitting ? "جارٍ الإرسال..." : "إرسال الطلب"}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Render visible steps in the wizard**

In `src/app/ai/draft/page.tsx`:
- Change the import on line 9 to `import { CLIENT_VISIBLE_STEPS } from "@/components/draft/draftConstants";`
- Replace every `STEPS` reference in the progress stepper (lines 82, 102) with `CLIENT_VISIBLE_STEPS`
- Replace the `s.currentStepIndex < STEPS.length - 1` guard on line 127 with `s.step !== "submit"`
- Delete the render lines for `analysis`, `defenses`, `laws`, `drafting`, `review`, `approval` (lines 114-119) and add:

```tsx
{s.step === "submit" && (
  <StepSubmit
    isDark={isDark}
    summary={s.buildSummary()}
    attachments={s.uploadedAttachments}
    notes={s.submitNotes}
    setNotes={s.setSubmitNotes}
    submitting={s.submitting}
    errors={s.submitErrors}
    onSubmit={s.submitOrder}
  />
)}
```

(`buildSummary`, `uploadedAttachments`, `submitNotes`, `setSubmitNotes`, `submitting`, `submitErrors`, and `submitOrder` are added to the hook in Task 5.)

- [ ] **Step 4: Verify the wizard renders three steps**

Run: `npm run dev`, open `http://localhost:3000/ai/draft`, choose a route in the pre-step.
Expected: stepper shows **التحديد · القضية · الإرسال** only. No console errors. (`submitOrder` is not wired yet — the button will not do anything until Task 5.)

- [ ] **Step 5: Commit**

```bash
git add src/components/draft/draftConstants.ts src/components/draft/steps/StepSubmit.tsx src/app/ai/draft/page.tsx
git commit -m "feat(draft): hide mock AI steps from the client and add a submit step"
```

---

## Task 5: Wire submission — create a real order

**Files:**
- Create: `src/lib/services/serviceOrders.ts`
- Modify: `src/hooks/useDraftState.ts`

**Interfaces:**
- Consumes: `validateDraftIntake`, `SERVICE_TYPE_BY_KEY`, `SERVICE_TITLE_AR`, `OrderAttachment` (Task 2); `uploadDocumentFile` from `src/lib/services/documentService.ts`
- Produces:
  - `interface ServiceOrder { id, type, title, status, created_at, updated_at, metadata }`
  - `createServiceOrder(args): Promise<ServiceOrder>`
  - `listMyServiceOrders(): Promise<ServiceOrder[]>`
  - `getServiceOrder(id): Promise<ServiceOrder | null>`
  - Hook additions: `buildSummary()`, `uploadedAttachments`, `submitNotes`, `setSubmitNotes`, `submitting`, `submitErrors`, `submitOrder()`

- [ ] **Step 1: Create the order service**

Create `src/lib/services/serviceOrders.ts`:

```ts
"use client";

import { apiGet, apiMutate } from "@/lib/services/api";
import {
  SERVICE_TYPE_BY_KEY, SERVICE_TITLE_AR,
  type ServiceKey, type OrderAttachment,
} from "@/lib/services/orderIntake";

export interface ServiceOrderDeliverable {
  documentId: string;
  fileName: string;
  notes?: string;
  deliveredAt: string;
  deliveredBy: string;
}

export interface ServiceOrder {
  id: string;
  type: string;
  title: string;
  description: string;
  status: "pending_assignment" | "assigned" | "in_review" | "completed" | "cancelled";
  created_at: string;
  updated_at: string;
  metadata: {
    service?: ServiceKey;
    serviceTitleAr?: string;
    schemaVersion?: number;
    intake?: Record<string, unknown>;
    attachments?: OrderAttachment[];
    deliverable?: ServiceOrderDeliverable;
    cancelReason?: string;
  };
}

export async function createServiceOrder(args: {
  service: ServiceKey;
  title: string;
  description: string;
  intake: Record<string, unknown>;
  attachments: OrderAttachment[];
  requester: { name?: string; phone?: string; email?: string };
}): Promise<ServiceOrder> {
  const res = await apiMutate<{ data: ServiceOrder }>("/api/v1/service-requests", "POST", {
    title: args.title,
    description: args.description,
    type: SERVICE_TYPE_BY_KEY[args.service],
    receiver: "ai_workspace",
    status: "pending_assignment",
    sourcePath: `/ai/${args.service === "legal_opinion" ? "legal-opinion" : args.service}`,
    payment: { amount: 0, status: "not_required" },
    requester: args.requester,
    metadata: {
      service: args.service,
      serviceTitleAr: SERVICE_TITLE_AR[args.service],
      schemaVersion: 1,
      intake: args.intake,
      attachments: args.attachments,
    },
  });
  return res.data;
}

export async function listMyServiceOrders(): Promise<ServiceOrder[]> {
  try {
    const res = await apiGet<{ data: ServiceOrder[] }>(
      "/api/v1/service-requests?receiver=ai_workspace",
    );
    return res.data ?? [];
  } catch {
    return [];
  }
}

export async function getServiceOrder(id: string): Promise<ServiceOrder | null> {
  try {
    const res = await apiGet<{ data: ServiceOrder }>(`/api/v1/service-requests/${id}`);
    return res.data ?? null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Add submit state to the hook**

In `src/hooks/useDraftState.ts`, add these imports and state, and include every new name in the returned object (the hook already returns a flat object at line 153):

```ts
import { validateDraftIntake, type OrderAttachment } from "@/lib/services/orderIntake";
import { createServiceOrder } from "@/lib/services/serviceOrders";
import { uploadDocumentFile } from "@/lib/services/documentService";
import { createClient as createBrowserClient } from "@/lib/supabase/client";

// ── submit state ──────────────────────────────────────────────────────────
const [submitNotes, setSubmitNotes]   = useState("");
const [submitting, setSubmitting]     = useState(false);
const [submitErrors, setSubmitErrors] = useState<string[]>([]);
const [uploadedAttachments, setUploadedAttachments] = useState<OrderAttachment[]>([]);

function buildSummary(): { label: string; value: string }[] {
  return [
    { label: "صفة الموكل", value: clientRole === "plaintiff" ? "مدعٍ" : clientRole === "defendant" ? "مدعى عليه" : "" },
    { label: "نوع المذكرة", value: memoType },
    { label: "التصنيف", value: memoSubType },
    { label: "الفرع القانوني", value: legalBranch },
    { label: "الوقائع", value: caseText.slice(0, 120) + (caseText.length > 120 ? "…" : "") },
  ];
}

function buildIntake(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    service: "draft",
    clientRole, memoType, memoSubType, legalBranch, caseText,
    parties: { one: partyOne, two: partyTwo },
    judgment: {
      number: judgmentNumber, court: judgmentCourt, date: judgmentDate,
      text: judgmentText, reasons: judgmentReasons,
    },
    lawyerNotes: [lawyerNotes, submitNotes].filter(Boolean).join("\n\n"),
    attachments: uploadedAttachments,
  };
}

async function submitOrder(): Promise<void> {
  setSubmitErrors([]);
  const intake = buildIntake();
  const check = validateDraftIntake(intake);
  if (!check.ok) { setSubmitErrors(check.errors); return; }

  setSubmitting(true);
  try {
    const supabase = createBrowserClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = user
      ? await supabase.from("profiles").select("display_name, phone, email").eq("id", user.id).single()
      : { data: null };

    const order = await createServiceOrder({
      service: "draft",
      title: `${memoType || "مذكرة"} — ${legalBranch || "عام"}`,
      description: caseText.slice(0, 200),
      intake: check.value as unknown as Record<string, unknown>,
      attachments: uploadedAttachments,
      requester: {
        name: profile?.display_name ?? undefined,
        phone: profile?.phone ?? undefined,
        email: profile?.email ?? undefined,
      },
    });
    window.location.href = `/ai/orders/${order.id}`;
  } catch (err) {
    setSubmitErrors([(err as Error).message || "تعذّر إرسال الطلب — حاول مجدداً"]);
  } finally {
    setSubmitting(false);
  }
}

async function attachFile(file: File): Promise<void> {
  const doc = await uploadDocumentFile(file);
  setUploadedAttachments((prev) => [
    ...prev,
    { documentId: doc.id, name: doc.file_name, size: doc.size_bytes ?? 0 },
  ]);
}
```

Add to the hook's return object: `submitNotes, setSubmitNotes, submitting, submitErrors, uploadedAttachments, attachFile, buildSummary, submitOrder`.

- [ ] **Step 3: Make the step-transition guard allow `submit`**

In the same file, `nextStep()` currently walks `STEPS`. Change it to walk `CLIENT_VISIBLE_STEPS` (imported from `draftConstants`) so `case` advances to `submit`, and remove the `setTimeout(2000)` fake-processing delay at line 113 — there is no processing to simulate.

- [ ] **Step 4: Verify end to end**

Run `npm run dev`, sign in, go to `/ai/draft`, fill التحديد and القضية, reach الإرسال, tick the confirmation, submit.
Expected: redirect to `/ai/orders/<uuid>` (404 until Task 7 — that is expected here). Confirm the row exists:

```sql
select id, type, receiver, status, metadata->>'service'
from public.service_requests
where receiver = 'ai_workspace' order by created_at desc limit 1;
```

Expected: one row, `type='ai_draft'`, `status='pending_assignment'`, `service='draft'`.

- [ ] **Step 5: Verify validation rejects a thin submission**

Repeat with الوقائع under 30 characters.
Expected: red error box reads "الوقائع قصيرة جداً — الحد الأدنى 30 حرفاً"; no new DB row.

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/serviceOrders.ts src/hooks/useDraftState.ts
git commit -m "feat(draft): submit the wizard as a real service_requests order"
```

---

## Task 6: Deliverable download endpoint

Ownership is checked in one auditable place rather than implied by a storage path.

**Files:**
- Create: `src/app/api/v1/service-requests/[id]/deliverable/route.ts`

**Interfaces:**
- Consumes: `metadata.deliverable.documentId` (written in Task 8)
- Produces: `GET /api/v1/service-requests/[id]/deliverable` → `{ url: string, fileName: string }`

- [ ] **Step 1: Write the route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/service-requests/[id]/deliverable
 * Returns a short-lived signed URL for the order's deliverable.
 * The caller must own the order, be its assignee, or be an admin.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const admin = await createServiceClient();

  const { data: order } = await admin
    .from("service_requests")
    .select("id, requester_user_id, assigned_to, status, metadata")
    .eq("id", id)
    .maybeSingle();

  if (!order) return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 });

  const { data: profile } = await admin
    .from("profiles").select("user_type").eq("id", user.id).single();

  const allowed =
    order.requester_user_id === user.id ||
    order.assigned_to === user.id ||
    profile?.user_type === "admin";

  if (!allowed) return NextResponse.json({ error: "غير مصرح" }, { status: 403 });

  const deliverable = (order.metadata as Record<string, unknown> | null)?.deliverable as
    | { documentId?: string; fileName?: string }
    | undefined;

  if (!deliverable?.documentId) {
    return NextResponse.json({ error: "لا يوجد مستند بعد" }, { status: 404 });
  }

  const { data: attachment } = await admin
    .from("attachments").select("storage_path, file_name").eq("id", deliverable.documentId).maybeSingle();

  if (!attachment?.storage_path) {
    return NextResponse.json({ error: "المستند غير متاح" }, { status: 404 });
  }

  const { data: signed, error: signErr } = await admin.storage
    .from("documents").createSignedUrl(attachment.storage_path as string, 300);

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json({ error: "تعذّر إنشاء رابط التحميل" }, { status: 500 });
  }

  return NextResponse.json({
    url: signed.signedUrl,
    fileName: deliverable.fileName ?? attachment.file_name ?? "document",
  });
}
```

- [ ] **Step 2: Verify unauthenticated access is refused**

Run: `curl -i http://localhost:3000/api/v1/service-requests/any-id/deliverable`
Expected: `401` with `{"error":"غير مصرح"}`.

- [ ] **Step 3: Verify a missing deliverable returns 404**

Sign in as the client who submitted in Task 5, then in the browser console:
```js
await fetch('/api/v1/service-requests/<your-order-id>/deliverable').then(r => [r.status, r.json()])
```
Expected: `404` with `لا يوجد مستند بعد` — the order has no deliverable yet.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/v1/service-requests/\[id\]/deliverable/route.ts
git commit -m "feat(orders): ownership-checked signed URL endpoint for deliverables"
```

---

## Task 7: Client order tracking pages

**Files:**
- Create: `src/app/ai/orders/page.tsx`
- Create: `src/app/ai/orders/[id]/page.tsx`

**Interfaces:**
- Consumes: `listMyServiceOrders`, `getServiceOrder`, `ServiceOrder` (Task 5); the deliverable endpoint (Task 6)
- Produces: `ORDER_STATUS_AR` exported from `src/lib/services/serviceOrders.ts`

- [ ] **Step 1: Add the status label map**

Append to `src/lib/services/serviceOrders.ts`:

```ts
export const ORDER_STATUS_AR: Record<ServiceOrder["status"], { label: string; tone: string }> = {
  pending_assignment: { label: "بانتظار الاستلام", tone: "amber" },
  assigned:           { label: "قيد التنفيذ",      tone: "blue"  },
  in_review:          { label: "قيد التنفيذ",      tone: "blue"  },
  completed:          { label: "جاهز",             tone: "emerald" },
  cancelled:          { label: "ملغى",             tone: "zinc"  },
};
```

- [ ] **Step 2: Create the list page**

Create `src/app/ai/orders/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import { listMyServiceOrders, ORDER_STATUS_AR, type ServiceOrder } from "@/lib/services/serviceOrders";

const TONE: Record<string, string> = {
  amber: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  blue: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  emerald: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  zinc: "bg-zinc-500/10 text-zinc-500 border-zinc-500/20",
};

export default function OrdersPage() {
  const { isDark } = useTheme();
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listMyServiceOrders().then((o) => { setOrders(o); setLoading(false); });
  }, []);

  const card = isDark
    ? "bg-zinc-900 border border-white/[0.06] rounded-2xl"
    : "bg-white border border-zinc-200/70 rounded-2xl";

  return (
    <div className="p-5 md:p-7 max-w-4xl mx-auto space-y-4" dir="rtl">
      <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>طلباتي</h1>

      {loading && <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>جارٍ التحميل...</p>}

      {!loading && orders.length === 0 && (
        <div className={`${card} p-8 text-center`}>
          <p className={`text-[13px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>لا توجد طلبات بعد.</p>
        </div>
      )}

      {orders.map((o) => {
        const s = ORDER_STATUS_AR[o.status] ?? ORDER_STATUS_AR.pending_assignment;
        return (
          <Link key={o.id} href={`/ai/orders/${o.id}`} className={`${card} p-4 flex items-center gap-3 hover:shadow-md transition-shadow`}>
            <div className="flex-1 min-w-0">
              <p className={`text-[13px] font-semibold truncate ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>{o.title}</p>
              <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                {o.metadata?.serviceTitleAr} · {new Date(o.created_at).toLocaleDateString("ar-SA")}
              </p>
            </div>
            <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${TONE[s.tone]}`}>{s.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Create the detail page**

Create `src/app/ai/orders/[id]/page.tsx`:

```tsx
"use client";

import { useEffect, useState, use } from "react";
import { DownloadSimple } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { getServiceOrder, ORDER_STATUS_AR, type ServiceOrder } from "@/lib/services/serviceOrders";

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { isDark } = useTheme();
  const [order, setOrder] = useState<ServiceOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloadErr, setDownloadErr] = useState("");

  useEffect(() => {
    getServiceOrder(id).then((o) => { setOrder(o); setLoading(false); });
  }, [id]);

  async function download() {
    setDownloadErr("");
    const res = await fetch(`/api/v1/service-requests/${id}/deliverable`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setDownloadErr(body.error ?? "تعذّر التحميل");
      return;
    }
    const { url } = await res.json();
    window.open(url, "_blank");
  }

  const card = isDark
    ? "bg-zinc-900 border border-white/[0.06] rounded-2xl"
    : "bg-white border border-zinc-200/70 rounded-2xl";

  if (loading) return <div className="p-7 text-[12px]" dir="rtl">جارٍ التحميل...</div>;
  if (!order) return <div className="p-7 text-[12px]" dir="rtl">الطلب غير موجود.</div>;

  const s = ORDER_STATUS_AR[order.status] ?? ORDER_STATUS_AR.pending_assignment;
  const deliverable = order.metadata?.deliverable;

  return (
    <div className="p-5 md:p-7 max-w-3xl mx-auto space-y-4" dir="rtl">
      <div>
        <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>{order.title}</h1>
        <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
          {order.metadata?.serviceTitleAr} · الحالة: {s.label}
        </p>
      </div>

      {order.status === "completed" && deliverable && (
        <div className={`${card} p-5 space-y-3`}>
          <p className={`text-[13px] font-semibold ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>المستند جاهز</p>
          {deliverable.notes && (
            <p className={`text-[12px] leading-[1.9] ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>{deliverable.notes}</p>
          )}
          <button onClick={download} className="flex items-center gap-2 rounded-xl bg-[#0B3D2E] px-5 py-2.5 text-[12px] font-bold text-white">
            <DownloadSimple size={14} /> تحميل {deliverable.fileName}
          </button>
          {downloadErr && <p className="text-[11px] text-red-500">{downloadErr}</p>}
        </div>
      )}

      {order.status === "cancelled" && (
        <div className={`${card} p-5`}>
          <p className="text-[12px] text-red-500">تم إلغاء الطلب. {order.metadata?.cancelReason ?? ""}</p>
        </div>
      )}

      {["pending_assignment", "assigned", "in_review"].includes(order.status) && (
        <div className={`${card} p-5`}>
          <p className={`text-[12px] ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
            طلبك قيد التنفيذ لدى فريق نظامي. سيصلك إشعار فور جهوزية المستند.
          </p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verify both pages**

Visit `/ai/orders`.
Expected: the order from Task 5 is listed with badge **بانتظار الاستلام**. Click it → detail page shows the "قيد التنفيذ" panel and no download button.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/serviceOrders.ts src/app/ai/orders
git commit -m "feat(orders): client order list and detail with deliverable download"
```

---

## Task 8: Admin queue API

**Files:**
- Create: `src/app/api/v1/admin/service-orders/route.ts`
- Create: `src/app/api/v1/admin/service-orders/[id]/route.ts`

**Interfaces:**
- Consumes: `requireAdmin`, `createServiceClient`, `recordEvent`, `RequestEvent`, `recordNotification`, `dispatchToN8n`, `buildWebhookPayload` (with `requesterProfile` from Task 3)
- Produces:
  - `GET /api/v1/admin/service-orders?status=&service=` → `{ success, data: (ServiceOrder & { profile })[] }`
  - `PATCH /api/v1/admin/service-orders/[id]` body `{ action: "claim" | "deliver" | "cancel", documentId?, fileName?, notes?, reason? }`

- [ ] **Step 1: Write the list route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/access-control";

/**
 * GET /api/v1/admin/service-orders — the AI service fulfillment queue.
 * Query: ?status=pending_assignment|in_review|completed|cancelled  ?service=draft|...
 * service_requests has no admin RLS policy, so this uses the service-role
 * client behind requireAdmin().
 */
export async function GET(request: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.isAdmin) {
    return NextResponse.json({ error: gate.error }, { status: gate.status ?? 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const service = searchParams.get("service");

  const admin = await createServiceClient();
  let query = admin
    .from("service_requests")
    .select("*")
    .eq("receiver", "ai_workspace")
    .order("created_at", { ascending: false })
    .limit(200);

  if (status) query = query.eq("status", status);
  if (service) query = query.eq("metadata->>service", service);

  const { data: rows, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // No PostgREST FK from service_requests to profiles — enrich separately.
  const orders = rows ?? [];
  const userIds = [...new Set(orders.map((o) => o.requester_user_id).filter(Boolean))] as string[];
  let profileMap = new Map<string, Record<string, unknown>>();
  if (userIds.length > 0) {
    const { data: profs } = await admin
      .from("profiles").select("id, display_name, email, phone, user_type").in("id", userIds);
    profileMap = new Map((profs ?? []).map((p) => [p.id as string, p]));
  }

  return NextResponse.json({
    success: true,
    data: orders.map((o) => ({ ...o, profile: profileMap.get(o.requester_user_id as string) ?? null })),
  });
}
```

- [ ] **Step 2: Write the action route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/access-control";
import { recordEvent, RequestEvent } from "@/lib/events";
import { recordNotification } from "@/lib/notify";
import { dispatchToN8n } from "@/lib/n8n/dispatch";
import { buildWebhookPayload } from "@/lib/n8n/payload";

/**
 * PATCH /api/v1/admin/service-orders/[id]
 * Body: { action: "claim" | "deliver" | "cancel", documentId?, fileName?, notes?, reason? }
 * Side-channels (event, notification, n8n) are best-effort and never break the write.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const gate = await requireAdmin();
  if (!gate.isAdmin) {
    return NextResponse.json({ error: gate.error }, { status: gate.status ?? 403 });
  }

  let body: {
    action?: "claim" | "deliver" | "cancel";
    documentId?: string; fileName?: string; notes?: string; reason?: string;
  };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 }); }

  const admin = await createServiceClient();
  const { data: order } = await admin
    .from("service_requests").select("*").eq("id", id).eq("receiver", "ai_workspace").maybeSingle();

  if (!order) return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 });
  if (order.status === "completed" || order.status === "cancelled") {
    return NextResponse.json({ error: "تم البت في هذا الطلب مسبقًا" }, { status: 409 });
  }

  const nowIso = new Date().toISOString();
  const metadata = (order.metadata ?? {}) as Record<string, unknown>;
  let patch: Record<string, unknown>;
  let notifyTitle = "";
  let eventName: string = RequestEvent.SERVICE_REQUEST_STATUS_CHANGED;

  if (body.action === "claim") {
    patch = { status: "in_review", assigned_to: gate.userId, updated_at: nowIso };
    notifyTitle = "بدأ العمل على طلبك";
  } else if (body.action === "deliver") {
    if (!body.documentId || !body.fileName) {
      return NextResponse.json({ error: "المستند مطلوب" }, { status: 400 });
    }
    patch = {
      status: "completed", updated_at: nowIso,
      metadata: {
        ...metadata,
        deliverable: {
          documentId: body.documentId, fileName: body.fileName,
          notes: body.notes ?? "", deliveredAt: nowIso, deliveredBy: gate.userId,
        },
      },
    };
    notifyTitle = "طلبك جاهز";
    eventName = RequestEvent.SERVICE_REQUEST_COMPLETED;
  } else if (body.action === "cancel") {
    patch = {
      status: "cancelled", updated_at: nowIso,
      metadata: { ...metadata, cancelReason: body.reason ?? "" },
    };
    notifyTitle = "تم إلغاء طلبك";
  } else {
    return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 });
  }

  const { data: updated, error } = await admin
    .from("service_requests").update(patch).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ── side-channels: best-effort, never break the write ──────────────────────
  try {
    await recordEvent({ supabase: admin, requestId: id, event: eventName, actorUserId: gate.userId ?? undefined, actorName: "الإدارة" });
  } catch (e) { console.error("[service-orders] recordEvent failed:", e); }

  if (order.requester_user_id) {
    await recordNotification({
      userId: order.requester_user_id as string,
      title: notifyTitle,
      body: (updated.title as string) ?? "",
      href: `/ai/orders/${id}`,
    });
  }

  try {
    const { data: requesterProfile } = await admin
      .from("profiles").select("id, display_name, phone, email, user_type")
      .eq("id", order.requester_user_id as string).maybeSingle();
    const { data: actorProfile } = await admin
      .from("profiles").select("id, display_name, user_type").eq("id", gate.userId as string).maybeSingle();

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const payload = buildWebhookPayload({
      event: eventName, timestamp: nowIso,
      request: updated as unknown as Record<string, unknown>,
      actor: actorProfile as unknown as Record<string, unknown> | null,
      requesterProfile: requesterProfile as unknown as Record<string, unknown> | null,
    });
    payload.data = {
      ...payload.data,
      service: (metadata.service as string) ?? "draft",
      serviceTitleAr: (metadata.serviceTitleAr as string) ?? "",
      orderUrl: `${appUrl}/ai/orders/${id}`,
      ...(body.action === "deliver"
        ? { deliverable: { fileName: body.fileName, notes: body.notes ?? "" } }
        : {}),
    };
    await dispatchToN8n(eventName, payload);
  } catch (e) { console.error("[service-orders] dispatchToN8n failed:", e); }

  return NextResponse.json({ success: true, data: updated });
}
```

- [ ] **Step 3: Verify the admin gate**

Signed in as a non-admin, in the browser console:
```js
await fetch('/api/v1/admin/service-orders').then(r => r.status)
```
Expected: `403`.

- [ ] **Step 4: Verify the queue lists the order**

Sign in as an admin (`profiles.user_type='admin'`), then:
```js
await fetch('/api/v1/admin/service-orders').then(r => r.json())
```
Expected: `data` contains the Task 5 order with a non-null `profile`.

- [ ] **Step 5: Verify double-delivery is rejected**

```js
const id = '<order-id>';
await fetch(`/api/v1/admin/service-orders/${id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({action:'cancel', reason:'اختبار'}) }).then(r=>r.status);
await fetch(`/api/v1/admin/service-orders/${id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({action:'cancel', reason:'مرة أخرى'}) }).then(r=>r.status);
```
Expected: first `200`, second `409`.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/v1/admin/service-orders
git commit -m "feat(admin): service order fulfillment queue API with claim/deliver/cancel"
```

---

## Task 9: Admin queue UI

**Files:**
- Create: `src/app/dashboard/admin/service-orders/page.tsx`

**Interfaces:**
- Consumes: the Task 8 endpoints; `uploadDocumentFile` from `documentService`
- Produces: nothing consumed by later tasks

- [ ] **Step 1: Create the page**

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { uploadDocumentFile } from "@/lib/services/documentService";

interface AdminOrder {
  id: string; title: string; description: string; status: string;
  created_at: string; metadata: Record<string, unknown>;
  profile: { display_name?: string; email?: string; phone?: string } | null;
}

const STATUSES = [
  { key: "", label: "الكل" },
  { key: "pending_assignment", label: "جديدة" },
  { key: "in_review", label: "قيد التنفيذ" },
  { key: "completed", label: "مُسلّمة" },
  { key: "cancelled", label: "ملغاة" },
];

export default function AdminServiceOrdersPage() {
  const { isDark } = useTheme();
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState<AdminOrder | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/v1/admin/service-orders${filter ? `?status=${filter}` : ""}`);
    const body = await res.json();
    setOrders(body.data ?? []);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function act(id: string, payload: Record<string, unknown>) {
    setBusy(true); setErr("");
    const res = await fetch(`/api/v1/admin/service-orders/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    if (!res.ok) setErr((await res.json().catch(() => ({}))).error ?? "فشل الإجراء");
    else { setOpen(null); setNotes(""); await load(); }
    setBusy(false);
  }

  async function deliver(order: AdminOrder, file: File) {
    setBusy(true); setErr("");
    try {
      const doc = await uploadDocumentFile(file, { requestId: order.id });
      await act(order.id, { action: "deliver", documentId: doc.id, fileName: doc.file_name, notes });
    } catch (e) {
      setErr((e as Error).message || "تعذّر رفع الملف"); setBusy(false);
    }
  }

  const card = isDark ? "bg-zinc-900 border border-white/[0.06] rounded-2xl" : "bg-white border border-zinc-200/70 rounded-2xl";

  return (
    <div className="p-5 md:p-7 space-y-4" dir="rtl">
      <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>طلبات الخدمات</h1>

      <div className="flex gap-2 flex-wrap">
        {STATUSES.map((s) => (
          <button key={s.key} onClick={() => setFilter(s.key)}
            className={`rounded-full px-3 py-1 text-[11px] font-semibold border ${
              filter === s.key ? "bg-[#0B3D2E] text-white border-transparent"
                : isDark ? "border-white/10 text-zinc-400" : "border-zinc-200 text-zinc-500"}`}>
            {s.label}
          </button>
        ))}
      </div>

      {err && <p className="text-[12px] text-red-500">{err}</p>}

      <div className="space-y-2">
        {orders.map((o) => (
          <div key={o.id} className={`${card} p-4`}>
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className={`text-[13px] font-semibold ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>{o.title}</p>
                <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                  {o.profile?.display_name ?? "—"} · {o.profile?.phone ?? "لا يوجد جوال"} · {new Date(o.created_at).toLocaleDateString("ar-SA")}
                </p>
              </div>
              <button onClick={() => setOpen(open?.id === o.id ? null : o)}
                className={`text-[11px] font-semibold ${isDark ? "text-zinc-300" : "text-zinc-600"}`}>
                {open?.id === o.id ? "إغلاق" : "التفاصيل"}
              </button>
            </div>

            {open?.id === o.id && (
              <div className="mt-4 space-y-3 border-t pt-4 border-white/[0.06]">
                <pre className={`text-[11px] leading-[1.9] whitespace-pre-wrap p-3 rounded-xl overflow-x-auto ${
                  isDark ? "bg-zinc-950 text-zinc-400" : "bg-slate-50 text-slate-600"}`}>
                  {JSON.stringify(o.metadata?.intake ?? {}, null, 2)}
                </pre>

                {o.status === "pending_assignment" && (
                  <button disabled={busy} onClick={() => act(o.id, { action: "claim" })}
                    className="rounded-xl bg-[#0B3D2E] px-4 py-2 text-[12px] font-bold text-white disabled:opacity-40">
                    استلام
                  </button>
                )}

                {o.status === "in_review" && (
                  <div className="space-y-2">
                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                      placeholder="ملاحظات للعميل (اختياري)"
                      className={`w-full rounded-xl p-2.5 text-[12px] border ${
                        isDark ? "bg-zinc-950 border-white/[0.07] text-zinc-200" : "bg-white border-zinc-200"}`} />
                    <input type="file" disabled={busy}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) deliver(o, f); }}
                      className={`block text-[11px] ${isDark ? "text-zinc-400" : "text-zinc-600"}`} />
                    <button disabled={busy} onClick={() => act(o.id, { action: "cancel", reason: notes })}
                      className="rounded-xl border border-red-500/30 px-4 py-2 text-[12px] font-bold text-red-500 disabled:opacity-40">
                      إلغاء الطلب
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {orders.length === 0 && (
          <div className={`${card} p-8 text-center text-[13px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>لا توجد طلبات.</div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the full fulfillment round trip**

As admin, open `/dashboard/admin/service-orders`.
Expected: the Task 5 order appears. Click التفاصيل → the intake JSON renders → **استلام** flips it to قيد التنفيذ → pick a small `.docx` → it uploads and the order becomes مُسلّمة.

- [ ] **Step 3: Verify the client sees it**

Sign back in as the client, open `/ai/orders/<id>`.
Expected: status **جاهز**, notes shown if entered, and **تحميل** opens the file.

- [ ] **Step 4: Verify the audit trail**

```sql
select event, actor_name, created_at from public.request_events
where request_id = '<order-id>' order by created_at;
```
Expected: `service_request.created`, then `service_request.status_changed` (claim), then `service_request.completed`.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/admin/service-orders
git commit -m "feat(admin): service order queue UI with claim, deliver and cancel"
```

---

## Task 10: n8n delivery-status callback

**Files:**
- Create: `src/app/api/v1/n8n/callback/route.ts`

**Interfaces:**
- Consumes: `N8N_WEBHOOK_SECRET`
- Produces: `POST /api/v1/n8n/callback`

- [ ] **Step 1: Write the route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { recordEvent } from "@/lib/events";

const VALID_STATUSES = new Set(["sent", "failed", "read"]);

/**
 * POST /api/v1/n8n/callback — n8n reports outbound delivery status.
 * Authenticated by the shared X-Webhook-Secret (the same value the app sends
 * outbound), NOT by a user session: n8n has no session.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!secret || request.headers.get("x-webhook-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { orderId?: string; channel?: string; status?: string; messageId?: string; error?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }

  const orderId = typeof body.orderId === "string" ? body.orderId : "";
  const status = typeof body.status === "string" ? body.status : "";
  const channel = typeof body.channel === "string" ? body.channel : "whatsapp";

  if (!orderId || !VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: "orderId and a valid status are required" }, { status: 400 });
  }

  const admin = await createServiceClient();
  const { data: order } = await admin
    .from("service_requests").select("id").eq("id", orderId).maybeSingle();
  if (!order) return NextResponse.json({ error: "unknown order" }, { status: 404 });

  await recordEvent({
    supabase: admin,
    requestId: orderId,
    event: `notification.${channel}_${status}`,
    actorName: "n8n",
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Verify a bad secret is refused**

```bash
curl -i -X POST http://localhost:3000/api/v1/n8n/callback \
  -H "Content-Type: application/json" -H "X-Webhook-Secret: wrong" \
  -d '{"orderId":"x","status":"sent"}'
```
Expected: `401`.

- [ ] **Step 3: Verify a valid callback records an event**

Set `N8N_WEBHOOK_SECRET=devsecret` in `.env.local`, restart, then:
```bash
curl -i -X POST http://localhost:3000/api/v1/n8n/callback \
  -H "Content-Type: application/json" -H "X-Webhook-Secret: devsecret" \
  -d '{"orderId":"<order-id>","channel":"whatsapp","status":"sent","messageId":"m1"}'
```
Expected: `200 {"ok":true}`, and `request_events` gains a `notification.whatsapp_sent` row.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/v1/n8n/callback
git commit -m "feat(n8n): callback endpoint recording WhatsApp delivery status"
```

---

## Task 11: Owner-facing webhook contract

This is the document the owner builds his n8n workflow against.

**Files:**
- Create: `n8n/CONTRACT-service-orders.md`

- [ ] **Step 1: Write the contract**

````markdown
# عقد الويب هوك — طلبات الخدمات (Service Orders)

## ١. ما الذي يرسله التطبيق

عند ضغط الأدمن على "تسليم"، يرسل التطبيق:

```
POST {N8N_WEBHOOK_BASE_URL}/request-completed
Content-Type: application/json
X-Webhook-Secret: {N8N_WEBHOOK_SECRET}
```

المهلة ٥ ثوانٍ. الإرسال best-effort — فشله لا يعطّل التسليم.

```json
{
  "event": "service_request.completed",
  "entity":    { "id": "uuid", "type": "ai_draft", "status": "completed" },
  "actor":     { "id": "uuid", "name": "الإدارة", "role": "admin" },
  "recipient": { "id": "uuid", "role": "individual",
                 "name": "محمد العتيبي",
                 "phone": "+966500000000",
                 "email": "m@example.com" },
  "payment":   { "amount": 0, "status": "not_required" },
  "timestamp": "2026-08-14T09:12:00.000Z",
  "data": {
    "service": "draft",
    "serviceTitleAr": "الصائغ القانوني",
    "title": "تحرير دعوى — عمالي",
    "orderUrl": "https://nezamy.sa/ai/orders/uuid",
    "deliverable": { "fileName": "مذكرة.docx", "notes": "..." }
  }
}
```

### ملاحظات مهمة

- **`recipient.phone` قد يكون `undefined`** (مستخدمو جوجل بلا رقم). تحقق منه قبل فرع الواتساب.
- **لا يوجد رابط تحميل في الحمولة، ولا تضع واحداً في الرسالة.** الروابط الموقّعة تنتهي خلال ٥ دقائق، والدائمة تسريب لمستند قانوني خاص. أرسل `orderUrl` فقط.
- `entity.type` يميّز الخدمة: `ai_draft` · `ai_contracts` · `ai_wargaming` · `ai_legal_opinion`.

### رسالة واتساب مقترحة

```
مرحباً {{recipient.name}} 👋
طلبك "{{data.title}}" — {{data.serviceTitleAr}} أصبح جاهزاً.
حمّله من حسابك: {{data.orderUrl}}
```

## ٢. ما الذي يجب أن يرجع

### أ. الرد الفوري

أرجع `200` مع `{"ok": true}`. التطبيق يقرأ حالة HTTP فقط.

### ب. تقرير حالة الإرسال (اختياري لكن موصى به)

بعد محاولة الإرسال، أبلغ التطبيق ليظهر للأدمن:

```
POST https://nezamy.sa/api/v1/n8n/callback
Content-Type: application/json
X-Webhook-Secret: {N8N_WEBHOOK_SECRET}

{ "orderId":   "{{entity.id}}",
  "channel":   "whatsapp",
  "status":    "sent" | "failed" | "read",
  "messageId": "معرّف رسالة Evolution",
  "error":     "نص الخطأ عند الفشل" }
```

| الرد | المعنى |
|---|---|
| `200 {"ok":true}` | تم التسجيل |
| `400` | `orderId` مفقود أو `status` غير صالح |
| `401` | `X-Webhook-Secret` خاطئ |
| `404` | لا يوجد طلب بهذا المعرّف |

بدون هذه الخطوة، فشل رسالة الواتساب لن يظهر لأحد.

## ٣. متغيرات البيئة

| المتغير | أين | القيمة |
|---|---|---|
| `N8N_WEBHOOK_BASE_URL` | Next.js `.env.local` | جذر الويب هوك، مثل `https://n8n.example.com/webhook` |
| `N8N_WEBHOOK_SECRET` | الطرفان | نفس السر في الاتجاهين |
| `EVOLUTION_API_URL` / `_KEY` / `_INSTANCE_NAME` | n8n | إرسال الواتساب |

> إن كان `N8N_WEBHOOK_BASE_URL` غير مضبوط، فإن `dispatchToN8n` لا يجري أي اتصال شبكي إطلاقاً — النظام يعمل بصمت بلا إشعارات.
````

- [ ] **Step 2: Commit**

```bash
git add n8n/CONTRACT-service-orders.md
git commit -m "docs(n8n): webhook contract for service order completion"
```

---

## Task 12: Smoke routes and manual QA checklist

**Files:**
- Modify: `scripts/smoke-routes.mjs`
- Modify: `DEPLOY_AND_SMOKETEST_RUNBOOK.md`

- [ ] **Step 1: Read the existing smoke script to match its route-list format**

Run: `head -40 scripts/smoke-routes.mjs`

- [ ] **Step 2: Add the new routes to its list**

Add, in the same shape the file already uses:
`/ai/orders`, `/dashboard/admin/service-orders`.

- [ ] **Step 3: Run the smoke test**

Run: `npm test`
Expected: both new routes report a non-5xx status (a redirect to login is a pass — they are auth-gated).

- [ ] **Step 4: Append the QA checklist to the runbook**

```markdown
## طلبات الخدمات اليدوية — فحص يدوي

- [ ] عميل: `/ai/draft` → ٣ خطوات فقط (التحديد · القضية · الإرسال)
- [ ] وقائع أقل من ٣٠ حرفاً → رسالة خطأ، ولا يُنشأ صف
- [ ] إرسال ناجح → تحويل إلى `/ai/orders/<id>` بحالة "بانتظار الاستلام"
- [ ] أدمن: الطلب يظهر في `/dashboard/admin/service-orders` مع اسم وجوال العميل
- [ ] "استلام" → الحالة "قيد التنفيذ"، و`assigned_to` = الأدمن
- [ ] رفع ملف → الحالة "مُسلّمة"
- [ ] عميل: `/ai/orders/<id>` → "جاهز" وزر التحميل يفتح الملف
- [ ] `request_events` يعرض: created → status_changed → completed
- [ ] الجرس يعرض إشعار "طلبك جاهز"
- [ ] سجلّات الخادم تُظهر حمولة `request-completed` و`recipient.id` = **العميل** لا الأدمن
- [ ] محاولة تسليم مرتين → `409`
- [ ] غير أدمن على `/api/v1/admin/service-orders` → `403`
```

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke-routes.mjs DEPLOY_AND_SMOKETEST_RUNBOOK.md
git commit -m "test: smoke routes and manual QA checklist for service orders"
```

---

## Self-Review

**Spec coverage.** §3.1 migration → Task 1. §4.1–4.3 step gating and validator → Tasks 2, 4. §4.4 submit payload → Task 5. §4.5 attachments → Task 5 (`attachFile`). §5 client tracking → Task 7. §6 admin queue → Tasks 8, 9. §6.1 deliverable storage → Tasks 6, 9. §7.1 recipient bug → Task 3. §7.2 outbound payload → Tasks 3, 8. §7.3 callback → Task 10. §9 error handling → Tasks 5, 6, 8 (409, best-effort side-channels, validation). §10 testing → Tasks 2, 3, 12. §8 Google sign-in → **separate plan** (`2026-08-14-google-signin.md`), as it ships independently.

**Placeholder scan.** No TBD/TODO. Every code step carries runnable code; every verification step names a command and an expected result.

**Type consistency.** `ServiceKey`, `OrderAttachment`, `DraftIntakeV1`, `SERVICE_TYPE_BY_KEY`, `SERVICE_TITLE_AR` defined in Task 2 and used unchanged in Tasks 5, 7. `ServiceOrder`, `ORDER_STATUS_AR` defined in Tasks 5 and 7 and used unchanged in Task 7. `requesterProfile` added to `BuildWebhookPayloadOpts` in Task 3 and consumed in Task 8. `metadata.deliverable.documentId` written in Task 8, read in Task 6.

**Known ordering constraint.** Task 5's verification ends on a 404 for `/ai/orders/<id>` because Task 7 creates that page. This is called out inline in Task 5 Step 4.
