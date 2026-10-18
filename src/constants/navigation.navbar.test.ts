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
import { existsSync, readdirSync, readFileSync } from "node:fs";
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
    hrefs: [
      "/services/business",
      "/services/business/company-formation",
      "/services/business/trademark",
      "/services/corporate/health-check",
    ],
  },
  { label: "خدمات المحامين", hrefs: ["/services/lawyers", "/erp"] },
  // Task 7.7 is gating individual AI tools as «قريباً»; the column links the hub only.
  { label: "أدوات الذكاء الاصطناعي", hrefs: ["/ai"] },
];

// Every /services page that is NOT in the menu, and why it was left out when
// it was vetted (2026-10-18): invented figures, or features the page claims but
// the platform does not have. A page joins GROUPS only after someone re-vets
// it; a test cannot tell when a page has become honest.
const LEFT_OUT: Record<string, string> = {
  "/services": "demand badges «🔥 طلب مرتفع» with no booking data behind them (owner Q164), and a hard-coded «لوحة الطلبات الواردة» (req-1…req-4, «منذ ٣ ساعات») for the lawyer-provider role",
  "/services/cases": "invented figure «+٤٢٠ قضية مُغلقة في آخر ٦ أشهر»",
  "/services/labor": "invented figures «٩٣٪ نسبة القضايا لصالح العمال»، «١٨ يوماً»، «+٦٨٠ قضية عمالية مُحلّة»",
  "/services/collection": "invented figures «٨٧٪ نسبة التحصيل الناجح»، «٢٣ يوماً»، «+١,٢٠٠ ملف دين»",
  "/services/corporate": "monthly plans «٢,٤٩٩ / ٥,٩٩٩ شهرياً» that /pricing does not offer, and a hard-coded «تقييم مؤسستك» score widget (78/45/91٪)",
  "/services/corporate/seconded-counsel": "invented named testimonials («م. خالد الدوسري»، «أ. نورة السبيعي» — «وفّر علينا … ٣٠٠,٠٠٠ ريال»)",
  "/services/corporate/governance": "«قيد التطوير — لم تُطلق بعد»: the automatic escalation, WhatsApp alerts and digital seal it describes are not built",
  "/services/arbitration": "invented figures «أقل تكلفة بـ٤٠٪» and «+١٦٠ دولة»",
  "/services/tracking": "a «لوحة تتبع مباشرة تُحدَّث في الوقت الفعلي» and a tracking number that do not exist, «أكثر من ٢٠ جهة» / «+ ١٢ جهة أخرى» invented, and a mock card «آخر تحديث: منذ ٥ دقائق»",
  "/services/creators": "promises «استشارة قانونية مجانية مع محامٍ متخصص في حقوق المبدعين»; consultations are paid (/services/consultations), no free one exists",
  "/services/lawyers/vault": "«قريباً — غير متاحة حالياً»",
};

/** src/app/<path>/page.tsx for an href ("/x?y" → src/app/x/page.tsx). */
function pageFileFor(href: string): string {
  const route = href.split(/[?#]/)[0].replace(/^\/+|\/+$/g, "");
  return path.join(process.cwd(), "src/app", route, "page.tsx");
}

/** Every static /services route on disk ("/services", "/services/notary", …). */
function servicePagesOnDisk(): string[] {
  const root = path.join(process.cwd(), "src/app/services");
  const routes = readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name === "page.tsx")
    .map((e) => path.relative(root, e.parentPath).split(path.sep).filter(Boolean))
    .filter((segments) => !segments.some((s) => s.startsWith("[") || s.startsWith("(") || s.startsWith("_")))
    .map((segments) => ["/services", ...segments].join("/"));
  return routes.sort();
}

/** Source with comments removed: a comment may quote what was taken out. */
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

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
  for (const leaf of leaves(servicesItem().children!)) {
    const src = code(readFileSync(pageFileFor(leaf.href), "utf8"));
    assert.doesNotMatch(src, /\bredirect\(/, `${leaf.href} redirects`);
    assert.doesNotMatch(src, /<(Dashboard)?ComingSoon\b/, `${leaf.href} is a coming-soon screen`);
  }
});

test("every /services page on disk has a menu decision: linked, or left out with a reason", () => {
  const linked = new Set(leaves(servicesItem().children!).map((i) => i.href));
  for (const route of servicePagesOnDisk()) {
    assert.ok(
      linked.has(route) || route in LEFT_OUT,
      `${route} has no decision — vet it (invented figures AND feature claims), then add it to its group or to LEFT_OUT`,
    );
  }
  for (const [href, reason] of Object.entries(LEFT_OUT)) {
    assert.ok(existsSync(pageFileFor(href)), `LEFT_OUT names ${href}, which has no page.tsx`);
    assert.ok(reason.trim().length > 0, `${href} records why it was left out`);
  }
});

test("the pages left out stay out of the menu", () => {
  const linked = new Set(leaves(PUBLIC_NAV).map((i) => i.href));
  for (const [href, reason] of Object.entries(LEFT_OUT)) {
    assert.ok(
      !linked.has(href),
      `${href} was left out (${reason}). Re-vet this page before adding it, then remove it from LEFT_OUT.`,
    );
  }
});

// Two pages in the menu promised a step that does not exist: picking your own
// lawyer from suggestions "with their ratings and case history". The lawyer
// directory is closed during the beta (BETA_MONOPOLY_MODE) and the office
// assigns the lawyer (N16); there is no ratings table.
test("legal-representation and consultations no longer promise ratings or choosing a lawyer", () => {
  for (const href of ["/services/legal-representation", "/services/consultations"]) {
    const src = code(readFileSync(pageFileFor(href), "utf8"));
    assert.doesNotMatch(src, /تقييمات|والتقييم/, `${href}: no lawyer ratings («تقييمات»)`);
    assert.doesNotMatch(src, /\brating/i, `${href}: no lawyer ratings ("rating")`);
    assert.doesNotMatch(src, /اختيار المحامي|اختر المحامي|Choose a Lawyer|Lawyer Selection/, `${href}: no lawyer-choosing step`);
    assert.match(src, /يُراجع فريق نظامي طلبك ويُسنده إلى محامٍ مختص/, `${href}: says the office assigns the lawyer`);
    assert.match(src, /Nezamy's team reviews your request and assigns a specialist lawyer/, `${href}: English twin`);
  }
  // The 24-hour assessment promise is gone from legal-representation. (The
  // consultations page's «٢٤ ساعة» are a follow-up window and a refund window,
  // a different commitment, and stay.)
  const rep = code(readFileSync(pageFileFor("/services/legal-representation"), "utf8"));
  assert.doesNotMatch(rep, /٢٤ ساعة/, "legal-representation: no «خلال ٢٤ ساعة»");
  assert.doesNotMatch(rep, /24 hours/i, "legal-representation: no \"within 24 hours\"");
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
