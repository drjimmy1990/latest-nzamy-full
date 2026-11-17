/**
 * N03-40 — the case-assignment route's role sets and its wiring.
 * Run: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/app/api/v1/firm/cases/_caseAssign.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FIRM_CASE_ASSIGN_ROLES, FIRM_CASE_ASSIGNEE_ROLES } from "./_caseAssign.ts";
import { FIRM_ROUTE_RULES } from "../../../../../constants/entityRouteAccess.ts";

const route = readFileSync(new URL("./[id]/assign/route.ts", import.meta.url), "utf8");

test("who may assign = the «توزيع القضايا» route rule, exactly", () => {
  const rule = FIRM_ROUTE_RULES.find((r) => r.path === "/dashboard/firm/cases/assign");
  assert.ok(rule);
  assert.deepEqual([...FIRM_CASE_ASSIGN_ROLES].sort(), [...rule!.allowedRoles].sort());
});

test("a case never goes to an admin-only role", () => {
  for (const r of ["legal_secretary", "office_admin", "finance_manager", "hr_manager", "compliance_manager"]) {
    assert.ok(!FIRM_CASE_ASSIGNEE_ROLES.has(r), r);
  }
});

test("the route checks role, the case's firm and the member before a scoped service write", () => {
  assert.match(route, /FIRM_CASE_ASSIGN_ROLES\.has\(callerFirm\.role\)/);
  assert.match(route, /if \(row\.firm_id !== callerFirm\.id\)/);
  assert.match(route, /\.eq\("status", "active"\)/);
  assert.match(route, /\.update\(\{ assigned_to: target\.userId \}\)\s*\.eq\("id", row\.id\)\s*\.eq\("firm_id", callerFirm\.id\)/);
  // The case is read through the caller's own client (RLS) — not the service client.
  assert.match(route, /const \{ data: row, error: caseError \} = await supabase\s*\.from\("service_requests"\)/);
});
