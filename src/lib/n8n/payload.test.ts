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

test("REGRESSION: internalNotes never appears in the webhook payload, even when set on metadata", () => {
  const p = buildWebhookPayload({
    event: "service_request.completed",
    timestamp: ts,
    request: {
      ...completedRequest,
      metadata: { service: "draft", internalNotes: "لا يرسل هذا لأي جهة خارج الفريق" },
    },
    requesterProfile,
  });
  assert.equal((p.data.metadata as Record<string, unknown>).internalNotes, undefined);
  assert.equal((p.data.metadata as Record<string, unknown>).service, "draft");
  assert.ok(!("internalNotes" in (p.data.metadata as Record<string, unknown>)));
});

// ─── Task 3 (owner س٧) — AI orders send only the name, the phone and the link ──
// «إرسال (الاسم، الجوال، ورابط الطلب) فقط إلى n8n لحماية أسرار ووقائع القضايا
// والمذكرات.» The redaction is scoped to receiver === "ai_workspace"; the
// lawyer-marketplace payload must be untouched.

const aiOrderWithCase = {
  id: "ord-1",
  type: "ai_draft",
  status: "completed",
  receiver: "ai_workspace",
  requester_user_id: "client-uuid",
  assigned_to: "admin-uuid",
  source_path: "/ai/draft",
  created_at: "2026-08-14T08:00:00.000Z",
  payment: { amount: 0, status: "not_required" },
  title: "الرأي الفصل — شركة الأفق للمقاولات",
  description: "وقائع حساسة عن نزاع العميل",
  requester: { name: "محمد العتيبي", phone: "+966500000000", email: "m@example.com" },
  metadata: {
    service: "draft",
    serviceTitleAr: "الصائغ القانوني",
    schemaVersion: 1,
    intake: { caseText: "سر", parties: { one: { fullName: "خالد" } } },
    attachments: [{ documentId: "12", name: "صك-الحكم.pdf", size: 1024 }],
    deliverable: { documentId: "12", fileName: "مذكرة-خالد.docx", notes: "ملاحظة الإدارة" },
  },
};

test("an ai_workspace payload carries no case narrative", () => {
  const p = buildWebhookPayload({
    event: "service_request.completed", timestamp: ts,
    request: aiOrderWithCase, requesterProfile,
  });
  const s = JSON.stringify(p);
  assert.ok(!s.includes("وقائع حساسة"), "description must not survive");
  assert.ok(!s.includes("سر"), "intake.caseText must not survive");
  assert.ok(!s.includes("خالد"), "a party name must not survive");
  assert.ok(!s.includes("صك-الحكم.pdf"), "an attachment file name must not survive");
  assert.ok(!s.includes("ملاحظة الإدارة"), "the admin's deliverable note must not survive");
});

test("an ai_workspace payload drops the title — in four flows it is client-typed", () => {
  // page.tsx:266 (ddEntityName), :267 (crossExamWitnessRole),
  // LetterWorkflow.tsx:86 (letterTypeCustom), StepIdentify.tsx:257 (legalBranch).
  const p = buildWebhookPayload({
    event: "service_request.completed", timestamp: ts,
    request: aiOrderWithCase, requesterProfile,
  });
  assert.equal(p.data.title, undefined);
  assert.ok(!JSON.stringify(p).includes("شركة الأفق للمقاولات"));
  // The fixed per-service Arabic name replaces it.
  assert.equal((p.data.metadata as Record<string, unknown>).serviceTitleAr, "الصائغ القانوني");
});

test("an ai_workspace payload still carries what WhatsApp needs", () => {
  const p = buildWebhookPayload({
    event: "service_request.completed", timestamp: ts,
    request: aiOrderWithCase, requesterProfile,
    orderUrl: "https://nezamy.sa/ai/orders/ord-1",
  });
  assert.equal(p.recipient.phone, "+966500000000");
  assert.equal(p.recipient.name, "محمد العتيبي");
  assert.equal(p.entity.id, "ord-1");
  assert.equal(p.data.orderUrl, "https://nezamy.sa/ai/orders/ord-1");
});

test("on CREATE the phone reaches n8n only via data.requester — recipient has none", () => {
  // The create dispatch (service-requests/route.ts:342) passes no
  // requesterProfile, so recipient resolves to the assignee-or-role branch
  // with no contact at all. Dropping data.requester would delete the phone.
  const p = buildWebhookPayload({
    event: "service_request.created", timestamp: ts,
    request: { ...aiOrderWithCase, status: "pending_assignment", assigned_to: null },
  });
  assert.equal(p.recipient.phone, undefined);
  assert.deepEqual(p.data.requester, {
    name: "محمد العتيبي", phone: "+966500000000", email: "m@example.com",
  });
});

test("data.requester is itself allow-listed — an extra key cannot ride along", () => {
  // service_requests.requester is a JSONB column written verbatim from the
  // POST body (service-requests/route.ts:212); nothing validates its shape.
  const p = buildWebhookPayload({
    event: "service_request.created", timestamp: ts,
    request: {
      ...aiOrderWithCase,
      requester: {
        name: "محمد العتيبي", phone: "+966500000000", email: "m@example.com",
        caseSummary: "وقائع مهربة عبر حقل جهة الطلب",
        nested: { nationalId: "1234567890" },
      },
    },
  });
  const s = JSON.stringify(p);
  assert.ok(!s.includes("وقائع مهربة"));
  assert.ok(!s.includes("1234567890"));
  assert.deepEqual(p.data.requester, {
    name: "محمد العتيبي", phone: "+966500000000", email: "m@example.com",
  });
});

test("metadata is allow-listed, not deny-listed — an unknown key is dropped", () => {
  const p = buildWebhookPayload({
    event: "service_request.completed", timestamp: ts,
    request: {
      ...aiOrderWithCase,
      metadata: { service: "draft", schemaVersion: 1, futureFieldNobodyThoughtAbout: "تسريب" },
    },
    requesterProfile,
  });
  assert.deepEqual(p.data.metadata, { service: "draft", schemaVersion: 1 });
});

test("an allowed metadata key cannot smuggle case text as an object or an array", () => {
  // The allow-list is key-based; the primitive filter is the half that stops a
  // value shaped like { caseText: "..." } riding through on a key that IS
  // allowed. service_requests.metadata is a JSONB column written verbatim from
  // the POST body (service-requests/route.ts:214, `metadata:
  // requestData.metadata ?? {}`), so nothing on the wire rejects this shape.
  //
  // This is also the proxy test for the mirror in
  // src/app/api/v1/admin/service-orders/[id]/route.ts, which now copies
  // `service`/`serviceTitleAr` off payload.data.metadata (post-filter) rather
  // than off the raw row. That route handler has no unit-test harness here.
  const p = buildWebhookPayload({
    event: "service_request.completed", timestamp: ts,
    request: {
      ...aiOrderWithCase,
      metadata: {
        service: { caseText: "وقائع مهربة عبر مفتاح مسموح به" },
        serviceTitleAr: ["الصائغ القانوني", "ملف خالد بن سعد"],
        schemaVersion: 1,
      },
    },
    requesterProfile,
  });
  const s = JSON.stringify(p);
  assert.ok(!s.includes("وقائع مهربة"), "a nested object on an allowed key must not survive");
  assert.ok(!s.includes("خالد بن سعد"), "an array on an allowed key must not survive");
  // Dropped entirely — not coerced, not defaulted to a service name.
  assert.deepEqual(p.data.metadata, { schemaVersion: 1 });
});

test("orderUrl is omitted, not emitted empty, when the caller supplies none", () => {
  const p = buildWebhookPayload({
    event: "service_request.completed", timestamp: ts,
    request: aiOrderWithCase, requesterProfile,
  });
  assert.ok(!("orderUrl" in p.data));
});

test("REGRESSION: a lawyer-marketplace payload is NOT redacted — other workflows depend on it", () => {
  const p = buildWebhookPayload({
    event: "service_request.completed", timestamp: ts,
    request: {
      id: "req-9", receiver: "lawyer", title: "استشارة",
      description: "تفاصيل الطلب", metadata: { note: "يبقى" },
    },
  });
  assert.equal(p.data.title, "استشارة");
  assert.equal(p.data.description, "تفاصيل الطلب");
  assert.deepEqual(p.data.metadata, { note: "يبقى" });
});

test("REGRESSION: internalNotes is still stripped for every non-ai receiver", () => {
  const p = buildWebhookPayload({
    event: "service_request.completed", timestamp: ts,
    request: {
      id: "req-9", receiver: "lawyer", title: "استشارة",
      metadata: { note: "يبقى", internalNotes: "لا يرسل هذا لأي جهة خارج الفريق" },
    },
  });
  assert.ok(!("internalNotes" in (p.data.metadata as Record<string, unknown>)));
  assert.equal((p.data.metadata as Record<string, unknown>).note, "يبقى");
});
