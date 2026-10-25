/**
 * navigation.fullOnly.test.ts — owner ٢٦٤ (letter of 2026-10-25, §٤ item ١).
 *
 * The «مبسّطة / كاملة» buttons at the top of the lawyer / firm sidebar are gone
 * for good, and the sidebar is always the full list. A user whose preferences
 * or lawyer_profiles / firm_profiles.display_mode still hold "light" (saved
 * before this change) must get the full sidebar too — getSidebarByUserType
 * ignores the mode it is handed.
 *
 * Run: npx -y node@22 --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/constants/navigation.fullOnly.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { getSidebarByUserType } from "./navigation.sidebars.ts";
import * as sidebars from "./navigation.sidebars.ts";
import type { AffiliationRole } from "../hooks/useUser";

const FIRM_ROLES: Array<AffiliationRole | null> = [
  null, "managing_partner", "partner", "senior_lawyer", "lawyer", "trainee",
  "legal_secretary", "office_admin", "finance_manager", "hr_manager",
  "compliance_manager", "external_of_counsel", "legal_consultant", "in_house_counsel",
];

test("a stale \"light\" mode gets the full lawyer sidebar (advocate, consultant, Saudi)", () => {
  for (const practiceKind of [null, "advocate", "consultant"] as const) {
    for (const country of [null, "SA"]) {
      assert.deepEqual(
        getSidebarByUserType("lawyer", "light", null, [], null, null, null, false, country, practiceKind),
        getSidebarByUserType("lawyer", "full", null, [], null, null, null, false, country, practiceKind),
        `lawyer ${practiceKind} ${country}`,
      );
    }
  }
});

test("a stale \"light\" mode gets the full firm sidebar for every firm role", () => {
  for (const role of FIRM_ROLES) {
    assert.deepEqual(
      getSidebarByUserType("firm", "light", null, [], null, null, role),
      getSidebarByUserType("firm", "full", null, [], null, null, role),
      `firm ${role}`,
    );
  }
});

test("the lite sidebars and the toggle are gone from the code", () => {
  assert.equal("LAWYER_SIDEBAR_LITE" in sidebars, false);
  assert.equal("FIRM_SIDEBAR_LITE" in sidebars, false);

  const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
  const shared = read("../components/dashboard/SharedSidebar.tsx");
  const parts = read("../components/dashboard/SidebarComponents.tsx");
  const search = read("../components/dashboard/GlobalSearch.tsx");
  for (const [name, src] of [["SharedSidebar", shared], ["SidebarComponents", parts]] as const) {
    assert.doesNotMatch(src, /DashboardModeToggle/, name);
    assert.doesNotMatch(src, /مبسّطة|مبسطة/, name);
  }
  // The sidebar and the search both ask for the full list, whatever the
  // session's dashboardMode says.
  assert.match(shared, /getSidebarByUserType\(\s*userType, "full", /);
  assert.match(search, /getSidebarByUserType\(userType, "full", /);
  // The old localStorage key is only ever removed, never read.
  assert.doesNotMatch(shared, /getItem\("nzamy_dashboard_mode"\)/);
});
