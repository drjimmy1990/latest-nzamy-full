import { test } from "node:test";
import assert from "node:assert/strict";
import { validateContractsIntake } from "./orderIntake.contracts.ts";

// Named per PartyData's "individual" shape (fullName) — one of the three
// shapes validated below. companyName/entityName are exercised by their own
// tests further down (Task: require the contract parties).
const validDraftBase = {
  schemaVersion: 1,
  service: "contracts",
  mode: "draft",
  complexity: "simple",
  contractType: "sale",
  contractDesc: "عقد بيع عقار سكني بين طرفين وفق الشروط المتفق عليها",
  parties: {
    one: { type: "individual", fullName: "أحمد سالم" },
    two: { type: "individual", fullName: "خالد فهد" },
  },
  attachments: [],
};

const validReview = {
  schemaVersion: 1,
  service: "contracts",
  mode: "review",
  representing: "party_one",
  concerns: "بند الفسخ",
  attachments: [{ documentId: "1", name: "contract.pdf", size: 100 }],
};

test("accepts a well-formed draft-mode intake", () => {
  const r = validateContractsIntake(validDraftBase);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.mode, "draft");
});

test("accepts a well-formed review-mode intake", () => {
  const r = validateContractsIntake(validReview);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.mode, "review");
});

test("rejects a non-object", () => {
  const r = validateContractsIntake(null);
  assert.equal(r.ok, false);
});

test("rejects an intake with wrong service discriminant", () => {
  const r = validateContractsIntake({ ...validDraftBase, service: "wargaming" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes("الخدمة")));
});

test("rejects an intake with missing service key", () => {
  const r = validateContractsIntake({ ...validDraftBase, service: undefined });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes("الخدمة")));
});

test("rejects a missing required field (mode)", () => {
  const r = validateContractsIntake({ ...validDraftBase, mode: undefined });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes("الوضع") || e.includes("وضع")));
});

test("rejects a blank mode", () => {
  const r = validateContractsIntake({ ...validDraftBase, mode: "" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes("وضع")));
});

test("rejects an unknown mode", () => {
  const r = validateContractsIntake({ ...validDraftBase, mode: "delete" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes("وضع")));
});

test("draft mode does not require attachments", () => {
  const r = validateContractsIntake({ ...validDraftBase, attachments: [] });
  assert.equal(r.ok, true);
});

test("review mode requires at least one attachment", () => {
  const r = validateContractsIntake({ ...validReview, attachments: [] });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes("مرفق") || e.includes("العقد")));
});

test("rejects an attachment missing documentId (malformed attachment)", () => {
  const r = validateContractsIntake({ ...validReview, attachments: [{ name: "a.pdf", size: 10 }] });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes("المرفق")));
});

test("accepts a numeric documentId (PostgREST bigserial arrives as a JS number, not a string)", () => {
  const r = validateContractsIntake({ ...validReview, attachments: [{ documentId: 456, name: "a.pdf", size: 10 }] });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.attachments.length, 1);
    assert.equal(r.value.attachments[0].documentId, "456");
    assert.equal(typeof r.value.attachments[0].documentId, "string");
  }
});

test("collects every error, not just the first", () => {
  const r = validateContractsIntake({ service: "wrong", mode: "delete", attachments: [{ name: "a.pdf" }] });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.length >= 3);
});

// ── Coordinator ruling on af0929e: draft-mode contractDesc minimum ─────────
// "an order the admin cannot fulfil must not be submittable" — draft mode
// has no uploaded document, so contractDesc IS the brief the admin drafts
// from.

test("rejects draft mode with no contractDesc", () => {
  const r = validateContractsIntake({ ...validDraftBase, contractDesc: undefined });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes("وصف العقد")));
});

test("rejects draft mode with a contractDesc shorter than 20 characters", () => {
  const r = validateContractsIntake({ ...validDraftBase, contractDesc: "بيع عقار" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes("وصف العقد")));
});

test("review mode does not require contractDesc", () => {
  const r = validateContractsIntake({ ...validReview, contractDesc: undefined });
  assert.equal(r.ok, true);
});

// ── Coordinator ruling on af0929e: review-mode representing is required ────
// The uploaded contract is the deliverable (attachments, already required
// above), but the admin still needs to know which side the client is on.

test("rejects review mode with no representing", () => {
  const r = validateContractsIntake({ ...validReview, representing: undefined });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes("الطرف")));
});

test("review mode's representing has no length minimum", () => {
  const r = validateContractsIntake({ ...validReview, representing: "أ" });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.representing, "أ");
});

test("draft mode does not require representing", () => {
  const r = validateContractsIntake({ ...validDraftBase, representing: undefined });
  assert.equal(r.ok, true);
});

// ── Task C2: courtType and custom-language fields are optional, unvalidated
// passthrough (same shape as DraftIntakeV1's `judgment`) — StepContext and
// StepDomain collect real data here that must reach the admin's order.

test("carries courtType through when present", () => {
  const r = validateContractsIntake({ ...validDraftBase, courtType: "المحكمة التجارية" });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.courtType, "المحكمة التجارية");
});

test("omits courtType when absent", () => {
  const r = validateContractsIntake(validDraftBase);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal("courtType" in r.value, false);
});

test("carries custom-language fields through when present and valid", () => {
  const r = validateContractsIntake({
    ...validDraftBase,
    language: "custom",
    customLanguageName: "الفرنسية",
    customLanguageLayout: "dual",
    customLanguageBase: "ar",
  });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.customLanguageName, "الفرنسية");
    assert.equal(r.value.customLanguageLayout, "dual");
    assert.equal(r.value.customLanguageBase, "ar");
  }
});

test("drops an out-of-range customLanguageLayout/customLanguageBase instead of passing it through", () => {
  const r = validateContractsIntake({
    ...validDraftBase,
    customLanguageLayout: "triple",
    customLanguageBase: "fr",
  });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal("customLanguageLayout" in r.value, false);
    assert.equal("customLanguageBase" in r.value, false);
  }
});

// ── Task 12: require the contract parties before a drafting order can be
// sent (owner's 16 August technical report, pending-decision 2). Draft mode
// previously let both party names ship blank — the submit recap only
// flagged this amber. PartyData (src/components/contracts/types.ts) carries
// a different name field per party.type: fullName (individual), companyName
// (company), entityName (government) — a party is "named" when at least one
// of those three is non-empty, checked independently of whatever `type` the
// payload claims (the validator receives `unknown`, so it must not trust an
// attacker-forged type discriminator to decide which field to check).

test("draft mode rejects an intake with no party names", () => {
  const r = validateContractsIntake({
    ...validDraftBase,
    parties: { one: {}, two: {} },
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("الأطراف")));
});

test("draft mode rejects an intake with parties missing entirely", () => {
  const r = validateContractsIntake({ ...validDraftBase, parties: undefined });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes("الأطراف")));
});

test("draft mode rejects an intake where only party one is named", () => {
  const r = validateContractsIntake({
    ...validDraftBase,
    parties: { one: { type: "individual", fullName: "أحمد سالم" }, two: {} },
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes("الأطراف")));
});

test("draft mode rejects an intake where only party two is named", () => {
  const r = validateContractsIntake({
    ...validDraftBase,
    parties: { one: {}, two: { type: "individual", fullName: "خالد فهد" } },
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes("الأطراف")));
});

test("draft mode rejects a party whose name field is present but blank/whitespace", () => {
  const r = validateContractsIntake({
    ...validDraftBase,
    parties: {
      one: { type: "individual", fullName: "   " },
      two: { type: "individual", fullName: "خالد فهد" },
    },
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes("الأطراف")));
});

test("draft mode accepts a company party named via companyName (not fullName)", () => {
  const r = validateContractsIntake({
    ...validDraftBase,
    parties: {
      one: { type: "company", companyName: "شركة الأمانة للمقاولات" },
      two: { type: "individual", fullName: "خالد فهد" },
    },
  });
  assert.equal(r.ok, true);
});

test("draft mode accepts a government party named via entityName (not fullName)", () => {
  const r = validateContractsIntake({
    ...validDraftBase,
    parties: {
      one: { type: "government", entityName: "أمانة منطقة الرياض" },
      two: { type: "individual", fullName: "خالد فهد" },
    },
  });
  assert.equal(r.ok, true);
});

test("draft mode accepts all three party shapes named across both parties", () => {
  const r = validateContractsIntake({
    ...validDraftBase,
    parties: {
      one: { type: "company", companyName: "شركة الأمانة للمقاولات" },
      two: { type: "government", entityName: "أمانة منطقة الرياض" },
    },
  });
  assert.equal(r.ok, true);
});

test("review mode does not require named parties", () => {
  // Review mode never collects party1Data/party2Data (StepRIdentity collects
  // rPartyFocus/rOtherParty instead) — buildReviewIntake() never sets
  // `parties` at all, so the gate above is draft-mode-only.
  const r = validateContractsIntake({ ...validReview, parties: undefined });
  assert.equal(r.ok, true);
});
