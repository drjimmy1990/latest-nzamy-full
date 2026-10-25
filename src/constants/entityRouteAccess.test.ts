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

test("N1.9: no non-litigation role is offered a Hearings link it cannot open", () => {
  // Source-read: navigation.sidebars.ts imports through `@/`, which node --test cannot resolve.
  const src = readFileSync(new URL("./navigation.sidebars.ts", import.meta.url), "utf8");
  for (const role of NON_LITIGATION) {
    const line = new RegExp(`^  ${role}: \\[(.*)\\],\\r?$`, "m").exec(src);
    assert.ok(line, `${role} has a sidebar list`);
    assert.equal(line[1].includes('"Hearings"'), false, role);
  }
});

// ─── Links agree with the rule, for every firm role ──────────────────────────

const FIRM_ROLES = [
  "managing_partner", "partner", "senior_lawyer", "lawyer", "trainee", "legal_secretary", "office_admin",
  "finance_manager", "hr_manager", "compliance_manager", "external_of_counsel", "legal_consultant", "in_house_counsel",
] as const;

test("N1.9: every firm role offered a Hearings sidebar link can open the page", () => {
  const src = readFileSync(new URL("./navigation.sidebars.ts", import.meta.url), "utf8");
  for (const role of FIRM_ROLES) {
    const line = new RegExp(`^  ${role}: \\[(.*)\\],\\r?$`, "m").exec(src);
    assert.ok(line, `${role} has a sidebar list`);
    if (line[1].includes('"Hearings"')) {
      assert.equal(getFirmRouteDecision("/dashboard/firm/hearings", role).allowed, true, role);
    }
  }
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
