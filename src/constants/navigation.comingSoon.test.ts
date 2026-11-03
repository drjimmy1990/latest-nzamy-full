/**
 * navigation.comingSoon.test.ts — owner UX08 (2026-10-30): the lawyer menu
 * keeps «قريباً» rows apart from the tools that work.
 *
 * Run: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/constants/navigation.comingSoon.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";

import { COMING_SOON_GROUP_TITLE, isComingSoonItem, withComingSoonLast } from "./navigation.comingSoon.ts";
import { getSidebarByUserType } from "./navigation.sidebars.ts";
import { LAWYER_SIDEBAR } from "./navigation.sidebars.legal.ts";
import type { SidebarGroup } from "./navigation.types";

const rows = (groups: SidebarGroup[]) =>
  groups.flatMap((g) => g.items.map((i) => `${i.href}|${i.label}|${i.badge ?? ""}`));

test("the transform only moves rows: same hrefs, labels and badges, nothing added or lost", () => {
  const before = rows(LAWYER_SIDEBAR);
  const after = rows(withComingSoonLast(LAWYER_SIDEBAR));
  assert.deepEqual([...after].sort(), [...before].sort());
});

test("the lawyer menu: every «قريباً» row sits in one last, closed section", () => {
  for (const country of [null, "SA"]) {
    for (const practiceKind of [null, "advocate", "consultant"] as const) {
      const groups = getSidebarByUserType("lawyer", "full", null, [], null, null, null, false, country, practiceKind);
      const last = groups[groups.length - 1];
      assert.equal(last.title, COMING_SOON_GROUP_TITLE, `${country} ${practiceKind}`);
      assert.equal(last.defaultOpen, false);
      assert.equal(last.collapsible, true);
      assert.ok(last.items.length > 0 && last.items.every(isComingSoonItem));
      for (const g of groups.slice(0, -1)) {
        assert.equal(g.items.some(isComingSoonItem), false, `${g.title} still mixes a «قريباً» row`);
      }
    }
  }
  // The SA-only comparative-law row (badged «قريباً») lands there too.
  const sa = getSidebarByUserType("lawyer", "full", null, [], null, null, null, false, "SA");
  assert.ok(sa[sa.length - 1].items.some((i) => i.href === "/ai/global"));
});

test("the daily work stays where it was: overview first, cases group second", () => {
  const groups = getSidebarByUserType("lawyer", "full");
  assert.equal(groups[0].items[0].href, "/dashboard/lawyer");
  assert.equal(groups[1].title, "الجلسات والقضايا");
  const ai = groups.find((g) => g.title === "ذكاء نظامي")!;
  assert.ok(ai.items.some((i) => i.href === "/ai/draft"));
  assert.ok(ai.items.some((i) => i.href === "/ai/contracts"));
});

test("a moved row's divider passes to the next row left in its group; empty groups drop", () => {
  const out = withComingSoonLast([
    { title: "A", items: [
      { label: "a1", labelEn: "a1", href: "/a1", icon: "X" },
      { label: "soon", labelEn: "soon", href: "/s1", icon: "X", badge: "قريباً", divider: true },
      { label: "a2", labelEn: "a2", href: "/a2", icon: "X" },
    ] },
    { title: "B", items: [{ label: "only soon", labelEn: "s", href: "/s2", icon: "X", badge: "قريباً" }] },
  ]);
  assert.deepEqual(out.map((g) => g.title), ["A", COMING_SOON_GROUP_TITLE]);
  assert.equal(out[0].items[1].href, "/a2");
  assert.equal(out[0].items[1].divider, true);
  assert.deepEqual(out[1].items.map((i) => i.href), ["/s1", "/s2"]);
  assert.equal(out[1].items[0].divider, undefined);
});

test("other menus are not regrouped (lawyer only)", () => {
  const firm = getSidebarByUserType("firm", "full");
  assert.equal(firm.some((g) => g.title === COMING_SOON_GROUP_TITLE), false);
  const groupsWithoutSoon = [{ title: "X", items: [{ label: "x", labelEn: "x", href: "/x", icon: "X" }] }];
  assert.equal(withComingSoonLast(groupsWithoutSoon), groupsWithoutSoon);
});
