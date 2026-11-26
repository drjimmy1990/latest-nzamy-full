/**
 * navigation.firmRoles.test.ts — the law-firm sidebar per firm role
 * (owner package 13 Nov 2026: N06-26, N06-28/29, N06-30, N04-31).
 *
 * The firm's role allowlists used to name rows by their English label, so a
 * renamed row («عصارة المرفقات», once "Doc Analyzer" / "ParaLegal (AI
 * Briefing)") silently disappeared for every role that still listed the old
 * string. They now name rows by href. This file fails the moment an allowlist
 * names an href no FIRM_SIDEBAR row carries — the drift that hid the analyzer.
 *
 * Run: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/constants/navigation.firmRoles.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";

import { FIRM_ROLE_ALLOWED_HREFS, FIRM_SIDEBAR, getSidebarByUserType } from "./navigation.sidebars.ts";
import type { SidebarGroup, SidebarItem } from "./navigation.types.ts";
import type { AffiliationRole } from "@/hooks/useUser";

function hrefsOf(groups: SidebarGroup[]): string[] {
  const out: string[] = [];
  const walk = (items: SidebarItem[]) => {
    for (const item of items) {
      out.push(item.href);
      if (item.children) walk(item.children);
    }
  };
  for (const group of groups) walk(group.items);
  return out;
}

// The role lists are checked on the menu WITH its «قريباً» rows (keepUnbuilt):
// owner ق٢٦-١ hides those from the menu drawn (navigation.comingSoon.test.ts),
// which is a separate rule from which rows a role may have.
function firmSidebar(role: AffiliationRole | null): string[] {
  return hrefsOf(getSidebarByUserType("firm", "full", null, [], null, null, role, false, null, null, null, null, false, true));
}

const ROLES = Object.keys(FIRM_ROLE_ALLOWED_HREFS).filter((r) => r !== "default") as AffiliationRole[];
const FIRM_HREFS = new Set(hrefsOf(FIRM_SIDEBAR));

test("every href on every firm role's allowlist is a row FIRM_SIDEBAR actually has", () => {
  const stale: string[] = [];
  for (const [role, hrefs] of Object.entries(FIRM_ROLE_ALLOWED_HREFS)) {
    for (const href of hrefs) if (!FIRM_HREFS.has(href)) stale.push(`${role}: ${href}`);
  }
  assert.deepEqual(stale, []);
});

test("no allowlist names the same href twice", () => {
  for (const [role, hrefs] of Object.entries(FIRM_ROLE_ALLOWED_HREFS)) {
    assert.equal(new Set(hrefs).size, hrefs.length, role);
  }
});

test("N06-28/29: every role that had the attachment analyzer still sees «عصارة المرفقات»", () => {
  // The roles whose label lists named "Doc Analyzer" or "ParaLegal (AI Briefing)".
  const analyzerRoles: AffiliationRole[] = [
    "managing_partner", "partner", "senior_lawyer", "lawyer",
    "legal_consultant", "in_house_counsel", "external_of_counsel",
  ];
  for (const role of analyzerRoles) {
    assert.ok(firmSidebar(role).includes("/ai/analyze"), `${role} lost /ai/analyze`);
  }
  // An unknown role falls back to the default list, which had it too.
  assert.ok(FIRM_ROLE_ALLOWED_HREFS.default.includes("/ai/analyze"));
});

test("roles that never had the analyzer still do not get it", () => {
  for (const role of ["legal_secretary", "office_admin", "finance_manager", "hr_manager", "compliance_manager", "trainee"] as AffiliationRole[]) {
    assert.ok(!firmSidebar(role).includes("/ai/analyze"), role);
  }
});

test("N04-31: the cancelled conflict-of-interest check is in no firm sidebar", () => {
  assert.ok(!FIRM_HREFS.has("/dashboard/firm/compliance/conflict"));
  for (const role of ROLES) {
    assert.ok(!firmSidebar(role).some((h) => h.startsWith("/dashboard/firm/compliance/conflict")), role);
  }
});

test("N06-30: no corporate-only /ai/corp/* tool in the firm sidebar, for any role", () => {
  assert.deepEqual([...FIRM_HREFS].filter((h) => h.startsWith("/ai/corp/")), []);
  for (const role of ROLES) {
    assert.deepEqual(firmSidebar(role).filter((h) => h.startsWith("/ai/corp/")), [], role);
  }
});

test("N06-26: one contracts row — no «مراجع العقود» duplicate that 301s onto /ai/contracts", () => {
  const rows = hrefsOf(FIRM_SIDEBAR);
  assert.equal(rows.filter((h) => h === "/ai/contracts").length, 1);
  assert.equal(rows.filter((h) => h === "/ai/contract-reviewer").length, 0);
});

test("the firm sidebar keys rows by href, so no href appears twice", () => {
  const rows = hrefsOf(FIRM_SIDEBAR);
  assert.equal(new Set(rows).size, rows.length);
});

test("roles kept their non-AI rows: spot checks against the old label lists", () => {
  assert.deepEqual(firmSidebar("finance_manager"), [
    "/dashboard/firm", "/dashboard/firm/clients", "/dashboard/firm/finance", "/dashboard/firm/fees",
    "/dashboard/firm/finance/reports", "/dashboard/firm/analytics", "/ai/fee-calculator", "/ai/report-generator",
    "/notifications", "/settings",
  ]);
  assert.ok(firmSidebar("office_admin").includes("/dashboard/firm/vault?tab=branding"));
  assert.ok(firmSidebar("compliance_manager").includes("/dashboard/firm/governance?tab=matrix"));
});

test("N06-32: the four lawyer-and-firm tools are firm rows, the court ones for litigation roles only", () => {
  for (const href of ["/ai/contract-drafter", "/ai/communicate", "/ai/brief-check", "/ai/analyze-strength"]) {
    assert.ok(FIRM_HREFS.has(href), `FIRM_SIDEBAR has no ${href}`);
    assert.ok(firmSidebar("managing_partner").includes(href), `managing_partner lacks ${href}`);
  }
  for (const role of ["partner", "senior_lawyer", "lawyer"] as AffiliationRole[]) {
    assert.ok(firmSidebar(role).includes("/ai/brief-check"), `${role} lacks /ai/brief-check`);
    assert.ok(firmSidebar(role).includes("/ai/contract-drafter"), `${role} lacks /ai/contract-drafter`);
  }
  // Art. 18: no court tool for a consultant, in-house or of-counsel member, nor for non-legal roles.
  for (const role of ["legal_consultant", "in_house_counsel", "external_of_counsel", "legal_secretary",
                      "office_admin", "finance_manager", "hr_manager", "compliance_manager", "trainee"] as AffiliationRole[]) {
    for (const href of ["/ai/brief-check", "/ai/analyze-strength"]) {
      assert.ok(!firmSidebar(role).includes(href), `${role} got ${href}`);
    }
  }
  assert.ok(!FIRM_ROLE_ALLOWED_HREFS.default.includes("/ai/brief-check"));
  assert.ok(!FIRM_ROLE_ALLOWED_HREFS.default.includes("/ai/analyze-strength"));
});
