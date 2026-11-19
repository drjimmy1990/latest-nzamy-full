/**
 * fakeLicence.test.ts — owner file 19 §1ب.2 (l9-secleak). The match and the
 * wiring: the admin approval refuses a 1448-LAW- licence before it writes and
 * reads the database trigger's refusal; the instant approval reads it too.
 * The database half: supabase/tests/rls/l9_secleak.test.sql (L1–L3).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isFakeTestLicence, isFakeLicenceDbError, FAKE_LICENCE_REFUSAL_AR } from "./fakeLicence.ts";

const root = join(import.meta.dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8").replace(/\r\n/g, "\n");

test("every spelling of the fake pattern is caught", () => {
  for (const lic of ["1448-LAW-001", "1448-LAW-010", "1448 law 7", "1448/LAW/001", "١٤٤٨-law-٠٠٢", "۱۴۴۸LAW", " 1448–LAW–013 ", "1448_law-011", "1448LAW"]) {
    assert.equal(isFakeTestLicence(lic), true, lic);
  }
});

test("NEGATIVE: real-looking numbers, empty and partial patterns are not caught", () => {
  for (const lic of ["45/12345", "1448", "LAW-1448-001", "1449-LAW-001", "14480001", "", null, undefined, "١٤٤٨"]) {
    assert.equal(isFakeTestLicence(lic as string | null | undefined), false, String(lic));
  }
});

test("the database refusal is recognised by code AND message only", () => {
  assert.equal(isFakeLicenceDbError({ code: "23514", message: "fake_test_licence: a 1448-LAW- licence number is a test number and is never verified" }), true);
  assert.equal(isFakeLicenceDbError({ code: "23514", message: "new row violates check constraint" }), false);
  assert.equal(isFakeLicenceDbError({ code: "23505", message: "fake_test_licence" }), false);
  assert.equal(isFakeLicenceDbError(null), false);
  assert.match(FAKE_LICENCE_REFUSAL_AR, /1448-LAW-/);
});

test("the SQL and the app use the same match", () => {
  const sql = read("supabase/migrations/20261129_20_secleak_contracts_shares_licences.sql");
  assert.match(sql, /'٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'\),\s*'\[\^0-9A-Za-z\]\+', '', 'g'\)\) like '1448LAW%'/);
  assert.match(sql, /message = 'fake_test_licence: /);
});

test("the admin approval refuses a fake licence before writing, and reads the trigger's refusal", () => {
  const src = read("src/app/api/v1/admin/verifications/[id]/route.ts");
  const pre = src.indexOf("isFakeTestLicence(");
  const write = src.indexOf('.from("lawyer_profiles")\n    .update(');
  assert.ok(pre > -1 && write > -1 && pre < write, "the pre-check runs before the first update");
  assert.match(src, /action === "approve"/);
  assert.ok((src.match(/isFakeLicenceDbError\(/g) ?? []).length >= 2, "both the lawyer and the provider update read the refusal");
  assert.match(src, /FAKE_LICENCE_REFUSAL_AR \}, \{ status: 422 \}/);
});

test("the instant approval reads the trigger's refusal and holds the account", () => {
  const approve = read("src/lib/lawyerSignup/approve.ts");
  assert.match(approve, /if \(isFakeLicenceDbError\(error\)\) return "fake_licence";/);
  const service = read("src/lib/lawyerSignup/service.ts");
  assert.match(service, /result === "fake_licence" \? "licence_fake_test"/);
});
