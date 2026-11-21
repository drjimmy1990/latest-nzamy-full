/**
 * entityRoleScope.test.ts — owner file 15 rows 2, 3, 36 (batch l9-secroles,
 * migration 20261129_10): the role lists the app knows equal the ones the
 * database enforces, the company seat numbers equal the /pricing users row,
 * and the roster route hides colleagues' e-mails from non-managers.
 * Run: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/auth/entityRoleScope.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  BUSINESS_CASE_READER_ROLES,
  BUSINESS_ROSTER_READER_ROLES,
  canReadBusinessRoster,
} from "./businessMembershipAccess.ts";
import { FIRM_CASE_SCOPED_ROLES } from "../services/ownRequestsFilter.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const SQL = read("supabase/migrations/20261129_10_firm_company_roles_seats.sql");
// Q112 / Q113 (batch l12): the latest definitions of firm_case_scoped_member
// and business_plan_seat_cap are in 20261202_80.
const SQL_L12 = read("supabase/migrations/20261202_80_l12_firm_roles_log_badge_storage.sql");

/** The quoted values of the first `m.role in (...)` after `marker` in the SQL. */
function sqlRoles(marker: string): string[] {
  const at = SQL.indexOf(marker);
  assert.ok(at > 0, marker);
  const m = SQL.slice(at).match(/m\.role in \(([^)]*)\)/);
  assert.ok(m, `role list after ${marker}`);
  return [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
}

test("the firm roles narrowed to their assigned cases: trainee and legal_secretary always (20261129_10), the rest from the setting (20261202_80)", () => {
  assert.deepEqual([...FIRM_CASE_SCOPED_ROLES], ["trainee", "legal_secretary"]);
  assert.deepEqual(sqlRoles("create or replace function public.firm_case_scoped_member"), [...FIRM_CASE_SCOPED_ROLES]);
  // 20261202_80 replaces the fixed list by firm_case_scope_roles(), which always starts with these two
  const fn = SQL_L12.slice(SQL_L12.indexOf("create or replace function public.firm_case_scoped_member"));
  assert.match(fn.slice(0, fn.indexOf("$$;")), /m\.role = any \(public\.firm_case_scope_roles\(\)\)/);
  assert.match(SQL_L12, /return array\['trainee', 'legal_secretary'\] \|\| v_extra;/);
  // the owner is never narrowed, whatever his member row says
  for (const sql of [SQL, SQL_L12]) {
    assert.match(sql, /and not exists \(select 1 from public\.firm_profiles fp\s+where fp\.id = p_firm and fp\.owner_user_id = auth\.uid\(\)\)/);
  }
});

test("company requests: the case roles of the UI are the ones the database lets read every request", () => {
  const routes = read("src/constants/entityRouteAccess.ts");
  const m = routes.match(/const BUSINESS_CASE_ROLES = \[([^\]]*)\]/);
  assert.ok(m);
  const ui = [...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]);
  assert.deepEqual(ui, [...BUSINESS_CASE_READER_ROLES]);
  assert.deepEqual(sqlRoles("public.business_case_reader(p_business uuid)"), [...BUSINESS_CASE_READER_ROLES]);
  assert.ok(!BUSINESS_CASE_READER_ROLES.includes("employee"), "an employee does not read every company request");
});

test("company roster: the team page roles are the ones the database lets read the roster", () => {
  const routes = read("src/constants/entityRouteAccess.ts");
  const m = routes.match(/path: "\/dashboard\/business\/team", match: "prefix", label: "[^"]*", allowedRoles: \[([^\]]*)\]/);
  assert.ok(m);
  const ui = [...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]);
  assert.deepEqual(ui, [...BUSINESS_ROSTER_READER_ROLES]);
  assert.deepEqual(sqlRoles("public.business_roster_reader(p_business uuid)"), [...BUSINESS_ROSTER_READER_ROLES]);
});

test("canReadBusinessRoster: the owner, or an ACTIVE roster role; deny by default", () => {
  assert.equal(canReadBusinessRoster(true, null), true);
  assert.equal(canReadBusinessRoster(false, { role: "legal_manager", status: "active" }), true);
  assert.equal(canReadBusinessRoster(false, { role: "hr_manager", status: "active" }), true);
  assert.equal(canReadBusinessRoster(false, { role: "hr_manager", status: "suspended" }), false);
  for (const role of ["employee", "legal_staff", "finance_manager", "department_head", "seconded", "compliance_officer"]) {
    assert.equal(canReadBusinessRoster(false, { role, status: "active" }), false, role);
  }
  assert.equal(canReadBusinessRoster(false, null), false);
  assert.equal(canReadBusinessRoster(false, { role: null, status: "active" }), false);
});

test("GET /api/v1/business/members shows a colleague's e-mail to roster readers only", () => {
  const src = read("src/app/api/v1/business/members/route.ts");
  assert.match(src, /const canSeeRoster = canReadBusinessRoster\(scope\.scope === "owner", ownRow\);/);
  assert.match(src, /toDto\(row, profileById\.get\(row\.user_id\), ownerUserId, canSeeRoster \|\| row\.user_id === user\.id\)/);
  assert.match(src, /email: emailVisible \? \(profile\?\.email \?\? null\) : null,/);
});

test("the company seat numbers are the /pricing users row (pricing.companies.comparison.ts)", () => {
  const cmp = read("src/constants/pricing/pricing.companies.comparison.ts");
  const at = cmp.indexOf('feature: "Users"');
  assert.ok(at > 0);
  const row = cmp.slice(at, cmp.indexOf("}", at));
  const pricing = Object.fromEntries([...row.matchAll(/"((?:biz|dept)-[a-z]+-[a-z]+)": "([^"]+)"/g)].map((x) => [x[1], x[2]]));
  assert.equal(Object.keys(pricing).length, 18);
  // the latest definition (Q113, 20261202_80: the smallest tiers start at 5)
  const fn = SQL_L12.slice(SQL_L12.indexOf("create or replace function public.business_plan_seat_cap"));
  const body = fn.slice(0, fn.indexOf("end;"));
  for (const [plan, users] of Object.entries(pricing)) {
    const m = body.match(new RegExp(`when '${plan}'\\s+then (\\d+)`));
    if (users === "Custom") {
      assert.equal(m, null, `${plan} is by contract — no fixed cap`);
    } else {
      assert.ok(m, plan);
      assert.equal(m[1], users, plan);
    }
  }
  // the default for a company with no plan, raised by sales/admin
  assert.match(SQL, /add column if not exists max_seats int not null default 5;/);
});
