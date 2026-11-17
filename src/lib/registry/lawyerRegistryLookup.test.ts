// Unit tests for the signup registry lookup (launch batch R2/R3/R5).
// SYNTHETIC values only — never a real name, licence or mobile.
import assert from "node:assert/strict";
import test from "node:test";
import {
  formatExpiry,
  LICENCE_MAX,
  NAME_MAX,
  parseLookupBody,
  shapeLookupResult,
  splitRegistryName,
} from "./lawyerRegistryLookup.ts";

test("parseLookupBody: licence (western, Arabic-Indic, with slash) wins over the name", () => {
  for (const lic of ["99001", "٩٩٠٠١", "99/0002", " 99 - 0002 "]) {
    const r = parseLookupBody({ licenseNumber: lic, fullName: "اسم تجريبي ثلاثي", turnstileToken: "tok" });
    assert.ok(r.ok, lic);
    if (r.ok) {
      assert.equal(r.input.licenseNumber, lic.trim());
      assert.equal(r.input.fullName, null);
      assert.equal(r.input.turnstileToken, "tok");
    }
  }
});

test("parseLookupBody: a licence with letters or no digit is refused", () => {
  for (const lic of ["MOJ-123", "abc", "///", "12a"]) {
    const r = parseLookupBody({ licenseNumber: lic });
    assert.equal(r.ok, false, lic);
  }
});

test("parseLookupBody: the name needs three words and six Arabic letters", () => {
  assert.equal(parseLookupBody({ fullName: "سالم احمد" }).ok, false);
  assert.equal(parseLookupBody({ fullName: "a b c d" }).ok, false);
  const r = parseLookupBody({ fullName: "  سالم احمد ابراهيم  " });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.input.fullName, "سالم احمد ابراهيم");
    assert.equal(r.input.licenseNumber, null);
    assert.equal(r.input.turnstileToken, null);
  }
});

test("parseLookupBody: nothing, wrong types and oversize input are refused", () => {
  assert.equal(parseLookupBody(null).ok, false);
  assert.equal(parseLookupBody([]).ok, false);
  assert.equal(parseLookupBody({}).ok, false);
  assert.equal(parseLookupBody({ licenseNumber: "", fullName: "" }).ok, false);
  assert.equal(parseLookupBody({ licenseNumber: 99001 }).ok, false);
  assert.equal(parseLookupBody({ fullName: ["سالم"] }).ok, false);
  assert.equal(parseLookupBody({ licenseNumber: "9".repeat(LICENCE_MAX + 1) }).ok, false);
  assert.equal(parseLookupBody({ fullName: "س".repeat(NAME_MAX + 1) }).ok, false);
  assert.equal(parseLookupBody({ licenseNumber: "99001", turnstileToken: "x".repeat(5000) }).ok, false);
});

test("shapeLookupResult: a valid answer keeps only the whitelisted fields", () => {
  const out = shapeLookupResult({
    status: "valid",
    name: " اسم تجريبي كامل ",
    licence: "99001",
    expiry: "2030-01-15",
    mobile_hint: "11",
    city: "مدينة",
    mobile: "0500000011",
    extra: "x",
  });
  assert.deepEqual(out, {
    status: "valid",
    name: "اسم تجريبي كامل",
    licence: "99001",
    expiry: "2030-01-15",
    mobileHint: "11",
    city: "مدينة",
  });
  assert.equal(JSON.stringify(out).includes("0500000011"), false);
});

test("shapeLookupResult: a mobile hint that is not exactly two digits is dropped", () => {
  const out = shapeLookupResult({ status: "valid", name: "ا ب ج", licence: "1", expiry: "2030-01-15", mobile_hint: "0500000011" });
  assert.equal(out.status === "valid" && out.mobileHint, null);
});

test("shapeLookupResult: no-data statuses carry nothing else", () => {
  for (const s of ["expired", "unverifiable", "not_found", "ambiguous"]) {
    assert.deepEqual(shapeLookupResult({ status: s, name: "تسريب", licence: "1" }), { status: s });
  }
});

test("shapeLookupResult: anything malformed becomes not_found", () => {
  for (const raw of [null, "valid", [], {}, { status: "valid" }, { status: "valid", name: "x", licence: "1", expiry: "15/01/2030" }, { status: "weird" }]) {
    assert.deepEqual(shapeLookupResult(raw), { status: "not_found" });
  }
});

test("splitRegistryName and formatExpiry", () => {
  assert.deepEqual(splitRegistryName(" سالم  احمد ابراهيم الاختباري "), { firstName: "سالم", lastName: "احمد ابراهيم الاختباري" });
  assert.deepEqual(splitRegistryName(""), { firstName: "", lastName: "" });
  assert.equal(formatExpiry("2030-01-15"), "15/01/2030");
});
