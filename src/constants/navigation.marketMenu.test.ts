/**
 * Owner answer ٢٣٨ (27 Nov 2026, batch l18-answers): «يُفتح السوق ويظهر في
 * القوائم لجميع الأدوار (ولا يُخفى بوضع الإطلاق التجريبي)», keeping Nezamy's
 * 30-minute priority (in the database, 20261206_40).
 *
 * The beta switch no longer strips the dashboards' market pages; it still
 * strips the links it redirects away (/marketplace* → /services, the lawyer
 * directory /services/lawyers), which would be dead ends in a menu.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/constants/navigation.marketMenu.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getSidebarByUserType } from "./navigation.sidebars.ts";

const src = readFileSync(new URL("./navigation.sidebars.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const hidden = (src.match(/const hiddenHrefs = \[([\s\S]*?)\];/)?.[1] ?? "")
  .split("\n")
  .map((l) => l.replace(/\/\/.*$/, "").trim())
  .filter(Boolean)
  .map((l) => l.replace(/[",]/g, ""));

test("the beta switch keeps hiding only the redirected public board and the closed directory", () => {
  assert.deepEqual(hidden.sort(), [
    "/marketplace",
    "/marketplace/collaborate",
    "/marketplace/my-requests",
    "/marketplace/post",
    "/marketplace/profile",
    "/marketplace?tab=my-requests",
    "/services/lawyers",
  ].sort());
  for (const page of ["/dashboard/lawyer/marketplace", "/dashboard/firm/marketplace", "/dashboard/business/marketplace", "/dashboard/provider/requests"]) {
    assert.ok(!hidden.includes(page), `${page} is no longer stripped`);
  }
  // …and those public pages are indeed still redirected by the same switch.
  const layout = readFileSync(new URL("../app/marketplace/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /if \(BETA_MONOPOLY_MODE\) redirect\("\/services"\);/);
});

const hrefs = (groups: ReturnType<typeof getSidebarByUserType>) => groups.flatMap((g) => g.items.map((i) => i.href));

test("the lawyer's and the firm's menus carry their market page", () => {
  assert.ok(hrefs(getSidebarByUserType("lawyer")).includes("/dashboard/lawyer/marketplace"));
  assert.ok(hrefs(getSidebarByUserType("firm")).includes("/dashboard/firm/marketplace"));
});

test("the firm's market page lists the open requests, as the lawyer's does", () => {
  const firm = readFileSync(new URL("../app/dashboard/firm/marketplace/page.tsx", import.meta.url), "utf8");
  const lawyer = readFileSync(new URL("../app/dashboard/lawyer/marketplace/page.tsx", import.meta.url), "utf8");
  for (const page of [firm, lawyer]) assert.match(page, /<OpenRequestsList \/>/);
});
