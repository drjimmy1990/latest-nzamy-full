/**
 * _entitySettingsFields.test.ts — the «إعدادات الكيان» two-arm split.
 *
 * WP-6 B-1 (owner step ك‏٢). The defect this pins: the tab read
 * `isCorporate ? CORPORATE_FIELDS : ENTITY_SETTINGS_FIELDS[type]`, an
 * either/or, so a company had no address and no contact number anywhere on
 * the platform. These assertions fail the moment corporate loses the bag
 * again, or the moment a contact key starts travelling under the
 * `businessProfile` key (which would try to write columns that do not exist
 * on business_profiles and 400/500 the whole save).
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  CORPORATE_FIELDS,
  ENTITY_SETTINGS_FIELDS,
  entitySettingsFieldsFor,
  identityFieldsFor,
  splitEntityTabValues,
} from "./_entitySettingsFields.ts";

const CONTACT_KEYS = ["address", "city", "phone", "email", "website"] as const;

test("corporate gets the contact keys the firm already had", () => {
  const keys = entitySettingsFieldsFor("corporate").map((f) => f.key);
  for (const key of CONTACT_KEYS) {
    assert.ok(keys.includes(key), `corporate entity settings is missing «${key}»`);
  }
});

test("the contact keys are the SAME keys the firm uses — one bag shape", () => {
  const firmKeys = new Set(ENTITY_SETTINGS_FIELDS.firm.map((f) => f.key));
  for (const key of CONTACT_KEYS) {
    assert.ok(firmKeys.has(key), `the firm lost «${key}» — the bag shapes have diverged`);
  }
});

test("every entity type's fields carry an Arabic label", () => {
  for (const [type, fields] of Object.entries(ENTITY_SETTINGS_FIELDS)) {
    for (const f of fields) {
      assert.ok(/[؀-ۿ]/.test(f.label), `${type}.${f.key} has no Arabic label`);
    }
  }
});

test("a company's address and phone are routed to entitySettings, NOT businessProfile", () => {
  const { businessProfile, entitySettings } = splitEntityTabValues(
    "corporate",
    {
      companyName: "شركة البناء المتقدمة المحدودة",
      crNumber: "1010123456",
      legalRepName: "عبدالعزيز محمد القرني",
      address: "حي الملقا، طريق الأمير محمد بن سلمان",
      city: "الرياض",
      phone: "0512345678",
      email: "info@example.sa",
      website: "https://example.sa",
    },
    "manager",
  );

  assert.ok(entitySettings, "corporate must produce an entitySettings patch");
  assert.equal(entitySettings!.address, "حي الملقا، طريق الأمير محمد بن سلمان");
  assert.equal(entitySettings!.city, "الرياض");
  assert.equal(entitySettings!.phone, "0512345678");
  assert.equal(entitySettings!.email, "info@example.sa");
  assert.equal(entitySettings!.website, "https://example.sa");

  assert.ok(businessProfile, "corporate must still produce a businessProfile patch");
  for (const key of ["address", "city", "phone", "email", "website"]) {
    assert.ok(!(key in businessProfile!), `«${key}» must not be sent as a business_profiles column`);
  }
  assert.equal(businessProfile!.company_name_ar, "شركة البناء المتقدمة المحدودة");
  assert.equal(businessProfile!.cr_number, "1010123456");
  assert.equal(businessProfile!.legal_rep_name, "عبدالعزيز محمد القرني");
  assert.equal(businessProfile!.legal_rep_capacity, "manager");
});

test("a blank company name is omitted (NOT NULL column) while the nullable columns clear", () => {
  const { businessProfile } = splitEntityTabValues("corporate", { companyName: "   " }, "");
  assert.ok(businessProfile);
  assert.ok(!("company_name_ar" in businessProfile!));
  assert.equal(businessProfile!.cr_number, null);
  assert.equal(businessProfile!.legal_rep_name, null);
  assert.equal(businessProfile!.legal_rep_capacity, null);
});

test("a non-corporate entity produces only the bag — there is no business_profiles row to write", () => {
  for (const type of ["firm", "micro", "government", "ngo"]) {
    const { businessProfile, entitySettings } = splitEntityTabValues(type, { city: "جدة" }, "");
    assert.equal(businessProfile, null, `${type} must not write business_profiles columns`);
    assert.ok(entitySettings, `${type} must still write its bag`);
  }
  assert.deepEqual(identityFieldsFor("firm"), []);
  assert.deepEqual(identityFieldsFor("corporate"), CORPORATE_FIELDS);
});

test("an account type with no entity table produces neither patch", () => {
  const { businessProfile, entitySettings } = splitEntityTabValues("individual", { city: "جدة" }, "");
  assert.equal(businessProfile, null);
  assert.equal(entitySettings, null);
});

test("no bag field shadows a real business_profiles identity column", () => {
  // companyName / crNumber / legalRepName are columns; a jsonb key of the same
  // meaning would silently diverge from the value every other screen reads.
  const corporateBagKeys = entitySettingsFieldsFor("corporate").map((f) => f.key);
  for (const key of ["companyName", "legalRepName", "legalRepCapacity", "crNumber"]) {
    assert.ok(!corporateBagKeys.includes(key), `«${key}» has a real column — it must not live in the bag`);
  }
});

test("the `phone` key is asked for as a Saudi mobile everywhere, because the server stores E.164", () => {
  for (const [type, fields] of Object.entries(ENTITY_SETTINGS_FIELDS)) {
    const phone = fields.find((f) => f.key === "phone");
    if (!phone) continue;
    assert.match(
      phone.placeholder,
      /^05/,
      `${type}.phone still advertises «${phone.placeholder}», which validateEntitySettingsPatch refuses`,
    );
  }
});

// ── WP-6 B-4: the legal-department flag comes from the company's own row ────

test("the company states its own service model and legal department, in the identity arm", () => {
  const keys = CORPORATE_FIELDS.map((f) => f.key);
  assert.ok(keys.includes("serviceModel"));
  assert.ok(keys.includes("hasLegalDept"));

  const serviceModel = CORPORATE_FIELDS.find((f) => f.key === "serviceModel")!;
  // A CHECK-constrained column must never be free text.
  assert.equal(serviceModel.control, "select");
  assert.deepEqual(
    (serviceModel.options ?? []).map((o) => o.value),
    ["internal", "external", "hybrid"],
  );
  for (const o of serviceModel.options ?? []) assert.ok(/[؀-ۿ]/.test(o.label));

  assert.equal(CORPORATE_FIELDS.find((f) => f.key === "hasLegalDept")!.control, "toggle");
});

test("both flags travel as real business_profiles columns, never as jsonb keys", () => {
  const { businessProfile, entitySettings } = splitEntityTabValues(
    "corporate",
    { companyName: "شركة", serviceModel: "hybrid", hasLegalDept: "true" },
    "",
  );
  assert.equal(businessProfile!.service_model, "hybrid");
  assert.equal(businessProfile!.has_legal_dept, true);
  assert.ok(!("serviceModel" in entitySettings!));
  assert.ok(!("hasLegalDept" in entitySettings!));
});

test("an unloaded or unrecognised service model is omitted rather than sent as an invalid value", () => {
  for (const model of ["", "   ", "outsourced"]) {
    const { businessProfile } = splitEntityTabValues("corporate", { serviceModel: model }, "");
    assert.ok(!("service_model" in businessProfile!), model);
  }
});

test("the legal-department toggle is always a boolean — the column is NOT NULL", () => {
  assert.equal(splitEntityTabValues("corporate", {}, "").businessProfile!.has_legal_dept, false);
  assert.equal(
    splitEntityTabValues("corporate", { hasLegalDept: "true" }, "").businessProfile!.has_legal_dept,
    true,
  );
});
