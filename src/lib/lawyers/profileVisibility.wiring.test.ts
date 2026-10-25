/**
 * Source pins for N3.8: where the switches are read, applied and saved.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = join(import.meta.dirname, "../..");
const read = (f: string) => readFileSync(join(src, f), "utf8");

test("the public profile reads the switches in their own query and applies them last", () => {
  const route = read("app/api/v1/lawyers/[id]/route.ts");
  assert.match(route, /select\(PROFILE_VISIBILITY_COLUMNS\)/);
  const publicCols = route.slice(route.indexOf("const PUBLIC_COLUMNS"), route.indexOf(";", route.indexOf("const PUBLIC_COLUMNS")));
  assert.doesNotMatch(publicCols, /show_services|show_education|show_courts/, "never inside the wide select (42703 before the migration)");
  const apply = route.indexOf("applyProfileVisibility(row, lp, visibilityApplied)");
  assert.ok(apply > route.indexOf("row.services = services;"), "after services/reviews are set");
  assert.ok(apply < route.indexOf("return NextResponse.json({ data: row })"));
});

test("PATCH /api/v1/profile accepts the three switches as booleans only", () => {
  const route = read("app/api/v1/profile/route.ts");
  for (const k of ["show_services", "show_education", "show_courts"]) {
    assert.ok(route.includes(`"${k}",`), `${k} is allowlisted`);
  }
  assert.match(route, /typeof body\[key\] !== "boolean"/);
});

test("both settings screens send the switches only when the GET proved the columns exist", () => {
  const edit = read("app/dashboard/lawyer/profile/edit/page.tsx");
  assert.match(edit, /setSectionTogglesAvailable\("show_services" in r/);
  assert.match(edit, /if \(sectionTogglesAvailable\) \{\s*body\.show_services/);
  const tab = read("app/settings/components/tabs/ProfessionTab.tsx");
  assert.match(tab, /\.\.\.\(sections === null\s*\?\s*\{\}/);
  for (const f of [edit, tab]) {
    assert.doesNotMatch(f, /show_reviews|إخفاء التقييمات/, "reviews have no switch");
  }
});
