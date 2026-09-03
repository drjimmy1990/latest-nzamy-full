import { test } from "node:test";
import assert from "node:assert/strict";
import { describeActivityEvent, describeRequestEvent, RequestEvent } from "./events.ts";
import { orderReference } from "./services/orderReference.ts";

test("names the Arabic service and the order reference on creation", () => {
  const out = describeRequestEvent({
    event: RequestEvent.SERVICE_REQUEST_CREATED,
    requestId: "8f14e45f-ceea-467a-9575-1a5b3d8f0e11",
    serviceTitleAr: "محترف العقود",
    requestTitle: "عقد إيجار",
  });
  // Owner item ٤ — the feed quotes the SAME short reference the client reads
  // off their order page and support types into the admin queue. If this ever
  // diverges again (it was three private formats before orderReference()
  // existed), a client quoting what the feed told them finds nothing.
  assert.equal(out.title, "تم قيد طلبكم: محترف العقود برقم ORD-8F14E4");
  assert.equal(
    out.title.endsWith(orderReference("8f14e45f-ceea-467a-9575-1a5b3d8f0e11")),
    true,
    "the feed must not carry its own copy of the reference format",
  );
  assert.equal(out.badge, "order");
});

test("renders a claim from its own event, whatever the status says", () => {
  const out = describeRequestEvent({
    event: RequestEvent.SERVICE_REQUEST_ASSIGNED,
    serviceTitleAr: "محترف العقود",
  });
  assert.equal(out.title, "بدأ العمل على طلبكم: محترف العقود");
  assert.equal(out.badge, "task");
});

test("tells a claim, a delivery and a cancellation apart by request status", () => {
  const at = (status: string) =>
    describeRequestEvent({
      event: RequestEvent.SERVICE_REQUEST_STATUS_CHANGED,
      status,
      serviceTitleAr: "محترف العقود",
    });
  assert.equal(at("in_review").badge, "task");
  assert.equal(at("in_review").title, "بدأ العمل على طلبكم: محترف العقود");
  assert.equal(at("completed").badge, "delivery");
  assert.equal(at("cancelled").badge, "cancelled");
  // unknown status still gets an Arabic line, not the raw token
  assert.equal(at("draft").badge, "order");
  assert.equal(at("draft").title, "تم تحديث حالة طلبكم: محترف العقود");
});

test("falls back to the request title, then to a generic name", () => {
  assert.equal(
    describeRequestEvent({ event: RequestEvent.SERVICE_REQUEST_COMPLETED, requestTitle: "قضية ٢١٣" }).title,
    "تم إنجاز معاملتكم: قضية ٢١٣",
  );
  assert.equal(
    describeRequestEvent({ event: RequestEvent.SERVICE_REQUEST_COMPLETED, serviceTitleAr: "   " }).title,
    "تم إنجاز معاملتكم: طلب خدمة",
  );
});

test("renders n8n notification events, including failures", () => {
  const sent = describeRequestEvent({ event: "notification.email_sent", serviceTitleAr: "محترف العقود" });
  assert.equal(sent.badge, "notice");
  assert.equal(sent.title, "تم إرسال إشعار بخصوص طلبكم: محترف العقود");
  assert.equal(
    describeRequestEvent({ event: "notification.whatsapp_failed", serviceTitleAr: "محترف العقود" }).title,
    "تعذّر إرسال إشعار بخصوص طلبكم: محترف العقود",
  );
});

test("never echoes an unknown raw token back to the UI", () => {
  const out = describeRequestEvent({ event: "some.brand_new_event", serviceTitleAr: "محترف العقود" });
  assert.equal(out.title, "تحديث على طلبكم: محترف العقود");
  assert.ok(!/[A-Za-z]/.test(out.title));
});

test("omits the reference when there is no request id", () => {
  const out = describeRequestEvent({ event: RequestEvent.SERVICE_REQUEST_CREATED, serviceTitleAr: "محترف العقود" });
  assert.equal(out.title, "تم قيد طلبكم: محترف العقود");
});

// ── Owner item ١٣ — routing is not the same promise as starting ─────────────
test("an internal routing never tells the client work has begun", () => {
  const routed = describeRequestEvent({
    event: RequestEvent.SERVICE_REQUEST_REASSIGNED,
    serviceTitleAr: "محترف العقود",
  });
  const claimed = describeRequestEvent({
    event: RequestEvent.SERVICE_REQUEST_ASSIGNED,
    serviceTitleAr: "محترف العقود",
  });
  // The whole point of giving routing its own event: if these two ever
  // collapse into the same line, the audit log stops being able to answer
  // «مين وجّه ومين استلم» and the client is told work started when it has not.
  assert.notEqual(routed.title, claimed.title);
  assert.ok(!routed.title.includes("بدأ العمل"));
  assert.equal(routed.title, "تم توجيه طلبكم إلى المختص: محترف العقود");
});

test("routing does not fall through to the generic update line", () => {
  const routed = describeRequestEvent({ event: RequestEvent.SERVICE_REQUEST_REASSIGNED });
  assert.notEqual(routed.title, "تحديث على طلبكم: طلب خدمة");
  assert.ok(!/[A-Za-z]/.test(routed.title));
});

// ─── describeActivityEvent — Phase 1's activity_events reader ────────────────

test("names the hearing's own title when one is given", () => {
  const out = describeActivityEvent({
    kind: RequestEvent.HEARING_CREATED,
    payload: { title: "جلسة قضائية — قضية الأفق" },
  });
  assert.equal(out.title, "تمت إضافة جلسة: جلسة قضائية — قضية الأفق");
  assert.equal(out.badge, "hearing");
});

test("a hearing/task event with no title still names the badge, never a blank suffix", () => {
  assert.equal(describeActivityEvent({ kind: RequestEvent.HEARING_CREATED }).title, "تمت إضافة جلسة");
  assert.equal(describeActivityEvent({ kind: RequestEvent.TASK_CREATED, payload: {} }).title, "تمت إضافة مهمة");
});

test("task status change names both the task and the Arabic status", () => {
  const out = describeActivityEvent({
    kind: RequestEvent.TASK_STATUS_CHANGED,
    payload: { title: "مراجعة العقد", status: "done" },
  });
  assert.equal(out.title, "تحديث حالة مهمة: مراجعة العقد — مكتملة");
  assert.equal(out.badge, "task");
});

test("an unrecognised status on a task status change is dropped, not printed raw", () => {
  const out = describeActivityEvent({
    kind: RequestEvent.TASK_STATUS_CHANGED,
    payload: { title: "مراجعة العقد", status: "some-future-status" },
  });
  assert.equal(out.title, "تحديث حالة مهمة: مراجعة العقد");
  assert.ok(!/[A-Za-z]/.test(out.title));
});

test("an unrecognised kind falls back to a neutral line, never the raw token", () => {
  const out = describeActivityEvent({ kind: "case_graph.updated", payload: { title: "whatever" } });
  assert.equal(out.title, "نشاط جديد مسجَّل");
  assert.ok(!/[A-Za-z]/.test(out.title));
});

test("a whitespace-only title is treated as no title", () => {
  const out = describeActivityEvent({ kind: RequestEvent.HEARING_CREATED, payload: { title: "   " } });
  assert.equal(out.title, "تمت إضافة جلسة");
});
