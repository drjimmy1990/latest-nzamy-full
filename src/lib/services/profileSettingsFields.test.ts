import test from "node:test";
import assert from "node:assert/strict";
import { profileFieldsFor, splitProfileForm, entityProfileTableFor, PROFILE_FIELDS_BY_TYPE } from "./profileSettingsFields.ts";

test("no account type collects a national id or a birth date any more", () => {
  for (const type of Object.keys(PROFILE_FIELDS_BY_TYPE)) {
    const keys = profileFieldsFor(type).map((f) => f.key.toLowerCase());
    assert.equal(keys.some((k) => k.includes("nationalid") || k.includes("birth")), false, type);
  }
});

test("every field has an Arabic label and a real target", () => {
  for (const type of Object.keys(PROFILE_FIELDS_BY_TYPE)) {
    for (const f of profileFieldsFor(type)) {
      assert.ok(/[؀-ۿ]/.test(f.label), `${type}.${f.key} label`);
      assert.ok(["profile", "lawyer", "entitySettings"].includes(f.target), `${type}.${f.key} target`);
      if (f.target === "entitySettings") assert.ok(entityProfileTableFor(type), `${type} needs an entity table`);
    }
  }
});

test("a lawyer's form splits into profiles / lawyer_profiles columns", () => {
  const s = splitProfileForm("lawyer", { displayName: "أحمد", city: "الرياض", licenseNumber: "44/123", bio: "نبذة", unknown: "x" });
  assert.deepEqual(s.profile, { display_name: "أحمد", city: "الرياض" });
  assert.deepEqual(s.lawyer, { license_number: "44/123", bio_ar: "نبذة" });
  assert.deepEqual(s.entitySettings, {});
});

test("a firm member's role and department go to the entity settings slot", () => {
  const s = splitProfileForm("firm", { roleTitle: "شريك", department: "تجاري", phone: "0501234567" });
  assert.deepEqual(s.entitySettings, { roleTitle: "شريك", department: "تجاري" });
  assert.deepEqual(s.profile, { phone: "0501234567" });
  assert.equal(entityProfileTableFor("firm"), "firm_profiles");
  assert.equal(entityProfileTableFor("individual"), null);
});

test("owner ك‏١.1 — «الجنسية» is offered to a lawyer and lands on public.profiles", () => {
  const spec = profileFieldsFor("lawyer").find((f) => f.key === "nationality");
  assert.ok(spec, "a lawyer must be offered الجنسية");
  assert.equal(spec.label, "الجنسية");
  assert.equal(spec.target, "profile");
  const s = splitProfileForm("lawyer", { nationality: "سعودي", licenseNumber: "44/123" });
  assert.deepEqual(s.profile, { nationality: "سعودي" });
  assert.deepEqual(s.lawyer, { license_number: "44/123" });
});

test("owner decision Q3 — الجنسية is lawyer + individual only, never an entity type", () => {
  for (const type of ["individual", "lawyer"]) {
    assert.ok(profileFieldsFor(type).some((f) => f.key === "nationality"), type);
  }
  for (const type of ["firm", "corporate", "micro", "government", "ngo", "provider", "admin"]) {
    assert.equal(profileFieldsFor(type).some((f) => f.key === "nationality"), false, type);
  }
});

// Owner decisions ٥٦/٥٧ (2026-10-06): a city is the individual's address, and
// a national address may be added for invoices — optional, never required.
test("٥٦/٥٧ — an individual gives a city and, optionally, a national address; no free-text address", () => {
  const fields = profileFieldsFor("individual");
  assert.ok(fields.some((f) => f.key === "city" && f.target === "profile"));
  const nat = fields.find((f) => f.key === "nationalAddress");
  assert.equal(nat?.column, "national_address");
  assert.equal(nat?.target, "profile");
  assert.equal(nat?.maxLength, 300);
  assert.match(nat?.label ?? "", /اختياري/);
  assert.equal(fields.some((f) => f.key === "address" || f.column === "address"), false);
  const { profile } = splitProfileForm("individual", { nationalAddress: "RRRD2929" });
  assert.deepEqual(profile, { national_address: "RRRD2929" });
});
