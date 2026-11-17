/**
 * N1.9 — Art. 18 of نظام المحاماة inside a firm (owner ١٧٣ / ٢١٩): a legal
 * consultant, an in-house counsel or an external of-counsel member does not
 * plead or manage hearings. The firm's hearings and procedures-expert routes
 * admit the litigation roles only — the same line the database draws for
 * consultants (20261019_21_consultant_court_write_guard.sql). Every other
 * rule, and the null-role default, are unchanged.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { FIRM_ROUTE_RULES, getFirmRouteDecision } from "./entityRouteAccess.ts";
import { readFileSync } from "node:fs";
import { FIRM_ROLE_ALLOWED_HREFS } from "./navigation.sidebars.ts";

const NON_LITIGATION = ["legal_consultant", "in_house_counsel", "external_of_counsel"] as const;
const LITIGATION = ["managing_partner", "partner", "senior_lawyer", "lawyer"] as const;

test("N1.9: firm hearings refuse consultant, in-house and of-counsel roles", () => {
  for (const role of NON_LITIGATION) {
    for (const path of ["/dashboard/firm/hearings", "/dashboard/firm/hearings/123"]) {
      assert.equal(getFirmRouteDecision(path, role).allowed, false, `${role} ${path}`);
    }
  }
});

test("N1.9: the procedures expert refuses them too", () => {
  for (const role of NON_LITIGATION) {
    assert.equal(getFirmRouteDecision("/dashboard/firm/procedures-expert", role).allowed, false, role);
  }
});

test("N1.9: litigation roles keep both; trainee and secretary keep hearings", () => {
  for (const role of LITIGATION) {
    assert.equal(getFirmRouteDecision("/dashboard/firm/hearings", role).allowed, true, role);
    assert.equal(getFirmRouteDecision("/dashboard/firm/procedures-expert", role).allowed, true, role);
  }
  assert.equal(getFirmRouteDecision("/dashboard/firm/hearings", "trainee").allowed, true);
  assert.equal(getFirmRouteDecision("/dashboard/firm/hearings", "legal_secretary").allowed, true);
  assert.equal(getFirmRouteDecision("/dashboard/firm/procedures-expert", "trainee").allowed, false);
});

test("N1.9: the null-role default is unchanged (managing_partner)", () => {
  assert.equal(getFirmRouteDecision("/dashboard/firm/hearings", null).allowed, true);
  assert.equal(getFirmRouteDecision("/dashboard/firm/procedures-expert", undefined).allowed, true);
});

test("N1.9: the other legal rules still admit the non-litigation legal roles", () => {
  for (const path of ["/dashboard/firm/cases", "/dashboard/firm/contracts", "/dashboard/firm/consultations", "/dashboard/firm/tasks", "/dashboard/firm/clients"]) {
    for (const role of NON_LITIGATION) {
      assert.equal(getFirmRouteDecision(path, role).allowed, true, `${role} ${path}`);
    }
  }
  const rule = (p: string) => FIRM_ROUTE_RULES.find((r) => r.path === p)!;
  assert.deepEqual([...rule("/dashboard/firm/hearings").allowedRoles], [...LITIGATION, "trainee", "legal_secretary"]);
  assert.deepEqual([...rule("/dashboard/firm/procedures-expert").allowedRoles], [...LITIGATION]);
});

// The firm role lists name rows by href since N06-28/29 (13 Nov 2026), so these
// tests read FIRM_ROLE_ALLOWED_HREFS itself (navigation.sidebars.ts has only
// type imports through `@/`, which node strips). The old source-read matched
// the first `  <role>: [` line in the file — for finance_manager and
// hr_manager that was the corporate list, not the firm one.
const HEARINGS = "/dashboard/firm/hearings";
const firmList = (role: string): readonly string[] | undefined =>
  FIRM_ROLE_ALLOWED_HREFS[role as keyof typeof FIRM_ROLE_ALLOWED_HREFS];

test("N1.9: no non-litigation role is offered a Hearings link it cannot open", () => {
  for (const role of NON_LITIGATION) {
    const list = firmList(role);
    assert.ok(list, `${role} has a sidebar list`);
    assert.equal(list.includes(HEARINGS), false, role);
  }
});

// ─── Links agree with the rule, for every firm role ──────────────────────────

const FIRM_ROLES = [
  "managing_partner", "partner", "senior_lawyer", "lawyer", "trainee", "legal_secretary", "office_admin",
  "finance_manager", "hr_manager", "compliance_manager", "external_of_counsel", "legal_consultant", "in_house_counsel",
] as const;

test("N1.9: every firm role offered a Hearings sidebar link can open the page", () => {
  let offered = 0;
  for (const role of FIRM_ROLES) {
    const list = firmList(role);
    assert.ok(list, `${role} has a sidebar list`);
    if (list.includes(HEARINGS)) {
      offered++;
      assert.equal(getFirmRouteDecision(HEARINGS, role).allowed, true, role);
    }
  }
  assert.ok(offered > 0, "no role is offered the hearings link — the lists changed shape");
});

test("N1.9: the floating shortcut to today's hearings is not offered to office_admin", () => {
  // office_admin was never admitted to /dashboard/firm/hearings; legal_secretary is.
  assert.equal(getFirmRouteDecision("/dashboard/firm/hearings", "office_admin").allowed, false);
  const src = readFileSync(new URL("../components/floating/constants/floatingServices.tsx", import.meta.url), "utf8");
  assert.match(src, /\.\.\.\(role === "legal_secretary" \? \[\{ key: "firm-admin-hearings"/);
});

test("N1.9: the firm cases page shows its «الجلسات» button only to roles the hearings rule admits", () => {
  const src = readFileSync(new URL("../app/dashboard/firm/cases/page.tsx", import.meta.url), "utf8");
  assert.match(src, /const canOpenHearings = user\.userType === "admin" \|\| getFirmRouteDecision\("\/dashboard\/firm\/hearings", firmRole\)\.allowed;/);
  assert.match(src, /\{canOpenHearings && \(\s*<Link href="\/dashboard\/firm\/hearings"/);
});

// ─── Owner ٢٥٦ (D4): the firm letterhead link, for exactly the roles that may open it ──

test("D4: the firm Letterhead link is offered to exactly the roles the route and the vault API allow", () => {
  // The letterhead row («الخزنة», labelEn "Letterhead") is this href.
  const LETTERHEAD = "/dashboard/firm/vault?tab=branding";
  // The vault API (brandingServer.ts): the firm owner, managing_partner and
  // office_admin (FIRM_BRANDING_ROLES). managing_partner gets the full
  // sidebar (getFirmSidebar), so no list names it.
  const vaultRoles = new Set(["managing_partner", "office_admin"]);
  for (const role of FIRM_ROLES) {
    const allowed = getFirmRouteDecision("/dashboard/firm/letterhead", role).allowed;
    assert.equal(allowed, vaultRoles.has(role), `${role}: the route rule agrees with the vault API`);
    if (role === "managing_partner") continue;
    const list = firmList(role);
    assert.ok(list, `${role} has a sidebar list`);
    assert.equal(list.includes(LETTERHEAD), allowed, `${role}: offered the link ⇔ may open it`);
  }
  assert.ok(!FIRM_ROLE_ALLOWED_HREFS.default.includes(LETTERHEAD), "an unknown firm role is not offered it");
});
