import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkOrderIntake, intakeErrorMessageAr, persistedRequestMetadata } from "./intakeGuard.ts";
import { validateDraftIntake } from "./orderIntake.ts";
import { validateContractsIntake } from "./orderIntake.contracts.ts";
import { validateWargamingIntake, WARGAMING_CRITIQUE_TARGET } from "./orderIntake.wargaming.ts";
import { validateLegalOpinionIntake } from "./orderIntake.legalOpinion.ts";
import { stampServiceEstimate } from "../pricing/serviceEstimate.ts";
import { CLIENT_SERVICE_CATALOG } from "../../constants/clientServiceCatalog.ts";

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

test("rejects a contract review with neither a file nor a pasted text", () => {
  const r = checkOrderIntake({ service: "contracts", intake: { ...contractsReviewRaw, attachments: [] } });
  assert.equal(r.kind, "invalid");
  if (r.kind === "invalid") assert.ok(r.errors.includes("ارفع ملف العقد أو الصق نصه"));
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

// ─── What the route stores (task 8 / task 10 re-reviews) ─────────────────────

const WIZARD_FIXTURES: Array<[string, (input: unknown) => { ok: boolean; value?: unknown }, Record<string, unknown>]> = [
  ["draft", validateDraftIntake, draftRaw],
  ["contracts", validateContractsIntake, contractsDraftRaw],
  ["contracts", validateContractsIntake, contractsReviewRaw],
  ["wargaming", validateWargamingIntake, wargamingRaw],
  ["wargaming", validateWargamingIntake, {
    ...wargamingRaw,
    targets: ["opponent", WARGAMING_CRITIQUE_TARGET],
    memoAttachmentIds: [4212],
    attachments: [{ documentId: 4212, name: "المذكرة.pdf", size: 30720 }],
  }],
  ["legal_opinion", validateLegalOpinionIntake, legalOpinionRaw],
  ["legal_opinion", validateLegalOpinionIntake, legalOpinionLetterRaw],
];

test("every validator returns its own output unchanged — so storing the validated intake changes nothing a wizard sends", () => {
  for (const [service, validate, raw] of WIZARD_FIXTURES) {
    const once = validate(raw);
    assert.equal(once.ok, true, service);
    const twice = validate(once.value);
    assert.equal(twice.ok, true, service);
    assert.deepEqual(twice.value, once.value, `${service}: validate(validate(x).value).value deep-equals validate(x).value`);
    // What a wizard posts (the validator's value) is stored exactly as posted.
    const metadata = { service, intake: once.value, attachments: [] };
    assert.deepEqual(persistedRequestMetadata(metadata), metadata, service);
  }
  // Attachment ids survive the round trip (as strings: bigserial may arrive as a number).
  const review = validateContractsIntake(contractsReviewRaw);
  assert.ok(review.ok);
  if (review.ok) assert.deepEqual(review.value.attachments.map((a) => a.documentId), ["4211"]);
});

test("task 8 re-review: a direct POST stores the validated intake — a non-company party's leftover representative fields are dropped", () => {
  const raw = {
    ...contractsDraftRaw,
    parties: {
      one: { type: "company", companyName: "شركة", representativeRole: "مدير", representativeRoleOther: "قديم", representativeId: "1023456789" },
      two: { type: "individual", fullName: "خالد", representativeId: "3000000000", representativeRoleOther: "قديم" },
    },
  };
  const metadata = { service: "contracts", serviceTitleAr: "خدمة", intake: raw, attachments: [], note: "كما أُرسل" };
  assert.equal(checkOrderIntake(metadata).kind, "ok");
  const stored = persistedRequestMetadata(metadata) as Record<string, unknown>;
  const parties = (stored.intake as { parties: Record<string, unknown> }).parties;
  assert.deepEqual(parties.one, { type: "company", companyName: "شركة", representativeRole: "مدير", representativeId: "1023456789" });
  assert.deepEqual(parties.two, { type: "individual", fullName: "خالد" });
  // Every other key is kept as sent, and the caller's object is not mutated.
  assert.equal(stored.note, "كما أُرسل");
  assert.equal(stored.serviceTitleAr, "خدمة");
  assert.equal((metadata.intake.parties.two as Record<string, unknown>).representativeId, "3000000000");
});

test("the keys محترف العقود adds after validating (contractId / contractTitle) are stored, not dropped", () => {
  const check = validateContractsIntake(contractsDraftRaw);
  assert.ok(check.ok);
  if (!check.ok) return;
  // Exactly what useContractsState.ts submits for a linked contract.
  const intake = { ...(check.value as unknown as Record<string, unknown>), contractId: "c-77", contractTitle: "عقد توريد" };
  const metadata = { service: "contracts", intake, attachments: [] };
  assert.equal(checkOrderIntake(metadata).kind, "ok");
  assert.deepEqual(persistedRequestMetadata(metadata), metadata);
});

test("task 10 re-review: metadata.courtClass is kept only when it is one of the 14 classifications", () => {
  const caseMeta = { court: "المحكمة العامة بالرياض", caseNumber: "1" };
  assert.deepEqual(persistedRequestMetadata({ ...caseMeta, courtClass: "المحكمة العامة" }), { ...caseMeta, courtClass: "المحكمة العامة" });
  for (const junk of ["محكمة وهمية", "", " المحكمة العامة", 5, null, { x: 1 }, ["المحكمة العامة"]]) {
    assert.deepEqual(persistedRequestMetadata({ ...caseMeta, courtClass: junk }), caseMeta, JSON.stringify(junk));
  }
  assert.deepEqual(persistedRequestMetadata(caseMeta), caseMeta, "no courtClass: nothing added");
});

test("POST /api/v1/service-requests inserts persistedRequestMetadata, after the intake check, never the raw metadata", () => {
  const src = readFileSync(new URL("../../app/api/v1/service-requests/route.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const check = src.indexOf("const intakeCheck = checkOrderIntake(requestData.metadata);");
  const insert = src.search(/\.from\("service_requests"\)\s*\.insert\(/);
  // S6-T5 (P13): the server's estimate stamp wraps the guard's output.
  const stored = src.indexOf("metadata: stampServiceEstimate(persistedRequestMetadata(requestData.metadata), estimateAudience, estimateCatalog),");
  assert.ok(check > 0 && insert > check && stored > insert, "check → insert(persistedRequestMetadata)");
  assert.doesNotMatch(src, /metadata: requestData\.metadata \?\? \{\}/);
});

test("persistedRequestMetadata: no metadata → {}, a non-object as sent, a memo-review order and an unknown intake as sent", () => {
  assert.deepEqual(persistedRequestMetadata(undefined), {});
  assert.deepEqual(persistedRequestMetadata(null), {});
  assert.equal(persistedRequestMetadata("x"), "x");
  const brief = { service: "brief_review", intake: { service: "brief_review", extra: "kept" } };
  assert.deepEqual(persistedRequestMetadata(brief), brief);
  const unknown = { intake: { service: "case_brief", note: "x" } };
  assert.deepEqual(persistedRequestMetadata(unknown), unknown);
});

// ─── Message ─────────────────────────────────────────────────────────────────

test("the 400 message names every missing piece, in Arabic", () => {
  const msg = intakeErrorMessageAr(["نوع المذكرة مطلوب", "الفرع القانوني مطلوب"]);
  assert.ok(msg.includes("نوع المذكرة مطلوب"));
  assert.ok(msg.includes("الفرع القانوني مطلوب"));
  assert.ok(!/[a-zA-Z]/.test(msg));
});

test("R12: a pasted contract survives the guard and what is stored", () => {
  const raw = { schemaVersion: 1, service: "contracts", mode: "review", representing: "الطرف الأول", attachments: [], contractText: "ع".repeat(100) };
  const check = validateContractsIntake(raw);
  assert.equal(check.ok, true);
  const metadata = { service: "contracts", serviceTitleAr: "خدمة", intake: check.value, attachments: [] };
  assert.equal(checkOrderIntake(metadata).kind, "ok");
  const stored = persistedRequestMetadata(metadata) as { intake: { contractText?: string } };
  assert.equal(stored.intake.contractText, "ع".repeat(100));
});

test("S5-B1: an optional key the validator drops is not stored (customLanguageLayout \"triple\")", () => {
  const metadata = { service: "contracts", intake: { ...contractsDraftRaw, customLanguageLayout: "triple" }, attachments: [] };
  assert.equal(checkOrderIntake(metadata).kind, "ok");
  const stored = persistedRequestMetadata(metadata) as { intake: Record<string, unknown> };
  assert.equal("customLanguageLayout" in stored.intake, false);
});

test("S5-B1: an unknown intake key is not stored", () => {
  const metadata = { service: "contracts", intake: { ...contractsDraftRaw, injected: { a: 1 } }, attachments: [] };
  assert.equal(checkOrderIntake(metadata).kind, "ok");
  const stored = persistedRequestMetadata(metadata) as { intake: Record<string, unknown> };
  assert.equal("injected" in stored.intake, false);
});

test("S5-B1: contract extras are bounded and contracts-only", () => {
  const storedIntake = (extra: Record<string, unknown>) =>
    (persistedRequestMetadata({ service: "contracts", intake: { ...contractsDraftRaw, ...extra } }) as { intake: Record<string, unknown> }).intake;
  assert.equal("contractId" in storedIntake({ contractId: { a: 1 } }), false, "not a string");
  assert.equal("contractId" in storedIntake({ contractId: "   " }), false, "nothing after the trim");
  assert.equal("contractTitle" in storedIntake({ contractTitle: "x".repeat(201) }), false, "past the bound");
  assert.equal(storedIntake({ contractTitle: "x".repeat(200) }).contractTitle, "x".repeat(200), "at the bound");
  assert.equal(storedIntake({ contractId: "c-77" }).contractId, "c-77");
  assert.equal(storedIntake({ contractId: "  c-77 " }).contractId, "c-77", "stored trimmed");
  // Another wizard's intake never keeps them.
  const draft = persistedRequestMetadata({ service: "draft", intake: { ...draftRaw, contractId: "c-1" } }) as { intake: Record<string, unknown> };
  assert.equal("contractId" in draft.intake, false);
});

test("S5-B1 (R12): pasted contract text and the S6 estimate stamp both survive, composed as the route composes them", () => {
  const check = validateContractsIntake({ ...contractsReviewRaw, attachments: [], contractText: "ع".repeat(100) });
  assert.ok(check.ok);
  if (!check.ok) return;
  // A catalogue service: the stamp prices it, and the team still reads the text.
  const catalogued = { service: "contract-review", originalPrice: 1, intake: check.value };
  assert.equal(checkOrderIntake(catalogued).kind, "ok");
  const stamped = stampServiceEstimate(persistedRequestMetadata(catalogued), "corporate", CLIENT_SERVICE_CATALOG) as {
    intake: { contractText?: string };
    originalPrice: number;
    quoteSource: string;
  };
  assert.equal(stamped.intake.contractText, "ع".repeat(100));
  assert.equal(stamped.quoteSource, "server");
  assert.equal(stamped.originalPrice, 800);

  // The wizard's own service: the stamp prices nothing, and the text is still there.
  const wizard = { service: "contracts", intake: check.value, attachments: [] };
  const plain = stampServiceEstimate(persistedRequestMetadata(wizard), "corporate", CLIENT_SERVICE_CATALOG) as {
    intake: { contractText?: string };
    quoteSource?: string;
  };
  assert.equal(plain.intake.contractText, "ع".repeat(100));
  assert.equal(plain.quoteSource, undefined);
});
