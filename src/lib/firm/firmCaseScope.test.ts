/**
 * Q112 + file 05 #28 (batch l12, 20261202_80): the firm roles that see only
 * their assigned cases — the app's reading of the setting equals the SQL's,
 * the admin write is validated, and the screens follow the database.
 * Run: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/firm/firmCaseScope.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  DEFAULT_FIRM_CASE_SCOPE,
  FIRM_CASE_ALWAYS_SCOPED_ROLES,
  FIRM_CASE_OPTIONAL_SCOPED_ROLES,
  firmCaseScopedRoles,
  firmCaseScopeIssue,
  firmCaseScopeValue,
  firmRoleSeesAssignedCasesOnly,
  parseFirmCaseScope,
} from "./firmCaseScope.ts";
import { firmRoleRules } from "./firmRoleRules.ts";
import { getFirmRouteDecision } from "../../constants/entityRouteAccess.ts";
import { FIRM_CASE_SCOPED_ROLES } from "../services/ownRequestsFilter.ts";

const repo = (rel: string) => readFileSync(rel, "utf8").replace(/\r\n/g, "\n");
const SQL = repo("supabase/migrations/20261202_80_l12_firm_roles_log_badge_storage.sql");

test("Q112: the default narrows the office admin, HR and compliance; the finance manager sees no case files", () => {
  assert.deepEqual(firmCaseScopedRoles(), ["trainee", "legal_secretary", "office_admin", "hr_manager", "compliance_manager"]);
  assert.equal(firmRoleSeesAssignedCasesOnly("finance_manager"), true);
  for (const legal of ["managing_partner", "partner", "senior_lawyer", "lawyer", "legal_consultant"]) {
    assert.equal(firmRoleSeesAssignedCasesOnly(legal), false, legal);
  }
  assert.deepEqual([...FIRM_CASE_ALWAYS_SCOPED_ROLES], [...FIRM_CASE_SCOPED_ROLES]);
});

test("Q112: a stored value is read the way the SQL reads it", () => {
  assert.deepEqual(parseFirmCaseScope(undefined), DEFAULT_FIRM_CASE_SCOPE);
  assert.deepEqual(parseFirmCaseScope({ assigned_only_roles: "all", finance_manager_no_cases: "yes" }), DEFAULT_FIRM_CASE_SCOPE);
  assert.deepEqual(parseFirmCaseScope({ assigned_only_roles: [], finance_manager_no_cases: false }), { assignedOnlyRoles: [], financeManagerNoCases: false });
  // a legal role in the list is ignored, as in public.firm_case_scope_roles()
  assert.deepEqual(parseFirmCaseScope({ assigned_only_roles: ["lawyer", "compliance_manager", "managing_partner"], finance_manager_no_cases: true }).assignedOnlyRoles, ["compliance_manager"]);
  assert.equal(firmRoleSeesAssignedCasesOnly("office_admin", parseFirmCaseScope({ assigned_only_roles: [], finance_manager_no_cases: true })), false);
  assert.equal(firmRoleSeesAssignedCasesOnly("trainee", parseFirmCaseScope({ assigned_only_roles: [], finance_manager_no_cases: false })), true);
});

test("Q112: the SQL's lists equal the app's (firm_case_scope_roles, the seed, the default)", () => {
  const fn = SQL.slice(SQL.indexOf("create or replace function public.firm_case_scope_roles()"));
  const body = fn.slice(0, fn.indexOf("$fn$;"));
  const allowed = body.match(/where r\.role in \(([^)]*)\)/);
  assert.ok(allowed);
  assert.deepEqual([...allowed[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]), [...FIRM_CASE_OPTIONAL_SCOPED_ROLES]);
  const fallback = body.match(/v_extra := array\[([^\]]*)\];/);
  assert.ok(fallback);
  assert.deepEqual([...fallback[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]), [...DEFAULT_FIRM_CASE_SCOPE.assignedOnlyRoles]);
  assert.match(body, /return array\['trainee', 'legal_secretary'\] \|\| v_extra;/);
  const seed = SQL.match(/\('firm_case_scope',\n\s+'([^']+)'::jsonb/);
  assert.ok(seed);
  assert.deepEqual(JSON.parse(seed[1]), firmCaseScopeValue(DEFAULT_FIRM_CASE_SCOPE));
  // the finance manager's rule defaults to on when the key is missing or not a boolean
  assert.match(SQL, /then \(s\.value ->> 'finance_manager_no_cases'\)::boolean else true end/);
});

test("Q112: the admin write accepts only the office roles and a boolean", () => {
  assert.equal(firmCaseScopeIssue(firmCaseScopeValue(DEFAULT_FIRM_CASE_SCOPE)), null);
  assert.equal(firmCaseScopeIssue({ assigned_only_roles: [], finance_manager_no_cases: false }), null);
  for (const bad of [
    null,
    [],
    { assigned_only_roles: ["lawyer"], finance_manager_no_cases: true },
    { assigned_only_roles: ["trainee"], finance_manager_no_cases: true },
    { assigned_only_roles: ["hr_manager", "hr_manager"], finance_manager_no_cases: true },
    { assigned_only_roles: ["hr_manager"], finance_manager_no_cases: "yes" },
    { assigned_only_roles: ["hr_manager"] },
    { assigned_only_roles: ["hr_manager"], finance_manager_no_cases: true, extra: 1 },
  ]) {
    assert.ok(firmCaseScopeIssue(bad), JSON.stringify(bad));
  }
  const route = repo("src/app/api/v1/admin/settings/route.ts");
  assert.match(route, /  "firm_case_scope",\n/);
  assert.match(route, /  firm_case_scope: firmCaseScopeIssue,\n/);
});

test("file 05 #28: the case pages and the database agree — narrowed roles on the page see their own; no page for the finance manager", () => {
  // the compliance manager and the secretary open the cases page; RLS shows them their assigned cases only
  assert.equal(getFirmRouteDecision("/dashboard/firm/cases", "compliance_manager").allowed, true);
  assert.equal(firmRoleSeesAssignedCasesOnly("compliance_manager"), true);
  assert.equal(getFirmRouteDecision("/dashboard/firm/cases", "legal_secretary").allowed, true);
  assert.equal(getFirmRouteDecision("/dashboard/firm/cases", "finance_manager").allowed, false);
  // the trainee stays off the cases page (it is also the list of who may hand a case to a guest, 20261025_32)
  assert.equal(getFirmRouteDecision("/dashboard/firm/cases", "trainee").allowed, false);
  assert.equal(getFirmRouteDecision("/dashboard/firm/documents", "trainee").allowed, true);
});

test("Q112: the roles screens say what the setting says", () => {
  const note = (role: string, scope = DEFAULT_FIRM_CASE_SCOPE) => firmRoleRules(role, scope).find((r) => r.key === "cases");
  assert.equal(note("compliance_manager")?.note, "المسندة إليه فقط");
  assert.equal(note("office_admin")?.note, "المسندة إليه فقط");
  assert.equal(note("finance_manager")?.note, "لا يطّلع على ملفات القضايا، ويرى المالية والأتعاب");
  const off = parseFirmCaseScope({ assigned_only_roles: [], finance_manager_no_cases: false });
  assert.equal(note("compliance_manager", off)?.note, "كل قضايا المكتب");
  assert.equal(note("finance_manager", off)?.note, undefined);
  assert.equal(note("lawyer")?.note, "كل قضايا المكتب");
  for (const file of ["src/app/dashboard/firm/team/roles/page.tsx", "src/app/dashboard/firm/departments/permissions/page.tsx"]) {
    assert.match(repo(file), /firmRoleRules\((selected|role), caseScope\)/, file);
  }
});
