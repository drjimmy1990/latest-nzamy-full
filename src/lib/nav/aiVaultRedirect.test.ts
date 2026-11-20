import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FIRM_VAULT_PATH, LAWYER_VAULT_PATH, aiVaultDestination, firmVaultAdmits } from "./aiVaultRedirect.ts";
import { getFirmRouteDecision } from "../../constants/entityRouteAccess.ts";

/** N03-43/44 (batch l11-misc): /ai/vault forwards a lawyer or a firm to the working dashboard vault. */

test("a solo lawyer goes to his own vault", () => {
  assert.equal(aiVaultDestination({ userType: "lawyer", firmRole: null }), LAWYER_VAULT_PATH);
});

test("a firm account (the owner) goes to the firm vault", () => {
  assert.equal(aiVaultDestination({ userType: "firm", firmRole: "managing_partner" }), FIRM_VAULT_PATH);
  assert.equal(aiVaultDestination({ userType: "firm", firmRole: null }), FIRM_VAULT_PATH);
});

test("a lawyer in a firm goes to the firm vault only when its rule admits his role", () => {
  assert.equal(aiVaultDestination({ userType: "lawyer", firmRole: "managing_partner" }), FIRM_VAULT_PATH);
  assert.equal(aiVaultDestination({ userType: "lawyer", firmRole: "office_admin" }), FIRM_VAULT_PATH);
  // Roles the firm vault refuses keep the lawyer's own vault — never a page that bounces him.
  for (const role of ["partner", "senior_lawyer", "trainee", "legal_secretary", "made_up"]) {
    assert.equal(aiVaultDestination({ userType: "lawyer", firmRole: role }), LAWYER_VAULT_PATH, role);
  }
});

test("the redirect follows the firm vault's own route rule", () => {
  for (const role of ["managing_partner", "office_admin", "partner", "trainee"]) {
    const rule = getFirmRouteDecision(FIRM_VAULT_PATH, role as Parameters<typeof getFirmRouteDecision>[1]).allowed;
    assert.equal(firmVaultAdmits(role), rule, role);
  }
  assert.equal(firmVaultAdmits(null), false);
});

test("everyone else keeps the «قريباً» page", () => {
  for (const userType of ["corporate", "individual", "admin", "provider", "micro", null]) {
    assert.equal(aiVaultDestination({ userType, firmRole: null }), null, String(userType));
  }
});

test("the page is a per-viewer server page that redirects outside its try and keeps «قريباً» for the rest", () => {
  const src = readFileSync(new URL("../../app/ai/vault/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(src, /^"use client"/m);
  assert.match(src, /export const dynamic = "force-dynamic"/);
  assert.match(src, /const destination = await viewerVault\(\);\s*if \(destination\) redirect\(destination\);/);
  assert.match(src, /<DashboardComingSoon/);
});
