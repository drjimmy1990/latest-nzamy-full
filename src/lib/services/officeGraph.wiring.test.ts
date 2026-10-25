/**
 * N3.11 wiring: the office graph is read-only, RLS-only, and reachable by the
 * firm roles that may open «قضايا المكتب» — no more, no fewer.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getFirmRouteDecision } from "../../constants/entityRouteAccess.ts";
import { getSidebarByUserType } from "../../constants/navigation.sidebars.ts";
import type { AffiliationRole } from "../../hooks/useUser.ts";
import type { SidebarGroup } from "../../constants/navigation.types.ts";

const src = join(import.meta.dirname, "../..");
const read = (f: string) => readFileSync(join(src, f), "utf8");

const ALL_ROLES: AffiliationRole[] = [
  "managing_partner", "partner", "senior_lawyer", "lawyer", "trainee", "legal_secretary", "office_admin",
  "finance_manager", "hr_manager", "compliance_manager", "external_of_counsel", "legal_consultant", "in_house_counsel",
];

const hrefs = (groups: SidebarGroup[]) => groups.flatMap((g) => g.items.map((i) => i.href));

test("the route reads through the caller's RLS client and writes nothing", () => {
  const route = read("app/api/v1/lawyer/office-graph/route.ts");
  assert.match(route, /assertCaseWorker\(\)/);
  assert.doesNotMatch(route, /createServiceClient|createAdminClient/);
  assert.doesNotMatch(route, /\.(insert|update|upsert|delete|rpc)\(/);
  assert.doesNotMatch(route, /from\("case_graphs"\)/);
  assert.doesNotMatch(route, /export async function (POST|PUT|PATCH|DELETE)/);
});

test("every firm role that opens «قضايا المكتب» opens the map, and is offered it; the others neither", () => {
  for (const role of ALL_ROLES) {
    const cases = getFirmRouteDecision("/dashboard/firm/cases", role).allowed;
    const graph = getFirmRouteDecision("/dashboard/firm/graph", role).allowed;
    assert.equal(graph, cases, `${role}: the map follows the cases rule`);
    const sidebar = hrefs(getSidebarByUserType("firm", "full", null, [], null, null, role));
    assert.equal(sidebar.includes("/dashboard/firm/graph"), graph, `${role}: offered the link iff allowed`);
  }
});

test("lawyers get the link in both sidebar variants", () => {
  for (const mode of ["full", "light"] as const) {
    assert.ok(hrefs(getSidebarByUserType("lawyer", mode)).includes("/dashboard/lawyer/graph"), mode);
  }
});

test("the page is honest about what it shows", () => {
  const view = read("components/dashboard/officeGraph/OfficeGraphView.tsx");
  assert.match(view, /تنبيه للتحقق، لا حكم بوجود تعارض/);
  assert.match(view, /read\.truncated\.cases \|\| read\.truncated\.clients/);
  assert.doesNotMatch(view, /localStorage|setTimeout|نسبة|احتمال/);
});
