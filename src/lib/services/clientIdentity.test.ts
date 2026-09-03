import test from "node:test";
import assert from "node:assert/strict";
import {
  CLIENT_FLAGS, isClientFlag, normalizeDigits, normalizeNationalId,
  isValidNationalId, isValidCommercialRegister, isValidTaxNumber,
  isValidUnifiedNumber700, feePairIssue,
} from "./clientIdentityRules.ts";
import { hashNationalId, normalizedCommercialRegister } from "./clientIdentityHash.ts";

test("the two judgemental flags are gone — the CHECK in the migration and this list agree", () => {
  assert.deepEqual([...CLIENT_FLAGS], ["vip", "new", "loyal", "urgent", "corporate", "inactive"]);
  assert.equal(isClientFlag("bad"), false);
  assert.equal(isClientFlag("late_pay"), false);
  assert.equal(isClientFlag("vip"), true);
});

test("Arabic-Indic digits normalise before validation", () => {
  assert.equal(normalizeDigits("١٠٢٣٤٥٦٧٨٩"), "1023456789");
  assert.equal(normalizeNationalId("١٠٢٣-٤٥٦٧ ٨٩"), "1023456789");
  assert.equal(isValidNationalId("١٠٢٣٤٥٦٧٨٩"), true);
});

test("a national id is 10 digits starting with 1 or 2 — nothing else", () => {
  assert.equal(isValidNationalId("1023456789"), true);
  assert.equal(isValidNationalId("2023456789"), true);
  assert.equal(isValidNationalId("3023456789"), false);
  assert.equal(isValidNationalId("102345678"), false);
  assert.equal(isValidNationalId("10234567890"), false);
  assert.equal(isValidNationalId(""), false);
});

test("commercial register, tax number, 700 number", () => {
  assert.equal(isValidCommercialRegister("1010123456"), true);
  assert.equal(isValidCommercialRegister("١٠١٠١٢٣٤٥٦"), true);
  assert.equal(isValidCommercialRegister("12345"), false);
  assert.equal(isValidTaxNumber("300012345600003"), true);
  assert.equal(isValidTaxNumber("400012345600003"), false);
  assert.equal(isValidUnifiedNumber700("7001234567"), true);
  assert.equal(isValidUnifiedNumber700("1001234567"), false);
});

test("the hash is sha256 hex of the normalised digits, and never the number", () => {
  const h = hashNationalId("١٠٢٣٤٥٦٧٨٩");
  assert.ok(h && /^[0-9a-f]{64}$/.test(h), "matches the column CHECK");
  assert.equal(h, hashNationalId("1023456789"), "same person, same hash, whatever the digit script");
  assert.notEqual(h, hashNationalId("1023456788"));
  assert.equal(hashNationalId("   "), null);
  assert.ok(!h!.includes("1023456789"));
});

test("the commercial register is normalised, not hashed — it is public information", () => {
  assert.equal(normalizedCommercialRegister("١٠١٠-١٢٣٤٥٦"), "1010123456");
  assert.equal(normalizedCommercialRegister(""), null);
});

test("the fee pair rule: an advance needs a positive total and cannot exceed it", () => {
  assert.equal(feePairIssue(null, null), null);
  assert.equal(feePairIssue(1000, null), null);
  assert.equal(feePairIssue(1000, 400), null);
  assert.ok(feePairIssue(null, 400));
  assert.ok(feePairIssue(0, 400));
  assert.ok(feePairIssue(1000, 1400));
  assert.ok(feePairIssue(-1, null));
  for (const msg of [feePairIssue(null, 400), feePairIssue(1000, 1400)]) {
    assert.ok(msg && !/[A-Za-z]/.test(msg), "messages are screen copy, Arabic only");
  }
});
