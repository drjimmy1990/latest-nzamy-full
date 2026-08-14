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
