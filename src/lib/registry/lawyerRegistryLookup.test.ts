// Unit tests for the signup registry lookup (launch batch R2/R3/R5).
// SYNTHETIC values only — never a real name, licence or mobile.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  LICENCE_MAX,
  LOOKUP_UNVERIFIED_AR,
  lookupGreetingAr,
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

test("shapeLookupResult: a valid answer carries the registry NAME only (owner 18 Nov, item 3.1)", () => {
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
  assert.deepEqual(out, { status: "valid", name: "اسم تجريبي كامل" });
  const json = JSON.stringify(out);
  for (const leak of ["99001", "2030", "11", "0500000011", "مدينة"]) {
    assert.equal(json.includes(leak), false, `no ${leak} in the guest answer`);
  }
});

test("shapeLookupResult: expired / unverifiable / not_found are ONE status — never a validity word", () => {
  for (const s of ["expired", "unverifiable", "not_found"]) {
    assert.deepEqual(shapeLookupResult({ status: s, name: "تسريب", licence: "1", expiry: "2020-01-01" }), { status: "unverified" });
  }
  assert.deepEqual(shapeLookupResult({ status: "ambiguous", name: "تسريب" }), { status: "ambiguous" });
});

test("shapeLookupResult: anything malformed becomes unverified", () => {
  for (const raw of [null, "valid", [], {}, { status: "valid" }, { status: "valid", name: "x" }, { status: "valid", name: " ", licence: "1" }, { status: "weird" }]) {
    assert.deepEqual(shapeLookupResult(raw), { status: "unverified" });
  }
});

test("splitRegistryName and the greeting", () => {
  assert.deepEqual(splitRegistryName(" سالم  احمد ابراهيم الاختباري "), { firstName: "سالم", lastName: "احمد ابراهيم الاختباري" });
  assert.deepEqual(splitRegistryName(""), { firstName: "", lastName: "" });
  assert.equal(lookupGreetingAr(" اسم تجريبي "), "أهلاً أ. اسم تجريبي");
  assert.equal(LOOKUP_UNVERIFIED_AR, "تعذّر التحقق الآلي، وسيراجع فريقنا طلبك");
});

test("the signup lookup card never shows validity, a licence number or mobile digits (owner 18 Nov, item 3.1)", () => {
  const root = join(import.meta.dirname, "../../..");
  const card = readFileSync(join(root, "src/app/register/provider/components/LawyerRegistryLookup.tsx"), "utf8");
  // Comments may explain the rule; the rendered code may not break it.
  const code = card.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const word of ["سارٍ", "ساري", "منته", "valid until", "expired", "ترخيص رقم"]) {
    assert.equal(code.includes(word), false, `no «${word}» in the lookup card`);
  }
  for (const field of [".licence", ".expiry", "mobileHint", ".city", "formatExpiry"]) {
    assert.equal(code.includes(field), false, `the card never reads ${field}`);
  }
  assert.match(code, /lookupGreetingAr\(shown\.result\.name\)/);
  assert.match(code, /LOOKUP_UNVERIFIED_AR/);
  assert.doesNotMatch(code, /onChange\("licenseNumber"/, "a lookup never fills the licence field");
});
