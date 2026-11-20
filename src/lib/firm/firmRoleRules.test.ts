/**
 * N03-35/36 (batch l11) — the firm roles screens show the real fixed rules.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { FIRM_INVITE_ROLES, FIRM_ROLE_ORDER, firmRoleRules, firmRoleSections } from "./firmRoleRules.ts";
import { FIRM_ROUTE_RULES } from "../../constants/entityRouteAccess.ts";

const repo = (rel: string) => readFileSync(rel, "utf8").replace(/\r\n/g, "\n");
const rule = (role: string, key: string) => firmRoleRules(role).find((r) => r.key === key);

test("N03-35: every role of the firm_members CHECK is listed once", () => {
  const sql = repo("supabase/migrations/20260616_entities_setup_and_rls_fix.sql");
  for (const role of FIRM_ROLE_ORDER) assert.ok(sql.includes(`'${role}'`), role);
  assert.equal(new Set(FIRM_ROLE_ORDER).size, 13);
});

test("N03-35: rules come from the enforcing constants", () => {
  assert.equal(rule("trainee", "cases")?.note, "المسندة إليه فقط");
  assert.equal(rule("legal_secretary", "cases")?.note, "المسندة إليه فقط");
  assert.equal(rule("lawyer", "cases")?.note, "كل قضايا المكتب");
  assert.equal(rule("finance_manager", "cases")?.allowed, false);
  assert.equal(rule("partner", "assign")?.allowed, true);
  assert.equal(rule("lawyer", "assign")?.allowed, false);
  assert.equal(rule("legal_consultant", "hearings")?.allowed, false, "Art. 18: a consultant does not plead");
  assert.equal(rule("partner", "clientFees")?.allowed, true);
  assert.equal(rule("partner", "firmStatements")?.allowed, false);
  assert.equal(rule("finance_manager", "firmStatements")?.allowed, true);
  assert.equal(rule("finance_manager", "memberPoints")?.allowed, true);
  assert.equal(rule("hr_manager", "team")?.allowed, true);
  assert.equal(rule("office_admin", "letterhead")?.allowed, true);
  assert.equal(rule("partner", "letterhead")?.allowed, false);
  // the managing partner (and so the firm owner) holds every rule
  for (const r of firmRoleRules("managing_partner")) assert.equal(r.allowed, true, r.key);
});

test("N03-35: sections are exactly the route rules that admit the role", () => {
  for (const role of FIRM_ROLE_ORDER) {
    const expected = FIRM_ROUTE_RULES.filter((r) => (r.allowedRoles as readonly string[]).includes(role)).map((r) => r.path);
    assert.deepEqual(firmRoleSections(role).map((s) => s.path), expected, role);
  }
  assert.ok(!firmRoleSections("trainee").some((s) => s.path === "/dashboard/firm/fees"));
});

test("N03-35: the invite rule equals the inline check in the invitations route", () => {
  const route = repo("src/app/api/v1/firm/invitations/route.ts");
  assert.match(route, /if \(!data\.isOwner && data\.role !== "managing_partner"\)/);
  assert.deepEqual([...FIRM_INVITE_ROLES], ["managing_partner"]);
});

test("N03-35/36: both screens are read-only and invent nothing", () => {
  for (const file of ["src/app/dashboard/firm/team/roles/page.tsx", "src/app/dashboard/firm/departments/permissions/page.tsx"]) {
    const page = repo(file);
    assert.match(page, /firmRoleRules/, file);
    for (const gone of ["setMatrix", "togglePermission", "MOCK_ROLES", "MEMBER_COUNTS", "للعرض فقط", "لم تُحفظ", "إنشاء دور جديد", "onClick={() => toggle("]) {
      assert.ok(!page.includes(gone), `${file}: ${gone}`);
    }
  }
  const unfinished = repo("src/constants/sectorUnfinishedModules.ts");
  assert.ok(!unfinished.includes('"/dashboard/firm/team/roles"'), "the roles page is no longer listed as unfinished");
});
