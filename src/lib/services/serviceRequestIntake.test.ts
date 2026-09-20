import test from "node:test";
import assert from "node:assert/strict";
import {
  validateServiceRequestCreate,
  MAX_TITLE_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  SERVICE_REQUEST_TYPES,
  SERVICE_REQUEST_RECEIVERS,
} from "./serviceRequestIntake.ts";

const UUID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const ok = (body: unknown) => {
  const r = validateServiceRequestCreate(body);
  assert.equal(r.ok, true, `expected ok: ${JSON.stringify(r)}`);
  return r.ok ? r.value : (undefined as never);
};
const rejected = (body: unknown) => {
  const r = validateServiceRequestCreate(body);
  assert.equal(r.ok, false, `expected a refusal: ${JSON.stringify(r)}`);
  if (r.ok) throw new Error("unreachable");
  assert.equal(r.status, 400);
  assert.ok(/[؀-ۿ]/.test(r.error), `the reason must be Arabic: ${r.error}`);
  return r.error;
};

test("a minimal valid payload passes and is normalised", () => {
  const v = ok({ title: "  مطالبة مالية  " });
  assert.equal(v.title, "مطالبة مالية");
  assert.equal(v.description, "");
  assert.equal(v.type, "service");
  assert.equal(v.receiver, "lawyer");
  assert.deepEqual(v.requester, {});
  assert.equal(v.lawyerClientId, null);
});

test("an empty or whitespace title is refused — never invented", () => {
  // The defect this closes: AddCaseModal sent `title.trim() || \`قضية — …\``
  // and the route took it verbatim into a `text not null` column.
  for (const title of ["", "   ", "\n\t"]) rejected({ title });
  rejected({});
  rejected({ title: null });
  rejected({ title: 42 });
});

test("the title is bounded", () => {
  ok({ title: "ع".repeat(MAX_TITLE_LENGTH) });
  rejected({ title: "ع".repeat(MAX_TITLE_LENGTH + 1) });
});

test("a title that is only whitespace-padded up to the limit still counts trimmed", () => {
  const v = ok({ title: ` ${"ع".repeat(MAX_TITLE_LENGTH)} ` });
  assert.equal(v.title.length, MAX_TITLE_LENGTH);
});

test("description: optional, must be a string, bounded", () => {
  assert.equal(ok({ title: "ع", description: "  وصف  " }).description, "وصف");
  assert.equal(ok({ title: "ع", description: undefined }).description, "");
  assert.equal(ok({ title: "ع", description: null }).description, "");
  ok({ title: "ع", description: "و".repeat(MAX_DESCRIPTION_LENGTH) });
  rejected({ title: "ع", description: "و".repeat(MAX_DESCRIPTION_LENGTH + 1) });
  rejected({ title: "ع", description: 5 });
  rejected({ title: "ع", description: ["وصف"] });
});

test("requester must be a plain object when present", () => {
  assert.deepEqual(ok({ title: "ع", requester: { name: "أحمد" } }).requester, { name: "أحمد" });
  assert.deepEqual(ok({ title: "ع" }).requester, {});
  assert.deepEqual(ok({ title: "ع", requester: null }).requester, {});
  rejected({ title: "ع", requester: "أحمد" });
  rejected({ title: "ع", requester: [{ name: "أحمد" }] });
  rejected({ title: "ع", requester: 7 });
});

test("lawyerClientId must be a uuid when present", () => {
  assert.equal(ok({ title: "ع", lawyerClientId: UUID }).lawyerClientId, UUID);
  assert.equal(ok({ title: "ع", lawyerClientId: ` ${UUID} ` }).lawyerClientId, UUID);
  assert.equal(ok({ title: "ع", lawyerClientId: "" }).lawyerClientId, null);
  assert.equal(ok({ title: "ع", lawyerClientId: null }).lawyerClientId, null);
  assert.equal(ok({ title: "ع" }).lawyerClientId, null);
  rejected({ title: "ع", lawyerClientId: "not-a-uuid" });
  rejected({ title: "ع", lawyerClientId: "1234" });
  rejected({ title: "ع", lawyerClientId: 1234 });
});

test("type and receiver accept exactly the DB CHECK lists", () => {
  for (const type of SERVICE_REQUEST_TYPES) assert.equal(ok({ title: "ع", type }).type, type);
  for (const receiver of SERVICE_REQUEST_RECEIVERS) assert.equal(ok({ title: "ع", receiver }).receiver, receiver);
  rejected({ title: "ع", type: "not_a_real_type" });
  rejected({ title: "ع", type: 1 });
  rejected({ title: "ع", receiver: "not_a_real_receiver" });
  // The values the migrations DO define must never be refused — a stale copy
  // of either list here is the failure mode this test exists to catch.
  assert.equal(SERVICE_REQUEST_TYPES.length, 8);
  assert.equal(SERVICE_REQUEST_RECEIVERS.length, 7);
});

test("a non-object body is refused rather than crashing", () => {
  for (const body of [null, undefined, "title", 7, [], true]) rejected(body);
});

test("the payloads the live callers send all pass", () => {
  // AddCaseModal (lawyer), with a picked client card.
  ok({
    id: "x", type: "service", title: "مطالبة مالية - مؤسسة العليان", description: "ملخص",
    receiver: "lawyer", status: "pending_assignment",
    requester: { userId: UUID, name: "مؤسسة العليان", role: "lawyer", tier: "free" },
    payment: { amount: 0, status: "not_required" }, sourcePath: "",
    metadata: { court: "المحكمة التجارية", priority: "normal", assignee: "أنا فقط" },
    assignedTo: UUID, lawyerClientId: UUID,
  });
  // createServiceOrder (the four AI services).
  ok({
    title: "صياغة عقد", description: "…", type: "ai_contracts", receiver: "ai_workspace",
    status: "pending_assignment", sourcePath: "/ai/contracts",
    payment: { amount: 0, status: "not_required" },
    requester: { name: "أحمد", phone: "+966500000000" },
    metadata: { service: "contracts", schemaVersion: 1, intake: {}, attachments: [] },
  });
  // Lawyer consultation booking.
  ok({
    id: "CON-1", type: "consultation", title: "استشارة عامة", description: "",
    receiver: "lawyer", status: "pending_assignment",
    requester: { name: "عميل", role: "individual", tier: "free" },
    payment: { amount: 0, status: "not_required" }, sourcePath: "", assignedTo: UUID,
    metadata: { day: "", time: "", mode: "video", duration: 60 },
  });
});
