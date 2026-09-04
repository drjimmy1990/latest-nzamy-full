import test from "node:test";
import assert from "node:assert/strict";
import {
  nationalityIssue,
  officeAddressIssue,
  licenseIssuedOnIssue,
  isValidIsoDate,
  validateEntitySettingsPatch,
  readEntitySettings,
  mergeEntitySettings,
  validateBusinessProfilePatch,
} from "./profileEntityFields.ts";

// ── nationality / office_address ────────────────────────────────────────────

test("nationality: null clears, a short string passes, over 60 chars is refused", () => {
  assert.equal(nationalityIssue(null), null);
  assert.equal(nationalityIssue("سعودي"), null);
  assert.equal(nationalityIssue("س".repeat(60)), null);
  assert.ok(nationalityIssue("س".repeat(61)));
  assert.ok(/[؀-ۿ]/.test(nationalityIssue("س".repeat(61))!));
});

test("nationality: a non-string, non-null value is refused", () => {
  assert.ok(nationalityIssue(42));
  assert.ok(nationalityIssue(["سعودي"]));
});

test("office_address: null clears, ≤200 chars passes, over 200 is refused", () => {
  assert.equal(officeAddressIssue(null), null);
  assert.equal(officeAddressIssue("ص".repeat(200)), null);
  assert.ok(officeAddressIssue("ص".repeat(201)));
});

// ── license_issued_on ───────────────────────────────────────────────────────

test("isValidIsoDate accepts a real calendar date and rejects a fake one", () => {
  assert.equal(isValidIsoDate("2026-01-15"), true);
  assert.equal(isValidIsoDate("2026-02-30"), false); // February has no 30th
  assert.equal(isValidIsoDate("2026-13-01"), false); // month 13
  assert.equal(isValidIsoDate("15-01-2026"), false); // wrong order
  assert.equal(isValidIsoDate("2026-1-5"), false);   // not zero-padded
});

test("license_issued_on: null clears, a real date passes, a fake date is refused", () => {
  assert.equal(licenseIssuedOnIssue(null), null);
  assert.equal(licenseIssuedOnIssue("2026-01-15"), null);
  assert.ok(licenseIssuedOnIssue("2026-02-30"));
  assert.ok(licenseIssuedOnIssue("not-a-date"));
  assert.ok(licenseIssuedOnIssue(20260115));
});

// ── entitySettings ───────────────────────────────────────────────────────────

test("entitySettings: a valid patch of string/number/null values is accepted as-is", () => {
  const v = validateEntitySettingsPatch({ roleTitle: "شريك", employeeCount: 5, department: null });
  assert.equal(v.ok, true);
  if (v.ok) assert.deepEqual(v.patch, { roleTitle: "شريك", employeeCount: 5, department: null });
});

test("entitySettings: an empty object validates to an empty patch", () => {
  const v = validateEntitySettingsPatch({});
  assert.equal(v.ok, true);
  if (v.ok) assert.deepEqual(v.patch, {});
});

test("entitySettings: not an object is refused", () => {
  assert.equal(validateEntitySettingsPatch(null).ok, false);
  assert.equal(validateEntitySettingsPatch([1, 2]).ok, false);
  assert.equal(validateEntitySettingsPatch("x").ok, false);
});

test("entitySettings: a key starting with a digit or holding a dash is refused", () => {
  assert.equal(validateEntitySettingsPatch({ "1role": "x" }).ok, false);
  assert.equal(validateEntitySettingsPatch({ "role-title": "x" }).ok, false);
  assert.equal(validateEntitySettingsPatch({ "": "x" }).ok, false);
});

test("entitySettings: a key over 41 characters is refused", () => {
  const longKey = "a".repeat(42);
  assert.equal(validateEntitySettingsPatch({ [longKey]: "x" }).ok, false);
  const okKey = "a".repeat(41);
  assert.equal(validateEntitySettingsPatch({ [okKey]: "x" }).ok, true);
});

test("entitySettings: a value that is not string/number/null is refused", () => {
  assert.equal(validateEntitySettingsPatch({ department: { nested: true } }).ok, false);
  assert.equal(validateEntitySettingsPatch({ department: [1, 2] }).ok, false);
  assert.equal(validateEntitySettingsPatch({ department: true }).ok, false);
});

test("entitySettings: a non-finite number is refused, a string over 500 chars is refused", () => {
  assert.equal(validateEntitySettingsPatch({ n: NaN }).ok, false);
  assert.equal(validateEntitySettingsPatch({ n: Infinity }).ok, false);
  assert.equal(validateEntitySettingsPatch({ s: "x".repeat(501) }).ok, false);
  assert.equal(validateEntitySettingsPatch({ s: "x".repeat(500) }).ok, true);
});

test("readEntitySettings: reads metadata.settings, defaults to {} when absent or malformed", () => {
  assert.deepEqual(readEntitySettings({ settings: { a: 1 } }), { a: 1 });
  assert.deepEqual(readEntitySettings({}), {});
  assert.deepEqual(readEntitySettings(null), {});
  assert.deepEqual(readEntitySettings({ settings: "not an object" }), {});
  assert.deepEqual(readEntitySettings({ settings: [1, 2] }), {});
});

test("mergeEntitySettings: shallow-merges into settings, leaving sibling metadata keys and untouched settings keys alone", () => {
  const existing = { branding: { color: "gold" }, settings: { roleTitle: "شريك", department: "تجاري" } };
  const merged = mergeEntitySettings(existing, { department: "قضايا", employeeCount: 5 });
  assert.deepEqual(merged, {
    branding: { color: "gold" },
    settings: { roleTitle: "شريك", department: "قضايا", employeeCount: 5 },
  });
});

test("mergeEntitySettings: a null value in the patch clears (not deletes) that settings key", () => {
  const merged = mergeEntitySettings({ settings: { roleTitle: "شريك" } }, { roleTitle: null });
  assert.deepEqual(merged, { settings: { roleTitle: null } });
});

test("mergeEntitySettings: missing/malformed existing metadata starts from {}", () => {
  assert.deepEqual(mergeEntitySettings(null, { a: 1 }), { settings: { a: 1 } });
  assert.deepEqual(mergeEntitySettings("garbage", { a: 1 }), { settings: { a: 1 } });
});

// ── businessProfile ──────────────────────────────────────────────────────────

const normalizeCr = (raw: string) => raw.replace(/\D/g, "");
const isCapacity = (v: unknown): v is string =>
  typeof v === "string" && ["owner", "partner", "manager", "authorized_signatory", "legal_counsel", "other"].includes(v);

test("businessProfile: a full valid patch normalizes as expected", () => {
  const v = validateBusinessProfilePatch(
    { company_name_ar: "  شركة الأفق  ", cr_number: "CR 1010-123 456", legal_rep_name: "عبدالعزيز", legal_rep_capacity: "owner" },
    normalizeCr,
    isCapacity,
  );
  assert.equal(v.ok, true);
  if (v.ok) {
    assert.deepEqual(v.patch, {
      company_name_ar: "شركة الأفق",
      cr_number: "1010123456",
      legal_rep_name: "عبدالعزيز",
      legal_rep_capacity: "owner",
    });
  }
});

test("businessProfile: company_name_ar cannot be null (NOT NULL column) or blank", () => {
  assert.equal(validateBusinessProfilePatch({ company_name_ar: null }, normalizeCr, isCapacity).ok, false);
  assert.equal(validateBusinessProfilePatch({ company_name_ar: "   " }, normalizeCr, isCapacity).ok, false);
  assert.equal(validateBusinessProfilePatch({ company_name_ar: "x".repeat(201) }, normalizeCr, isCapacity).ok, false);
});

test("businessProfile: cr_number / legal_rep_name / legal_rep_capacity all accept null (they clear)", () => {
  const v = validateBusinessProfilePatch(
    { cr_number: null, legal_rep_name: null, legal_rep_capacity: null },
    normalizeCr,
    isCapacity,
  );
  assert.equal(v.ok, true);
  if (v.ok) assert.deepEqual(v.patch, { cr_number: null, legal_rep_name: null, legal_rep_capacity: null });
});

test("businessProfile: a CR of pure punctuation (normalizes to empty) is refused", () => {
  assert.equal(validateBusinessProfilePatch({ cr_number: "---" }, normalizeCr, isCapacity).ok, false);
});

test("businessProfile: a blank CR string clears to null rather than being refused", () => {
  const v = validateBusinessProfilePatch({ cr_number: "   " }, normalizeCr, isCapacity);
  assert.equal(v.ok, true);
  if (v.ok) assert.equal(v.patch.cr_number, null);
});

test("businessProfile: an unrecognised legal_rep_capacity is refused", () => {
  assert.equal(validateBusinessProfilePatch({ legal_rep_capacity: "ceo" }, normalizeCr, isCapacity).ok, false);
});

test("businessProfile: an unknown top-level key is ignored, not refused", () => {
  const v = validateBusinessProfilePatch({ vat_number: "12345" }, normalizeCr, isCapacity);
  assert.equal(v.ok, true);
  if (v.ok) assert.deepEqual(v.patch, {});
});

test("businessProfile: not an object is refused", () => {
  assert.equal(validateBusinessProfilePatch(null, normalizeCr, isCapacity).ok, false);
  assert.equal(validateBusinessProfilePatch("x", normalizeCr, isCapacity).ok, false);
});
