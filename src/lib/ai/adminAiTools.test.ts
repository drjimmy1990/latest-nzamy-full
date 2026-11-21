/**
 * N2 (owner F02 §5 #63, batch l12): the admin sees every AI tool open, the
 * drafter then محترف العقود first, untagged — display only. A switched-off tool
 * still refuses his run before any charge; only «staff» or «live» spends cost.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/adminAiTools.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { adminAiOrder, adminAiSidebarGroup, adminSeesTool, withAdminAiGroup, ADMIN_AI_FIRST } from "./adminAiTools.ts";
import { toolAvailability, toolAccessFor } from "./aiToolsConfig.ts";
import { AI_TOOLS } from "./tools.ts";
import { LAWYER_AI_TOOLS } from "../../constants/lawyerAiCatalog.ts";

const src = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

test("the cost rule is unchanged: «off» refuses the admin; «staff» and «live» run for him", () => {
  assert.equal(toolAvailability("off", true), "tool_off");
  assert.equal(toolAvailability("staff", true), "ok");
  assert.equal(toolAvailability("live", true), "ok");
  assert.equal(toolAvailability("staff", false), "tool_off");
  assert.equal(toolAccessFor(AI_TOOLS["legal-drafter"], { userType: "admin", practiceKind: null }, { mode: "off" }), "tool_off");
  // The run path and tool-status were not given an admin bypass of the mode.
  assert.doesNotMatch(src("lib/ai/aiToolsConfig.ts"), /isAdmin\s*\)\s*return\s*"ok"/);
  assert.match(src("lib/ai/runCore.ts"), /if \(toolAvailability\(runtime\.mode, isAdmin\) === "tool_off"\) \{\n?\r?\n?\s*return \{ status: 423/);
});

test("only a resolved admin session gets the admin display", () => {
  assert.equal(adminSeesTool(false, "admin"), true);
  assert.equal(adminSeesTool(true, "admin"), false);
  for (const t of ["lawyer", "firm", "individual", "", null, undefined]) assert.equal(adminSeesTool(false, t), false, String(t));
});

test("the order: the drafter, then محترف العقود, then the rest as listed (stable)", () => {
  assert.deepEqual([...ADMIN_AI_FIRST], ["/ai/draft", "/ai/contracts"]);
  const ordered = adminAiOrder([{ href: "/ai/x" }, { href: "/ai/contracts" }, { href: "/ai/y" }, { href: "/ai/draft" }]);
  assert.deepEqual(ordered.map((t) => t.href), ["/ai/draft", "/ai/contracts", "/ai/x", "/ai/y"]);
});

test("the admin's AI group: every catalog tool and the negotiator, his order, no badge", () => {
  const g = adminAiSidebarGroup();
  const hrefs = g.items.map((i) => i.href);
  assert.deepEqual(hrefs.slice(0, 2), ["/ai/draft", "/ai/contracts"]);
  for (const t of LAWYER_AI_TOOLS) assert.ok(hrefs.includes(t.href), t.href);
  assert.ok(hrefs.includes("/ai/contract-negotiator"));
  assert.equal(new Set(hrefs).size, hrefs.length, "no duplicate row");
  for (const i of g.items) {
    assert.equal(i.badge, undefined, i.href);
    assert.notEqual(i.icon, "Scales", `${i.href}: no cross-like icon`);
  }
});

test("the group goes in for a real admin in a working view only", () => {
  const base = [{ items: [{ label: "نظرة عامة", labelEn: "Overview", href: "/dashboard/lawyer", icon: "SquaresFour" }] }, { title: "x", items: [] }];
  assert.equal(withAdminAiGroup(base, false, "lawyer"), base);
  assert.equal(withAdminAiGroup(base, true, "admin"), base, "the admin console keeps its own menu");
  const shown = withAdminAiGroup(base, true, "lawyer");
  assert.equal(shown.length, 3);
  assert.equal(shown[1].title, "كل أدوات الذكاء (للإدارة)");
});

test("wiring: hub, sidebar, the screen gate and the /ai notice", () => {
  const hub = src("app/ai/page.tsx");
  assert.match(hub, /const shownTools = user\.userType === "admin"\s*\? adminAiOrder\(allowedTools\)\.map\(\(t\) => \(\{ \.\.\.t, badge: undefined, badgeAr: undefined, badgeEn: undefined \}\)\)/);
  assert.match(src("components/dashboard/SharedSidebar.tsx"), /const groups = withAdminAiGroup\(lockedGroups, isRealAdmin, userType\);/);
  const hook = src("hooks/useToolUsable.ts");
  assert.match(hook, /const admin = adminSeesTool\(user\.loading, user\.userType\);/);
  assert.match(hook, /return admin \? true : usable;/);
  assert.match(src("components/ai/AdminToolsNotice.tsx"), /الأداة المتوقفة لا تعمل ولا تُحتسب لها تكلفة/);
});
