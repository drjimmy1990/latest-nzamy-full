import test from "node:test";
import assert from "node:assert/strict";
import { extractCaseParties, normalizePartyName } from "./caseParties.ts";

test("normalizePartyName folds the spellings a name is typed in", () => {
  assert.equal(normalizePartyName("  شَرِكَةُ   الأُفُق  "), normalizePartyName("شركة الافق"));
  assert.equal(normalizePartyName("مؤسسة النور"), normalizePartyName("مؤسسه النور"));
  assert.equal(normalizePartyName("علـــي"), normalizePartyName("علي"));
  assert.equal(normalizePartyName("مصطفى"), normalizePartyName("مصطفي"));
  assert.equal(normalizePartyName("إبراهيم"), normalizePartyName("ابراهيم"));
  assert.equal(normalizePartyName("ACME  Co"), "acme co");
  assert.equal(normalizePartyName("   "), "");
});

test("a lawyer-added case: the client only (AddCaseModal records no opponent)", () => {
  const parties = extractCaseParties({
    requester: { name: "شركة الأفق", userId: "u1" },
    metadata: { court: "المحكمة التجارية", priority: "normal" },
    lawyerClientId: "c-1",
  });
  assert.deepEqual(parties, [{ key: "client:c-1", name: "شركة الأفق", role: "client" }]);
});

test("intake parties: party one is the client's side, party two the opponent; ids never leave", () => {
  const parties = extractCaseParties({
    requester: { name: "محمد" },
    metadata: {
      intake: {
        clientRole: "plaintiff",
        parties: {
          one: { type: "individual", fullName: "محمد", idNumber: "1012345678" },
          two: { type: "company", companyName: "مؤسسة النور", commercialReg: "1010999999" },
        },
        otherParty: "مؤسسه النور",
      },
    },
  });
  assert.deepEqual(parties, [
    { key: "client:requester", name: "محمد", role: "client" },
    { key: `opponent:${normalizePartyName("مؤسسة النور")}`, name: "مؤسسة النور", role: "opponent" },
  ]);
  assert.ok(!JSON.stringify(parties).includes("1012345678"));
  assert.ok(!JSON.stringify(parties).includes("1010999999"));
});

test("a government opponent and a missing or malformed intake", () => {
  const gov = extractCaseParties({
    requester: { name: "" },
    metadata: { intake: { parties: { one: {}, two: { type: "government", entityName: "هيئة الزكاة" } } } },
  });
  assert.deepEqual(gov.map((p) => [p.role, p.name]), [["opponent", "هيئة الزكاة"]]);
  assert.deepEqual(extractCaseParties({ requester: null, metadata: null }), []);
  assert.deepEqual(extractCaseParties({ requester: { name: "x" }, metadata: { intake: "junk" } }).length, 1);
});
