/**
 * N19 (fix plan 2026-10-16), admin/business half: a company profile stored in
 * this browser hid every later change the server made to its four flags.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import type { CompanyFeatures } from "@/hooks/useAdminSettings";
import { SERVER_COMPANY_FLAGS, isServerCompanyFlag, withServerFlags } from "./serverFlags.ts";

const stored = {
  hasSecondment: true,
  hasLitigation: true,
  hasMarketplace: false,
  hasGovernance: false,
  hasInternalLegal: true,
  hasAiCorpTools: true,
} as unknown as CompanyFeatures;

test("the server's four flags win over a locally stored profile", () => {
  const shown = withServerFlags(stored, { hasSecondment: false, hasLitigation: false, hasMarketplace: true, hasGovernance: true });
  assert.deepEqual(
    SERVER_COMPANY_FLAGS.map((k) => shown[k]),
    [false, false, true, true],
  );
  // Everything the server does not store stays as this browser saved it.
  assert.equal((shown as unknown as Record<string, unknown>).hasInternalLegal, true);
  assert.equal((shown as unknown as Record<string, unknown>).hasAiCorpTools, true);
  // The stored object itself is not mutated.
  assert.equal(stored.hasSecondment, true);
});

test("a flag the server does not carry as a boolean leaves the profile's value", () => {
  const shown = withServerFlags(stored, { hasSecondment: "yes", hasMarketplace: undefined });
  assert.equal(shown.hasSecondment, true);
  assert.equal(shown.hasMarketplace, false);
  assert.deepEqual(withServerFlags(stored, undefined), stored);
});

test("only the four server-stored flags count as server flags", () => {
  for (const k of SERVER_COMPANY_FLAGS) assert.equal(isServerCompanyFlag(k), true, k);
  for (const k of ["hasInternalLegal", "hasAiCorpTools", "companySize", ""]) assert.equal(isServerCompanyFlag(k), false, k);
});

test("/dashboard/admin/business shows the server's flags and does not toggle them locally", () => {
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  assert.match(page, /return withServerFlags\(stored \?\? buildDefaultCompanyFeatures\(company\.id\), company\.features\);/);
  assert.doesNotMatch(page, /if \(stored\) return stored;/);
  // Q13 disabled style with the reason, and no local write for those four.
  assert.match(page, /disabled=\{serverFlag\}/);
  assert.match(page, /title=\{serverFlag \? SERVER_FLAG_REASON : undefined\}/);
  assert.match(page, /serverFlag \? "opacity-50 cursor-not-allowed"/);
  const toggle = page.slice(page.indexOf("function toggleFeature("), page.indexOf("function serviceEnabled("));
  assert.ok(toggle.indexOf("isServerCompanyFlag(key)") < toggle.indexOf("updateCompanyFeatures("), "the server-flag guard runs before the local write");
});
