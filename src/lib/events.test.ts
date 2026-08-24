import { test } from "node:test";
import assert from "node:assert/strict";
import { describeRequestEvent, RequestEvent } from "./events.ts";

test("names the Arabic service and the order reference on creation", () => {
  const out = describeRequestEvent({
    event: RequestEvent.SERVICE_REQUEST_CREATED,
    requestId: "8f14e45f-ceea-467a-9575-1a5b3d8f0e11",
    serviceTitleAr: "محترف العقود",
    requestTitle: "عقد إيجار",
  });
  assert.equal(out.title, "تم قيد طلبكم: محترف العقود برقم #8f14e45f");
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
