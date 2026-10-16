import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildServicesWizardRequest } from "./servicesWizardRequest.ts";
import { validateServiceRequestCreate } from "../../lib/services/serviceRequestIntake.ts";
import { checkOrderIntake } from "../../lib/services/intakeGuard.ts";

/**
 * Owner decision ١١٥: the public /services wizard now sends a REAL request
 * (it used to save into the visitor's browser and report success). This
 * passes the exact payload through both pure gates the route runs before its
 * insert, so a submit cannot start failing for every visitor unnoticed.
 */

const payload = buildServicesWizardRequest({
  id: "SRV-TEST-0001",
  title: "صياغة عقد توريد",
  serviceTitleAr: "صياغة عقد توريد",
  description: "أحتاج إلى صياغة عقد توريد مواد بناء مع مورد محلي لمدة سنة كاملة.",
  requester: { userId: "00000000-0000-0000-0000-000000000001", name: "عميل", role: "individual", tier: "free" },
  serviceId: "srv-4",
  userRole: "individual",
  region: "الرياض",
  deadline: "2026-11-01",
  budgetMin: 500,
  budgetMax: 3000,
  confidential: false,
  assignmentMethod: "open_bids",
  barNumber: "",
  courtName: "",
  caseNumber: "",
  serviceType: "",
  attachments: [{ documentId: "doc-1", fileName: "مسودة.pdf" }],
});

test("the wizard's payload passes the route's shape contract", () => {
  const shape = validateServiceRequestCreate(payload);
  assert.equal(shape.ok, true, shape.ok ? "" : shape.error);
  if (shape.ok) {
    assert.equal(shape.value.receiver, "ai_workspace", "the نظامي team queue");
    assert.equal(shape.value.type, "service");
  }
});

test("the wizard's metadata passes the intake guard (no AI-service validator applies)", () => {
  const result = checkOrderIntake(payload.metadata);
  assert.notEqual(result.kind, "invalid", JSON.stringify(result));
});

test("nothing is charged and nothing is routed to the closed marketplace", () => {
  assert.deepEqual(payload.payment, { amount: 0, status: "not_required" });
  assert.equal(payload.receiver, "ai_workspace");
  assert.equal(payload.metadata.fileCount, 1);
  assert.equal(payload.metadata.barNumber, null);
});

test("the wizard builds its request with this function and posts it, outside demo, through createWorkflowRequest", () => {
  const src = readFileSync(new URL("./ServiceRequestWizard.tsx", import.meta.url), "utf8");
  assert.match(src, /await createWorkflowRequest\(\s*buildServicesWizardRequest\(\{/);
  assert.doesNotMatch(src, /import \{[^}]*saveWorkflowRequest/, "the browser-only store is not imported");
  assert.doesNotMatch(src, /saveWorkflowRequest\(\{/, "nor called");
});
