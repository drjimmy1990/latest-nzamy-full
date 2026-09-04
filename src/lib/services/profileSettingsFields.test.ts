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
