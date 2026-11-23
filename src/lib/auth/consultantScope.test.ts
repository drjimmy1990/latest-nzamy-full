/**
 * consultantScope.test.ts — the independent legal consultant sees the library
 * only (owner decision, 22–23 Nov 2026). The scope is an ALLOWLIST: whatever it
 * does not name is closed to him, so a route added tomorrow is closed by default.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/auth/consultantScope.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  CONSULTANT_HOME_PATH,
  consultantApiVerdict,
  consultantPageVerdict,
  isConsultantAllowedApiPath,
  isConsultantAllowedPath,
  isConsultantScopedApiPath,
  isConsultantScopedPagePath,
} from "./consultantScope.ts";

test("the consultant's allowed pages: home, library, my library, notifications, settings, profile, join, marketplace", () => {
  for (const p of [
    "/dashboard/lawyer",
    "/dashboard/lawyer/",
    "/laws",
    "/laws/my",
    "/laws/some-law?x=1",
    "/notifications",
    "/settings",
    "/dashboard/lawyer/profile/edit",
    "/dashboard/lawyer/join-office",
    "/marketplace",
    "/marketplace/post",
    "/pricing",
  ]) {
    assert.equal(isConsultantAllowedPath(p), true, p);
  }
});

test("everything the lawyer dashboard carries is closed, and a prefix is segment-exact", () => {
  for (const p of [
    "/dashboard/lawyer/cases",
    "/dashboard/lawyer/cases/123",
    "/dashboard/lawyer/clients",
    "/dashboard/lawyer/finance",
    "/dashboard/lawyer/vault",
    "/dashboard/lawyer/contracts",
    "/dashboard/lawyer/documents",
    "/dashboard/lawyer/consultations",
    "/dashboard/lawyer/hearings",
    "/dashboard/lawyerx",
    "/dashboard/lawyer/profiles",
    "/lawsuit",
    "/ai/legal-drafter",
    "/ai/legal-opinion",
    "/ai/contracts",
    "/dashboard/firm",
  ]) {
    assert.equal(isConsultantAllowedPath(p), false, p);
  }
  assert.equal(isConsultantAllowedPath(undefined as unknown as string), false);
});

test("a page verdict applies to a consultant of exactly 'consultant', inside the lawyer workspace only", () => {
  assert.equal(consultantPageVerdict("/dashboard/lawyer/cases", "consultant"), "redirect_home");
  assert.equal(consultantPageVerdict("/ai/draft", "consultant"), "redirect_home");
  assert.equal(consultantPageVerdict("/dashboard/lawyer", "consultant"), "allow");
  assert.equal(consultantPageVerdict("/laws/my", "consultant"), "allow");
  assert.equal(CONSULTANT_HOME_PATH, "/dashboard/lawyer");
});

test("a blank, null, unknown or differently-cased practice kind never locks a lawyer out", () => {
  for (const kind of [undefined, null, "", " ", "advocate", "Consultant", "CONSULTANT", "consultant ", 0, false, {}, []]) {
    assert.equal(consultantPageVerdict("/dashboard/lawyer/cases", kind), "allow", JSON.stringify(kind));
    assert.equal(consultantApiVerdict("/api/v1/lawyer/clients", kind), "allow", JSON.stringify(kind));
  }
});

test("the API verdict: a consultant is refused on every /api/v1/lawyer route that is not allowed (fail closed)", () => {
  for (const p of [
    "/api/v1/lawyer/clients",
    "/api/v1/lawyer/finance/summary",
    "/api/v1/lawyer/trust",
    "/api/v1/lawyer/contracts",
    "/api/v1/lawyer/ledger",
    "/api/v1/lawyer/hearings",
    "/api/v1/lawyer/market-requests",
    "/api/v1/lawyer/services",
    "/api/v1/lawyer/a-route-added-tomorrow",
    "/api/v1/lawyer/signup-verification-x",
  ]) {
    assert.equal(consultantApiVerdict(p, "consultant"), "forbid", p);
    assert.equal(consultantApiVerdict(p, "advocate"), "allow", p);
  }
});

test("the API routes a consultant needs to verify his licence and keep his profile stay open", () => {
  for (const p of [
    "/api/v1/lawyer/signup-verification",
    "/api/v1/lawyer/signup-verification/email/start",
    "/api/v1/lawyer/signup-verification/licence",
    "/api/v1/lawyer/licence-image",
    "/api/v1/lawyer/profile-row",
  ]) {
    assert.equal(isConsultantAllowedApiPath(p), true, p);
    assert.equal(consultantApiVerdict(p, "consultant"), "allow", p);
  }
});

test("the scope is the lawyer workspace: /api/v1/lawyers (the public directory) is outside it", () => {
  assert.equal(isConsultantScopedApiPath("/api/v1/lawyer/clients"), true);
  assert.equal(isConsultantScopedApiPath("/api/v1/lawyers"), false);
  assert.equal(isConsultantScopedApiPath("/api/v1/lawyers/42"), false);
  assert.equal(consultantApiVerdict("/api/v1/lawyers", "consultant"), "allow");
  assert.equal(isConsultantScopedPagePath("/dashboard/lawyer"), true);
  assert.equal(isConsultantScopedPagePath("/dashboard/lawyer/cases"), true);
  assert.equal(isConsultantScopedPagePath("/dashboard/lawyers"), false);
  assert.equal(isConsultantScopedPagePath("/laws"), false);
});
