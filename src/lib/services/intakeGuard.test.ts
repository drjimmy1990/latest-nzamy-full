import { test } from "node:test";
import assert from "node:assert/strict";
import { checkOrderIntake, intakeErrorMessageAr } from "./intakeGuard.ts";
import { validateDraftIntake } from "./orderIntake.ts";
import { validateContractsIntake } from "./orderIntake.contracts.ts";
import { validateWargamingIntake, WARGAMING_CRITIQUE_TARGET } from "./orderIntake.wargaming.ts";
import { validateLegalOpinionIntake } from "./orderIntake.legalOpinion.ts";

/**
 * The round trip every live submit path takes: the wizard validates, then
 * sends `check.value` as `metadata.intake` (createServiceOrder), then this
 * guard validates that stored value again. If any validator were not
 * idempotent on its own output, wiring the guard would reject a submission the
 * wizard had just accepted — so this is asserted per service rather than
 * reasoned about.
 */
function roundTrip(
  validate: (input: unknown) => { ok: boolean; value?: unknown; errors?: string[] },
  service: string,
  raw: Record<string, unknown>,
) {
  const check = validate(raw);
  assert.equal(check.ok, true, `fixture rejected by the wizard's own validator: ${check.errors?.join(" | ")}`);
  // Exactly the metadata createServiceOrder() builds (serviceOrders.ts:59-66).
  return checkOrderIntake({
    service,
    serviceTitleAr: "خدمة",
    schemaVersion: 1,
    intake: check.value,
    attachments: [],
  });
}

const draftRaw = {
  schemaVersion: 1,
  service: "draft",
  clientRole: "plaintiff",
  memoType: "case",
  legalBranch: "عمالي",
  caseText: "و".repeat(40),
  parties: { one: { fullName: "أحمد" }, two: { fullName: "شركة النور" } },
  judgment: { number: "", court: "", date: "", text: "", reasons: "" },
  lawyerNotes: "",
  attachments: [],
};

const contractsDraftRaw = {
  schemaVersion: 1,
  service: "contracts",
  mode: "draft",
  complexity: "simple",
  parties: { one: { fullName: "أحمد" }, two: { companyName: "شركة النور" } },
  contractDesc: "ع".repeat(30),
  additionalClauses: [],
  attachments: [],
};

const contractsReviewRaw = {
  schemaVersion: 1,
  service: "contracts",
  mode: "review",
  representing: "الطرف الأول",
  // Numeric documentId on purpose — attachments.id is a bigserial and
  // PostgREST serialises int8 as a JSON number (documentIdStr in orderIntake.ts).
  attachments: [{ documentId: 4211, name: "العقد.pdf", size: 20480 }],
};

const wargamingRaw = {
  schemaVersion: 1,
  service: "wargaming",
  role: "plaintiff",
  area: "تجاري",
  caseSummary: "و".repeat(30),
  targets: ["opponent", "court"],
  attachments: [],
};

const legalOpinionRaw = {
  schemaVersion: 1,
  service: "legal_opinion",
  outputType: "memo",
  topicArea: "تجاري",
  description: "و".repeat(30),
  attachments: [],
};

const legalOpinionLetterRaw = {
  schemaVersion: 1,
  service: "legal_opinion",
  outputType: "letter",
  letter: { letterType: "demand", letterSubject: "مطالبة بسداد", fullLetterText: "" },
  attachments: [],
};

// ─── Round trip: what every wizard actually submits must still pass ──────────

test("accepts what الصائغ القانوني submits", () => {
  assert.deepEqual(roundTrip(validateDraftIntake, "draft", draftRaw), { kind: "ok", service: "draft" });
});

test("accepts what محترف العقود submits in draft mode", () => {
  assert.deepEqual(roundTrip(validateContractsIntake, "contracts", contractsDraftRaw), {
    kind: "ok",
    service: "contracts",
  });
});

test("accepts what محترف العقود submits in review mode", () => {
  assert.deepEqual(roundTrip(validateContractsIntake, "contracts", contractsReviewRaw), {
    kind: "ok",
    service: "contracts",
  });
});

test("accepts what المحاكي الشامل submits", () => {
  assert.deepEqual(roundTrip(validateWargamingIntake, "wargaming", wargamingRaw), {
    kind: "ok",
    service: "wargaming",
  });
});

test("accepts what الرأي الفصل submits", () => {
  assert.deepEqual(roundTrip(validateLegalOpinionIntake, "legal_opinion", legalOpinionRaw), {
    kind: "ok",
    service: "legal_opinion",
  });
});

test("accepts the letter sub-flow, which has no free-text description", () => {
  assert.deepEqual(roundTrip(validateLegalOpinionIntake, "legal_opinion", legalOpinionLetterRaw), {
    kind: "ok",
    service: "legal_opinion",
  });
});

// ─── The critique memo: text OR file, never "file only" ──────────────────────
// The wizard's own copy (ai/wargaming/page.tsx:539) promises "الصق نص المذكرة،
// أو ارفع ملفها — يكفي أحدهما" after owner field-testing, so BOTH shapes must
// survive the server-side check.

test("accepts a critique whose memo is pasted text only", () => {
  const r = roundTrip(validateWargamingIntake, "wargaming", {
    ...wargamingRaw,
    targets: ["opponent", WARGAMING_CRITIQUE_TARGET],
    memoText: "نص المذكرة المراد نقضها",
  });
  assert.deepEqual(r, { kind: "ok", service: "wargaming" });
});

test("accepts a critique whose memo is an uploaded file only", () => {
  const r = roundTrip(validateWargamingIntake, "wargaming", {
    ...wargamingRaw,
    targets: ["opponent", WARGAMING_CRITIQUE_TARGET],
    memoAttachmentIds: [4212],
    attachments: [{ documentId: 4212, name: "المذكرة.pdf", size: 30720 }],
  });
  assert.deepEqual(r, { kind: "ok", service: "wargaming" });
});

// ─── Pass-through: everything that is not an AI service order ────────────────

test("passes an order with no metadata at all", () => {
  assert.deepEqual(checkOrderIntake(undefined), { kind: "pass" });
  assert.deepEqual(checkOrderIntake(null), { kind: "pass" });
  assert.deepEqual(checkOrderIntake({}), { kind: "pass" });
});

test("passes a legacy request whose metadata carries no intake", () => {
  // Shape of a consultation booking / case request (createWorkflowRequest).
  const r = checkOrderIntake({ caseType: "عمالي", preferredDate: "2026-09-01", notes: "" });
  assert.deepEqual(r, { kind: "pass" });
});

test("passes an intake that names no service this guard knows", () => {
  assert.deepEqual(checkOrderIntake({ intake: { service: "case_brief", note: "x" } }), { kind: "pass" });
  assert.deepEqual(checkOrderIntake({ intake: { note: "x" } }), { kind: "pass" });
});

// ─── Rejection: the orders the admin cannot fulfil ───────────────────────────

test("rejects a contracts draft whose parties are unnamed", () => {
  const r = checkOrderIntake({
    service: "contracts",
    intake: { ...contractsDraftRaw, parties: { one: {}, two: {} } },
  });
  assert.equal(r.kind, "invalid");
  if (r.kind === "invalid") {
    assert.equal(r.service, "contracts");
    assert.ok(r.errors.some((e) => e.includes("الطرف الأول")));
  }
});

test("rejects a contract review with no contract file attached", () => {
  const r = checkOrderIntake({ service: "contracts", intake: { ...contractsReviewRaw, attachments: [] } });
  assert.equal(r.kind, "invalid");
  if (r.kind === "invalid") assert.ok(r.errors.some((e) => e.includes("إرفاق العقد")));
});

test("rejects a critique order carrying neither memo text nor memo file", () => {
  const r = checkOrderIntake({
    service: "wargaming",
    intake: { ...wargamingRaw, targets: [WARGAMING_CRITIQUE_TARGET] },
  });
  assert.equal(r.kind, "invalid");
  if (r.kind === "invalid") assert.ok(r.errors.some((e) => e.includes("المذكرة")));
});

test("rejects a draft memo with no facts", () => {
  const r = checkOrderIntake({ service: "draft", intake: { ...draftRaw, caseText: "قصير" } });
  assert.equal(r.kind, "invalid");
  if (r.kind === "invalid") assert.ok(r.errors.some((e) => e.includes("الوقائع")));
});

test("rejects an intake that is not an object", () => {
  const r = checkOrderIntake({ service: "draft", intake: "draft" });
  assert.equal(r.kind, "invalid");
});

// ─── Service resolution ──────────────────────────────────────────────────────

test("falls back to metadata.service when the intake omits its own discriminant", () => {
  const { service: _dropped, ...noDiscriminant } = draftRaw;
  const r = checkOrderIntake({ service: "draft", intake: noDiscriminant });
  assert.equal(r.kind, "invalid");
  if (r.kind === "invalid") assert.equal(r.service, "draft");
});

test("intake.service decides when the two disagree", () => {
  // A wargaming intake mislabelled as contracts in metadata is checked as
  // wargaming — and passes, because the intake itself is well-formed.
  const check = validateWargamingIntake(wargamingRaw);
  assert.equal(check.ok, true);
  if (!check.ok) return;
  const r = checkOrderIntake({ service: "contracts", intake: check.value });
  assert.deepEqual(r, { kind: "ok", service: "wargaming" });
});

// ─── Message ─────────────────────────────────────────────────────────────────

test("the 400 message names every missing piece, in Arabic", () => {
  const msg = intakeErrorMessageAr(["نوع المذكرة مطلوب", "الفرع القانوني مطلوب"]);
  assert.ok(msg.includes("نوع المذكرة مطلوب"));
  assert.ok(msg.includes("الفرع القانوني مطلوب"));
  assert.ok(!/[a-zA-Z]/.test(msg));
});
