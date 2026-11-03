import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isPleadingDraftIntake, validateDraftIntake, SERVICE_TYPE_BY_KEY,
  PARTY_ROLE_OTHER, partyRepresentativeRole, representativeIdOk, representativeIdValid, REPRESENTATIVE_ID_ERROR,
  draftPartiesShown, partyForIntake,
} from "./orderIntake.ts";

const valid = {
  schemaVersion: 1,
  service: "draft",
  clientRole: "plaintiff",
  memoType: "case",
  legalBranch: "عمالي",
  caseText: "و".repeat(40),
  parties: { one: { type: "individual", fullName: "محمد" }, two: { type: "company", companyName: "شركة" } },
  attachments: [],
};

test("accepts a well-formed intake", () => {
  const r = validateDraftIntake(valid);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.legalBranch, "عمالي");
});

test("rejects a non-object", () => {
  const r = validateDraftIntake(null);
  assert.equal(r.ok, false);
});

test("rejects caseText shorter than 30 characters", () => {
  const r = validateDraftIntake({ ...valid, caseText: "قصير" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes("الوقائع")));
});

test("short or empty facts pass when the documents carry them", () => {
  const r = validateDraftIntake({ ...valid, caseText: "", attachments: [{ documentId: 7, name: "لائحة.pdf", size: 10 }] });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.caseText, "");
});

test("a specialist mode needs neither a client role nor a branch", () => {
  for (const memoType of ["arbitration", "notary", "report", "minutes"]) {
    const r = validateDraftIntake({ ...valid, memoType, memoSubType: "x", clientRole: "", legalBranch: "" });
    assert.equal(r.ok, true, memoType);
    if (r.ok) assert.equal("clientRole" in r.value, false, "no role is stored for it");
  }
  const pleading = validateDraftIntake({ ...valid, clientRole: "", legalBranch: "" });
  assert.equal(pleading.ok, false, "a pleading still needs both");
  if (!pleading.ok) assert.equal(pleading.errors.length, 2);
});

test("a pleading draft order is told apart from a specialist one (Art. 18 gate)", () => {
  assert.equal(isPleadingDraftIntake(valid), true);
  assert.equal(isPleadingDraftIntake({ ...valid, memoType: "appeal" }), true);
  assert.equal(isPleadingDraftIntake({ ...valid, memoType: "notary" }), false);
  assert.equal(isPleadingDraftIntake({ ...valid, service: "contracts" }), false);
  assert.equal(isPleadingDraftIntake(null), false);
});

test("rejects an unknown clientRole", () => {
  const r = validateDraftIntake({ ...valid, clientRole: "judge" });
  assert.equal(r.ok, false);
});

test("collects every error, not just the first", () => {
  const r = validateDraftIntake({ ...valid, caseText: "x", legalBranch: "" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.length >= 2);
});

test("rejects an attachment missing documentId", () => {
  const r = validateDraftIntake({ ...valid, attachments: [{ name: "a.pdf", size: 10 }] });
  assert.equal(r.ok, false);
});

test("accepts a numeric documentId (PostgREST bigserial arrives as a JS number, not a string)", () => {
  const r = validateDraftIntake({ ...valid, attachments: [{ documentId: 123, name: "a.pdf", size: 10 }] });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.attachments.length, 1);
    assert.equal(r.value.attachments[0].documentId, "123");
    assert.equal(typeof r.value.attachments[0].documentId, "string");
  }
});

test("rejects an attachment with a non-finite numeric documentId", () => {
  const r = validateDraftIntake({ ...valid, attachments: [{ documentId: NaN, name: "a.pdf", size: 10 }] });
  assert.equal(r.ok, false);
});

test("maps every service key to a service_requests type", () => {
  assert.equal(SERVICE_TYPE_BY_KEY.draft, "ai_draft");
  assert.equal(SERVICE_TYPE_BY_KEY.legal_opinion, "ai_legal_opinion");
});

test("rejects an intake with wrong service value", () => {
  const r = validateDraftIntake({ ...valid, service: "contracts" });
  assert.equal(r.ok, false);
});

test("rejects an intake with missing service key", () => {
  const r = validateDraftIntake({ ...valid, service: undefined });
  assert.equal(r.ok, false);
});

test("representative (§3.5-3b): the ID is optional, 10 digits starting 1 or 2 when typed", () => {
  const company = (representativeId?: string) => ({ type: "company", representativeId });
  assert.equal(representativeIdOk(company()), true, "absent");
  assert.equal(representativeIdOk(company("  ")), true, "blank");
  assert.equal(representativeIdOk(company("1023456789")), true);
  assert.equal(representativeIdOk(company("٢٠٢٣٤٥٦٧٨٩")), true, "Arabic-Indic digits");
  for (const bad of ["3023456789", "102345678", "10234567890", "abc", "ID 1023456789", "1023-456789", "1O234567890"]) {
    assert.equal(representativeIdOk(company(bad)), false, bad);
    assert.equal(representativeIdValid(bad), false, bad);
  }
  assert.equal(representativeIdOk(null), true, "not a party object: nothing to check");
});

test("representative (§3.5-3b): a bad ID left behind after switching to فرد or جهة blocks nothing", () => {
  // The field shows for a company only; a stale value on another type has no field to fix it.
  assert.equal(representativeIdOk({ type: "individual", fullName: "خالد", representativeId: "3000000000" }), true);
  assert.equal(representativeIdOk({ type: "government", entityName: "جهة", representativeId: "12" }), true);
  assert.equal(representativeIdOk({ representativeId: "3000000000" }), true, "no type: not a company");
  const stale = validateDraftIntake({ ...valid, parties: { ...valid.parties, one: { type: "individual", fullName: "محمد", representativeId: "3000000000" } } });
  assert.equal(stale.ok, true);
});

test("representative (§3.5-3b): «أخرى» means the typed capacity", () => {
  assert.equal(partyRepresentativeRole({ representativeRole: "مدير عام", representativeRoleOther: "x" }), "مدير عام");
  assert.equal(partyRepresentativeRole({ representativeRole: PARTY_ROLE_OTHER, representativeRoleOther: " وكيل شرعي " }), "وكيل شرعي");
  assert.equal(partyRepresentativeRole({ representativeRole: PARTY_ROLE_OTHER }), "");
  assert.equal(partyRepresentativeRole(null), "");
});

test("the draft intake refuses a malformed representative ID and keeps a valid one with «أخرى»", () => {
  const one = { type: "company", companyName: "شركة", representativeId: "3000000000" };
  const bad = validateDraftIntake({ ...valid, parties: { ...valid.parties, one } });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.ok(bad.errors.includes(`${REPRESENTATIVE_ID_ERROR} (الطرف الأول)`));
  const two = { type: "company", companyName: "شركة", representativeId: "1023456789", representativeRole: PARTY_ROLE_OTHER, representativeRoleOther: "وكيل" };
  const ok = validateDraftIntake({ ...valid, parties: { ...valid.parties, two } });
  assert.equal(ok.ok, true);
  if (ok.ok) assert.deepEqual(ok.value.parties.two, two, "carried to the order as typed");
  const arabic = validateDraftIntake({ ...valid, parties: { ...valid.parties, two: { ...two, representativeId: " ١٠٢٣٤٥٦٧٨٩ " } } });
  assert.equal(arabic.ok, true);
  if (arabic.ok) assert.equal(arabic.value.parties.two.representativeId, "1023456789", "the order keeps 10 ASCII digits, as the AI run does");
});

test("draftPartiesShown mirrors StepCase: both forms for «تحرير دعوى», party two not on a committee branch", () => {
  assert.deepEqual(draftPartiesShown("case", "عمالي"), { one: true, two: true });
  assert.deepEqual(draftPartiesShown("case", "ضريبية"), { one: true, two: false });
  assert.deepEqual(draftPartiesShown("reply", "عمالي"), { one: false, two: false });
  assert.deepEqual(draftPartiesShown("appeal", "زكوية"), { one: false, two: false });
});

const BAD_COMPANY = { type: "company", companyName: "شركة", representativeId: "3", representativeRole: PARTY_ROLE_OTHER, representativeRoleOther: "وكيل" };

test("I1: a bad ID typed in «تحرير دعوى», then the memo switched to reply or appeal, blocks nothing and is not sent", () => {
  for (const memoType of ["reply", "appeal"]) {
    const r = validateDraftIntake({ ...valid, memoType, parties: { one: BAD_COMPANY, two: BAD_COMPANY } });
    assert.equal(r.ok, true, memoType);
    if (!r.ok) continue;
    for (const party of [r.value.parties.one, r.value.parties.two] as Record<string, unknown>[]) {
      assert.equal("representativeId" in party, false, memoType);
      assert.equal("representativeRole" in party, false, memoType);
      assert.equal("representativeRoleOther" in party, false, memoType);
      assert.equal(party.companyName, "شركة", "the rest of the party passes as before");
    }
  }
});

test("I1: a bad ID on party two, then a committee branch (party two fixed), blocks nothing; party one is still checked", () => {
  const hiddenTwo = validateDraftIntake({ ...valid, legalBranch: "ضريبية", parties: { one: valid.parties.one, two: BAD_COMPANY } });
  assert.equal(hiddenTwo.ok, true);
  if (hiddenTwo.ok) assert.equal("representativeId" in (hiddenTwo.value.parties.two as Record<string, unknown>), false);
  const shownOne = validateDraftIntake({ ...valid, legalBranch: "ضريبية", parties: { one: BAD_COMPANY, two: valid.parties.two } });
  assert.equal(shownOne.ok, false);
  if (!shownOne.ok) assert.ok(shownOne.errors.includes(`${REPRESENTATIVE_ID_ERROR} (الطرف الأول)`));
});

test("M5: partyForIntake keeps only what the form means now", () => {
  const listed = partyForIntake({ type: "company", companyName: "ش", representativeRole: "مدير عام", representativeRoleOther: "قديم", representativeId: "1023456789" });
  assert.deepEqual(listed, { type: "company", companyName: "ش", representativeRole: "مدير عام", representativeId: "1023456789" }, "a stale «أخرى» text is dropped");
  const person = partyForIntake({ type: "individual", fullName: "خالد", representativeRole: "مدير", representativeRoleOther: "x", representativeId: "1023456789" });
  assert.deepEqual(person, { type: "individual", fullName: "خالد" }, "فرد carries no representative fields");
  const gov = partyForIntake({ type: "government", entityName: "جهة", representativeId: "1023456789" });
  assert.deepEqual(gov, { type: "government", entityName: "جهة" });
  const hidden = partyForIntake({ type: "company", companyName: "ش", representativeId: "1023456789" }, false);
  assert.deepEqual(hidden, { type: "company", companyName: "ش" }, "a hidden form sends none");
  assert.equal(partyForIntake(null), null);
});

test("the cleaned draft intake re-validates (the server guard checks the wizard's own output)", () => {
  const first = validateDraftIntake({ ...valid, legalBranch: "ضريبية", parties: { one: { ...BAD_COMPANY, representativeId: "٢٠٢٣٤٥٦٧٨٩" }, two: BAD_COMPANY } });
  assert.equal(first.ok, true);
  if (first.ok) assert.equal(validateDraftIntake(first.value).ok, true);
});
