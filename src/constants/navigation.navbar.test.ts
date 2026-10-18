/**
 * navigation.navbar.test.ts — the visitor navbar's services mega menu
 * (owner, 4 Oct item 129; ruling P18).
 *
 * Item 129 approves «القائمة المنسدلة الكبرى المنظمة (Mega Menu)»: one
 * «الخدمات» entry whose panel sorts the services into four groups, titled in
 * the owner's own words. Regrouping must not lose a page: every href the
 * visitor navbar linked before item 129 is still reachable from it exactly
 * once, and no group is empty.
 *
 * Run: npx -y node@22 --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/constants/navigation.navbar.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  PUBLIC_NAV,
  LAWYER_NAV,
  FIRM_NAV,
  INDIVIDUAL_NAV,
  CORPORATE_NAV,
  MICRO_NAV,
  PROVIDER_NAV,
  ADMIN_NAV,
  GOVERNMENT_NAV,
  NGO_NAV,
  isMegaMenu,
} from "./navigation.navbar.ts";
import type { NavItem } from "./navigation.types.ts";

// Every destination the visitor navbar linked on 18 Oct, before item 129.
const HREFS_BEFORE_ITEM_129 = [
  "/?noredirect=true",
  "/services/individuals",
  "/services/business",
  "/services/lawyers",
  "/ai",
  "/pricing",
  "/laws",
  "/community",
  "/blog",
  "/media",
  "/academy",
];

// Ruling P18: the owner's own titles from item 129, in this order. Each group
// opens with its overview page, then every real public service page under it
// (coordinator ruling, 2026-10-18: "each service reachable in one click").
const GROUPS = [
  {
    label: "خدمات الأفراد",
    hrefs: [
      "/services/individuals",
      "/services/consultations",
      "/services/contracts",
      "/services/legal-representation",
      "/services/notary",
    ],
  },
  {
    label: "خدمات الشركات",
    hrefs: ["/services/business", "/services/business/company-formation", "/services/business/trademark"],
  },
  { label: "خدمات المحامين", hrefs: ["/services/lawyers", "/erp"] },
  // Task 7.7 is gating individual AI tools as «قريباً»; the column links the hub only.
  { label: "أدوات الذكاء الاصطناعي", hrefs: ["/ai"] },
];

// Service pages left out of the menu, each for a reason a test can see in its
// source. If one of these is fixed, move it into GROUPS deliberately.
const LEFT_OUT: Record<string, RegExp> = {
  "/services/cases": /\+٤٢٠ قضية/,                  // invented figure
  "/services/labor": /\+٦٨٠/,                       // invented figures
  "/services/collection": /\+١,٢٠٠/,                // invented figures
  "/services/corporate": /price: '٢,٤٩٩'/,          // plans /pricing does not offer
  "/services/lawyers/vault": /قريباً — غير متاحة حالياً/, // coming soon
};

/** src/app/<path>/page.tsx for an href ("/x?y" → src/app/x/page.tsx). */
function pageFileFor(href: string): string {
  const route = href.split(/[?#]/)[0].replace(/^\/+|\/+$/g, "");
  return path.join(process.cwd(), "src/app", route, "page.tsx");
}

/** The destinations a visitor can click: items with no children of their own. */
function leaves(items: NavItem[]): NavItem[] {
  return items.flatMap((item) => (item.children?.length ? leaves(item.children) : [item]));
}

function servicesItem(): NavItem {
  const item = PUBLIC_NAV.find((i) => i.label === "الخدمات");
  assert.ok(item, "PUBLIC_NAV has a «الخدمات» entry");
  return item;
}

test("every href the visitor navbar linked before item 129 appears exactly once", () => {
  const hrefs = leaves(PUBLIC_NAV).map((i) => i.href);
  for (const href of HREFS_BEFORE_ITEM_129) {
    assert.equal(hrefs.filter((h) => h === href).length, 1, `${href} appears exactly once`);
  }
});

test("every leaf is a real destination, never a «#» menu placeholder", () => {
  for (const leaf of leaves(PUBLIC_NAV)) {
    assert.ok(!leaf.href.startsWith("#"), `${leaf.label} links to ${leaf.href}`);
  }
});

test("«الخدمات» is a bilingual mega menu with the four P18 groups, in order", () => {
  const services = servicesItem();
  assert.equal(services.labelEn, "Services");
  assert.ok(services.href.startsWith("#"), "the parent is a menu, not a page");
  assert.equal(isMegaMenu(services), true);
  assert.deepEqual(
    services.children!.map((g) => g.label),
    GROUPS.map((g) => g.label),
  );
});

test("no group is empty, each has an English twin, and each lists its service pages", () => {
  const groups = servicesItem().children!;
  for (const [i, group] of groups.entries()) {
    assert.ok(group.labelEn.trim().length > 0, `${group.label} has an English title`);
    assert.ok(group.href.startsWith("#"), `${group.label} is a heading, not a link`);
    assert.ok((group.children?.length ?? 0) > 0, `${group.label} is not empty`);
    for (const link of group.children!) {
      assert.ok(link.label.trim() && link.labelEn.trim(), `${link.href} is labelled in both languages`);
    }
    // The overview page first, then the group's service pages, in order.
    assert.deepEqual(group.children!.map((link) => link.href), GROUPS[i].hrefs, `«${group.label}»`);
  }
});

test("every link in the visitor navbar is unique", () => {
  const hrefs = leaves(PUBLIC_NAV).map((i) => i.href);
  assert.deepEqual(
    hrefs.filter((h, i) => hrefs.indexOf(h) !== i),
    [],
    "no href is linked twice",
  );
  const labels = leaves(servicesItem().children!).map((i) => i.label);
  assert.equal(new Set(labels).size, labels.length, "no two services share a label");
});

test("every href resolves to an existing page.tsx under src/app", () => {
  for (const leaf of leaves(PUBLIC_NAV)) {
    assert.ok(existsSync(pageFileFor(leaf.href)), `${leaf.href} → ${path.relative(process.cwd(), pageFileFor(leaf.href))}`);
  }
});

test("no service in the menu is a redirect or a whole-page «قريباً» screen", () => {
  // Comments may mention either (the /ai hub's do); only code counts.
  const code = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  for (const leaf of leaves(servicesItem().children!)) {
    const src = code(readFileSync(pageFileFor(leaf.href), "utf8"));
    assert.doesNotMatch(src, /\bredirect\(/, `${leaf.href} redirects`);
    assert.doesNotMatch(src, /<(Dashboard)?ComingSoon\b/, `${leaf.href} is a coming-soon screen`);
  }
});

test("the pages left out stay out, and each still shows the reason it was left out", () => {
  const linked = new Set(leaves(PUBLIC_NAV).map((i) => i.href));
  for (const [href, reason] of Object.entries(LEFT_OUT)) {
    assert.ok(!linked.has(href), `${href} is not in the menu`);
    // When the reason disappears from the page, this fails: time to add it.
    assert.match(readFileSync(pageFileFor(href), "utf8"), reason, `${href} still carries its reason`);
  }
});

test("only the visitor navbar has a mega menu; the signed-in navbars render as before", () => {
  const signedIn = [
    LAWYER_NAV, FIRM_NAV, INDIVIDUAL_NAV, CORPORATE_NAV, MICRO_NAV,
    PROVIDER_NAV, ADMIN_NAV, GOVERNMENT_NAV, NGO_NAV,
  ];
  for (const nav of signedIn) {
    for (const item of nav) assert.equal(isMegaMenu(item), false, `${item.labelEn} stays a plain item`);
  }
  // «المعرفة القانونية» is a plain dropdown of links, not groups.
  const knowledge = PUBLIC_NAV.find((i) => i.href === "#knowledge");
  assert.ok(knowledge);
  assert.equal(isMegaMenu(knowledge), false);
});

test("isMegaMenu: a menu whose children are all groups of links", () => {
  const link = (href: string): NavItem => ({ label: href, labelEn: href, href });
  assert.equal(isMegaMenu(link("/a")), false);
  assert.equal(isMegaMenu({ ...link("#m"), children: [link("/a")] }), false);
  assert.equal(isMegaMenu({ ...link("#m"), children: [{ ...link("#g"), children: [link("/a")] }] }), true);
  assert.equal(
    isMegaMenu({ ...link("#m"), children: [{ ...link("#g"), children: [link("/a")] }, link("/b")] }),
    false,
    "a stray link beside the groups would vanish from the panel",
  );
});

// ── Navbar.tsx source pins (a React component cannot render under node --test) ──
const navbar = readFileSync(path.join(process.cwd(), "src/components/Navbar.tsx"), "utf8");

test("Navbar: the mega-menu trigger is a keyboard-operable disclosure button", () => {
  assert.match(navbar, /isMegaMenu\(/, "Navbar picks the mega menu from the data");
  assert.match(navbar, /aria-controls=\{panelId\}/);
  assert.match(navbar, /aria-expanded=\{open\}/);
  // Enter and Space on a <button> fire a click with detail 0: that toggles.
  assert.match(navbar, /e\.detail === 0/);
  // Escape closes and hands focus back to the trigger.
  assert.match(navbar, /e\.key === "Escape"[\s\S]{0,200}triggerRef\.current\?\.focus\(\)/);
});

test("Navbar: menus close on an outside click and on a route change", () => {
  assert.match(navbar, /addEventListener\("mousedown"/);
  assert.match(navbar, /usePathname\(\)/);
  assert.match(navbar, /pathname !== menusPath/);
});

test("Navbar: the full-width panel box takes no clicks; only the bridge and the panel do", () => {
  // Otherwise the invisible box beside the max-w-5xl panel swallows a click
  // meant as "outside" and blocks the page under it.
  assert.match(navbar, /className="pointer-events-none absolute inset-x-0 top-\[calc\(100%_-_1rem\)\] z-50"/);
  assert.match(navbar, /<div aria-hidden="true" className="pointer-events-auto h-6" \/>/);
  assert.match(navbar, /className="pointer-events-auto mx-auto grid max-w-5xl grid-cols-4/);
});
