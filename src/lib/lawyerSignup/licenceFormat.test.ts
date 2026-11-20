/**
 * R9a / Q496 (batch l11-sec): the soft licence-number format, derived from the
 * lawyers' registry key (20261122_40 lawyer_registry_norm_licence).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LICENCE_FORMAT_ERROR_AR, licenceFormatIssue, normaliseLicence } from "./licenceFormat.ts";
import { parseLookupBody } from "../registry/lawyerRegistryLookup.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");

test("R9a: normaliseLicence mirrors the SQL normaliser's own examples", () => {
  // the examples 20261122_40's verify block and registryCsv.test.ts hold
  assert.equal(normaliseLicence(" ١٢ / ٣٤٥٦ "), "12/3456");
  assert.equal(normaliseLicence("12-3456"), "12/3456");
  assert.equal(normaliseLicence("12//3456/"), "12/3456");
  assert.equal(normaliseLicence("12_34\\56"), "12/34/56");
  assert.equal(normaliseLicence("۹۹۰۰۱"), "99001");
  assert.equal(normaliseLicence("   "), null);
  assert.equal(normaliseLicence(null), null);
});

test("R9a: the registry's shapes pass", () => {
  for (const ok of ["99001", "12/3456", "١٢/٣٤٥٦", "12-3456", " 441 / 30 ", "۱۲۳۴۵"]) {
    assert.equal(licenceFormatIssue(ok), null, ok);
  }
});

test("R9a: clearly malformed input is refused (soft: only that)", () => {
  for (const bad of ["MOJ-12345", "abc", "12a45", "رقم 123", "12.345", "#123", "----", "/", "1".repeat(33), "1448-LAW-001"]) {
    assert.equal(licenceFormatIssue(bad), LICENCE_FORMAT_ERROR_AR, bad);
  }
  // empty is not this check's business
  assert.equal(licenceFormatIssue(""), null);
  assert.equal(licenceFormatIssue("   "), null);
  assert.equal(licenceFormatIssue(undefined), null);
});

test("R9a: the signup lookup route uses the same rule (and its old message)", () => {
  assert.deepEqual(parseLookupBody({ licenseNumber: "MOJ-1" }), { ok: false, error: LICENCE_FORMAT_ERROR_AR });
  const ok = parseLookupBody({ licenseNumber: "12/3456" });
  assert.equal(ok.ok, true);
});

test("R9a: PATCH /api/v1/profile refuses a changed malformed advocate licence (422); the signup form blocks it", () => {
  const profile = readFileSync(join(ROOT, "src/app/api/v1/profile/route.ts"), "utf8");
  assert.match(profile, /licenceFormatIssue\(lawyerUpdates\.license_number\)/);
  assert.match(profile, /practice_kind !== "consultant"/);
  assert.match(profile, /status: 422/);
  const page = readFileSync(join(ROOT, "src/app/register/provider/page.tsx"), "utf8");
  assert.match(page, /licenceShapeOk/);
  const steps = readFileSync(join(ROOT, "src/app/register/provider/components/Steps.tsx"), "utf8");
  assert.match(steps, /providerType === "lawyer" && licenceFormatIssue\(data\.licenseNumber\)/);
});
