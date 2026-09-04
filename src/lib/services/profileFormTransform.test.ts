import test from "node:test";
import assert from "node:assert/strict";
import {
  isReadOnlyProfileField,
  splitCommaList,
  shapeFieldValue,
  buildProfileSubmitValues,
  readProfileFieldValue,
  type ProfileFieldLike,
} from "./profileFormTransform.ts";

const F = (key: string, target: ProfileFieldLike["target"], type?: ProfileFieldLike["type"]): ProfileFieldLike => ({
  key,
  target,
  type,
});

test("isReadOnlyProfileField: email is always read-only", () => {
  assert.equal(isReadOnlyProfileField(F("email", "profile")), true);
});

test("isReadOnlyProfileField: licenseExpiry is read-only only when it targets lawyer", () => {
  assert.equal(isReadOnlyProfileField(F("licenseExpiry", "lawyer")), true);
  assert.equal(isReadOnlyProfileField(F("licenseExpiry", "entitySettings")), false);
});

test("isReadOnlyProfileField: an ordinary field is not read-only", () => {
  assert.equal(isReadOnlyProfileField(F("city", "profile")), false);
});

test("splitCommaList: splits on Arabic and Latin commas, trims, drops blanks", () => {
  assert.deepEqual(splitCommaList("قانون تجاري، عقود ,  ملكية فكرية"), ["قانون تجاري", "عقود", "ملكية فكرية"]);
  assert.deepEqual(splitCommaList("  "), []);
  assert.deepEqual(splitCommaList(""), []);
  assert.deepEqual(splitCommaList("عنصر واحد"), ["عنصر واحد"]);
});

test("shapeFieldValue: a read-only field always shapes to undefined (dropped)", () => {
  assert.equal(shapeFieldValue(F("email", "profile"), "new@example.com"), undefined);
  assert.equal(shapeFieldValue(F("licenseExpiry", "lawyer"), "2026-01-01"), undefined);
});

test("shapeFieldValue: lawyer specialties splits into an array, even when empty", () => {
  assert.deepEqual(shapeFieldValue(F("specialties", "lawyer"), "تجاري، عقود"), ["تجاري", "عقود"]);
  assert.deepEqual(shapeFieldValue(F("specialties", "lawyer"), ""), []);
});

test("shapeFieldValue: a non-lawyer 'specialties' field is a plain scalar, not split", () => {
  assert.equal(shapeFieldValue(F("specialties", "entitySettings"), "تجاري، عقود"), "تجاري، عقود");
});

test("shapeFieldValue: number fields parse to a JS number, blank/unparsable omit", () => {
  assert.equal(shapeFieldValue(F("yearsExperience", "lawyer", "number"), "12"), 12);
  assert.equal(shapeFieldValue(F("yearsExperience", "lawyer", "number"), " 7 "), 7);
  assert.equal(shapeFieldValue(F("yearsExperience", "lawyer", "number"), ""), undefined);
  assert.equal(shapeFieldValue(F("yearsExperience", "lawyer", "number"), "not-a-number"), undefined);
});

test("shapeFieldValue: date fields — blank clears to null, a value is passed through sliced to 10 chars", () => {
  assert.equal(shapeFieldValue(F("licenseIssuedOn", "lawyer", "date"), ""), null);
  assert.equal(shapeFieldValue(F("licenseIssuedOn", "lawyer", "date"), "2026-01-15"), "2026-01-15");
  assert.equal(shapeFieldValue(F("licenseIssuedOn", "lawyer", "date"), "2026-01-15T00:00:00Z"), "2026-01-15");
});

test("shapeFieldValue: displayName/phone omit entirely when blank (never null, never '')", () => {
  assert.equal(shapeFieldValue(F("displayName", "profile"), "   "), undefined);
  assert.equal(shapeFieldValue(F("phone", "profile"), ""), undefined);
  assert.equal(shapeFieldValue(F("displayName", "profile"), "أحمد"), "أحمد");
});

test("shapeFieldValue: bio clears to '' (NOT NULL column), not null", () => {
  assert.equal(shapeFieldValue(F("bio", "lawyer"), "   "), "");
  assert.equal(shapeFieldValue(F("bio", "lawyer"), "نبذة"), "نبذة");
});

test("shapeFieldValue: an ordinary nullable field clears to null when blank", () => {
  assert.equal(shapeFieldValue(F("city", "profile"), "   "), null);
  assert.equal(shapeFieldValue(F("officeAddress", "lawyer"), ""), null);
  assert.equal(shapeFieldValue(F("city", "profile"), "الرياض"), "الرياض");
});

test("buildProfileSubmitValues: drops read-only and undefined-shaped fields, keeps the rest", () => {
  const fields: ProfileFieldLike[] = [
    F("displayName", "profile"),
    F("email", "profile"),
    F("phone", "profile"),
    F("city", "profile"),
    F("licenseExpiry", "lawyer"),
    F("yearsExperience", "lawyer", "number"),
  ];
  const out = buildProfileSubmitValues(fields, {
    displayName: "أحمد",
    email: "a@b.com",
    phone: "",
    city: "",
    licenseExpiry: "2030-01-01",
    yearsExperience: "9",
  });
  assert.deepEqual(out, { displayName: "أحمد", city: null, yearsExperience: 9 });
});

test("buildProfileSubmitValues: a field with no entry in formValues is skipped, not sent as undefined", () => {
  const fields: ProfileFieldLike[] = [F("displayName", "profile"), F("city", "profile")];
  const out = buildProfileSubmitValues(fields, { displayName: "أحمد" });
  assert.deepEqual(out, { displayName: "أحمد" });
  assert.equal("city" in out, false);
});

// ── buildProfileSubmitValues — diff-aware (loadedValues) ─────────────────────
//
// Task S1 finding: a NOT-NULL-but-nullable column that isn't on the schema
// yet (migration not run), or a field that renders blank only because its
// LOAD failed, must never be sent just because ProfileTab always seeds every
// field into formValues. `loadedValues` is the baseline that decides "did the
// caller actually touch this".

test("buildProfileSubmitValues: a field unchanged from loadedValues is omitted, even though it would otherwise shape to a real value", () => {
  const fields: ProfileFieldLike[] = [F("nationality", "profile"), F("city", "profile")];
  const out = buildProfileSubmitValues(
    fields,
    { nationality: "", city: "الرياض" }, // both identical to what was loaded
    { nationality: "", city: "الرياض" },
  );
  assert.deepEqual(out, {});
});

test("buildProfileSubmitValues: a field that DIFFERS from loadedValues is still shaped and included", () => {
  const fields: ProfileFieldLike[] = [F("nationality", "profile"), F("city", "profile")];
  const out = buildProfileSubmitValues(
    fields,
    { nationality: "سعودي", city: "الرياض" },
    { nationality: "", city: "الرياض" }, // only nationality was actually edited
  );
  assert.deepEqual(out, { nationality: "سعودي" });
});

test("buildProfileSubmitValues: a key ABSENT from loadedValues is always treated as changed (backward compatible with a 2-arg call)", () => {
  const fields: ProfileFieldLike[] = [F("city", "profile")];
  // loadedValues has no "city" entry at all — unknown baseline, so the field
  // is still shaped and included exactly as the pre-diff behavior did.
  const out = buildProfileSubmitValues(fields, { city: "" }, {});
  assert.deepEqual(out, { city: null });
});

test("buildProfileSubmitValues: the untouched-field guard closes the blank-overwrite risk of a failed load — a field left blank because the load failed for its table is never resent", () => {
  const fields: ProfileFieldLike[] = [F("licenseNumber", "lawyer"), F("officeAddress", "lawyer")];
  // Both fields loaded blank (the lawyer_profiles read failed, so the tab
  // could only seed ""); the caller never touched either.
  const out = buildProfileSubmitValues(
    fields,
    { licenseNumber: "", officeAddress: "" },
    { licenseNumber: "", officeAddress: "" },
  );
  assert.deepEqual(out, {});
});

// ── readProfileFieldValue ────────────────────────────────────────────────────

test("readProfileFieldValue: null/undefined/missing source all render as ''", () => {
  const f = F("city", "profile");
  assert.equal(readProfileFieldValue(f, { city: null }), "");
  assert.equal(readProfileFieldValue(f, {}), "");
  assert.equal(readProfileFieldValue(f, null), "");
  assert.equal(readProfileFieldValue(f, undefined), "");
});

test("readProfileFieldValue: reads from the real column name when it differs from the key", () => {
  const f: ProfileFieldLike = { key: "displayName", target: "profile", column: "display_name" };
  assert.equal(readProfileFieldValue(f, { display_name: "أحمد" }), "أحمد");
});

test("readProfileFieldValue: a number renders as its decimal string", () => {
  assert.equal(readProfileFieldValue(F("yearsExperience", "lawyer", "number"), { yearsExperience: 12 }), "12");
});

test("readProfileFieldValue: lawyer specialties (text[]) joins with the Arabic comma", () => {
  const f = F("specialties", "lawyer");
  assert.equal(readProfileFieldValue(f, { specialties: ["تجاري", "عقود"] }), "تجاري، عقود");
  assert.equal(readProfileFieldValue(f, { specialties: [] }), "");
});

test("readProfileFieldValue: a non-lawyer 'specialties' array is NOT joined (not this tab's array field)", () => {
  const f = F("specialties", "entitySettings");
  // entitySettings never actually stores an array (the route rejects it) —
  // this only proves the join is scoped to the lawyer column, not the key.
  assert.equal(readProfileFieldValue(f, { specialties: ["a", "b"] }), "a,b");
});

test("readProfileFieldValue: a date value is sliced to its first 10 characters", () => {
  const f = F("licenseIssuedOn", "lawyer", "date");
  assert.equal(readProfileFieldValue(f, { licenseIssuedOn: "2026-01-15" }), "2026-01-15");
  assert.equal(readProfileFieldValue(f, { licenseIssuedOn: "2026-01-15T00:00:00+00:00" }), "2026-01-15");
});
