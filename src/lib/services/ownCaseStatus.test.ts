import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createStatusFor } from "./ownCaseStatus.ts";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const own = { requested: "assigned", isPaid: false, selfAssigned: true, receiver: "lawyer", actorUserType: "lawyer" };

test("LIVE-F14 / LAW-DETAIL-006: a lawyer's own case is born «assigned» (active)", () => {
  assert.equal(createStatusFor(own), "assigned");
  assert.equal(createStatusFor({ ...own, actorUserType: "firm" }), "assigned");
});

test("nobody else can birth a request as already taken", () => {
  assert.equal(createStatusFor({ ...own, actorUserType: "client" }), "pending_assignment");
  assert.equal(createStatusFor({ ...own, actorUserType: null }), "pending_assignment");
  assert.equal(createStatusFor({ ...own, selfAssigned: false }), "pending_assignment");
  assert.equal(createStatusFor({ ...own, receiver: "ai_workspace" }), "pending_assignment");
  assert.equal(createStatusFor({ ...own, isPaid: true }), "pending_payment");
  assert.equal(createStatusFor({ ...own, requested: "completed" }), "pending_assignment");
  assert.equal(createStatusFor({ ...own, requested: "in_review", actorUserType: "client" }), "in_review");
  assert.equal(createStatusFor({ ...own, requested: undefined }), "pending_assignment");
});

test("wiring: the route decides the status after reading the caller's account type; the modal asks for «assigned»", () => {
  const route = read("app/api/v1/service-requests/route.ts");
  assert.match(route, /const status = createStatusFor\(\{/);
  assert.ok(route.indexOf("const status = createStatusFor(") > route.indexOf(`.select("id, display_name, user_type")`));
  assert.doesNotMatch(route, /const CREATE_STATUS_ALLOWLIST = new Set/);
  const modal = read("app/dashboard/lawyer/_components/AddCaseModal.tsx");
  assert.match(modal, /status: "assigned" as const,/);
});

test("LAW-DETAIL-005: a retried create names the same case, and the route answers with it", () => {
  const modal = read("app/dashboard/lawyer/_components/AddCaseModal.tsx");
  assert.match(modal, /if \(!caseIdRef\.current\) caseIdRef\.current = createWorkflowId\(\);/);
  assert.doesNotMatch(modal, /const id = createWorkflowId\(\);/);
  const route = read("app/api/v1/service-requests/route.ts");
  assert.match(route, /reqError\?\.code === "23505" && typeof requestData\.id === "string"/);
  assert.match(route, /\.eq\("requester_user_id", user\.id\)\s*\n\s*\.maybeSingle\(\);\s*\n\s*if \(existing\)/);
  assert.match(route, /replayed: true/);
});
