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
import { getSidebarByUserType, setBetaMonopolyModeForTests } from "./navigation.sidebars.ts";
import { isRouteAllowedFor } from "../lib/auth/routeAccess.ts";

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

const hrefs = (groups: ReturnType<typeof getSidebarByUserType>) => groups.flatMap((g) => g.items.flatMap((i) => [i, ...(i.children ?? [])]).map((i) => i.href));

test("the lawyer's and the firm's menus carry their market page", () => {
  assert.ok(hrefs(getSidebarByUserType("lawyer")).includes("/dashboard/lawyer/marketplace"));
  assert.ok(hrefs(getSidebarByUserType("firm")).includes("/dashboard/firm/marketplace"));
});

// l18 review: node cannot resolve "@/lib/betaConfig", so the switch read false
// here and the beta-on menus were never drawn. Production runs with it ON.
test("with the beta switch ON (as in production) every role keeps a working market entry, and no menu links a redirected page", () => {
  setBetaMonopolyModeForTests(true);
  try {
    const entry: Record<string, string> = {
      lawyer: "/dashboard/lawyer/marketplace",
      firm: "/dashboard/firm/marketplace",
      individual: "/dashboard/client/services",
      corporate: "/dashboard/client/services",
      micro: "/dashboard/client/services",
    };
    for (const [type, href] of Object.entries(entry)) {
      const menu = hrefs(getSidebarByUserType(type as never));
      assert.ok(menu.includes(href), `${type} has ${href}`);
      assert.ok(isRouteAllowedFor(href, type), `${type} may open ${href}`);
    }
    assert.ok(hrefs(getSidebarByUserType("micro" as never)).includes("/dashboard/client/requests"), "micro follows its requests");
    // No role is left a dead end: nothing the switch redirects, and every row opens for that role.
    // (Not served yet, and said so in the report: government and ngo — the shared intake
    // is closed to them; the independent consultant — a client of /marketplace, which the
    // switch redirects; the provider — /dashboard/provider/requests is «قريباً».)
    for (const type of ["lawyer", "firm", "individual", "corporate", "micro", "government", "ngo", "provider"]) {
      const menu = hrefs(getSidebarByUserType(type as never));
      for (const h of hidden) assert.ok(!menu.includes(h), `${type}: ${h} is redirected by the switch`);
    }
    const consultant = hrefs(getSidebarByUserType("lawyer" as never, "full", null, [], null, null, null, false, null, "consultant" as never));
    for (const h of hidden) assert.ok(!consultant.includes(h), `consultant: ${h}`);
  } finally {
    setBetaMonopolyModeForTests(false);
  }
});

test("the firm's market page lists the open requests, as the lawyer's does; a verified firm reads it, a lawyer asks", () => {
  const firm = readFileSync(new URL("../app/dashboard/firm/marketplace/page.tsx", import.meta.url), "utf8");
  const lawyer = readFileSync(new URL("../app/dashboard/lawyer/marketplace/page.tsx", import.meta.url), "utf8");
  for (const page of [firm, lawyer]) assert.match(page, /<OpenRequestsList \/>/);
  const route = readFileSync(new URL("../app/api/v1/lawyer/open-requests/route.ts", import.meta.url), "utf8");
  assert.match(route, /supabase\.from\("firm_profiles"\)\.select\("verification_status"\)\.eq\("owner_user_id", user\.id\)/);
  assert.match(route, /canAsk: lawyerVerified === true,/);
  const list = readFileSync(new URL("../components/marketplace/OpenRequestsList.tsx", import.meta.url), "utf8");
  assert.match(list, /state\.verified === true && state\.canAsk && market\?\.installed === true/);
  assert.match(list, /تظهر الطلبات المفتوحة لحساب المكتب بعد اعتماد توثيق مكتبك\./);
});
