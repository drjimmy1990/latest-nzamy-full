/**
 * designTokens.test.ts — the owner's eight visual refinements (4 Oct item 130).
 *
 * «ضبط الحواف 12px، تباين الخطوط، هوامش الفراغات، تأثير التحويم الذهبي،
 * شريط التنقل الشفاف، شاشات الشيمر، محاذاة RTL، واستجابة الجوال». The parts
 * that live in code are pinned here:
 *   - a 12px radius token, used by the shared Card and Button;
 *   - a `hover-gold` utility built from the gold token, which never turns text
 *     gold (gold on white is about 2.2:1);
 *   - muted body text at gray-600 or darker on light surfaces;
 *   - a navbar that is see-through over the home hero only, and solid after
 *     8px of scroll and on every other page;
 *   - shimmer loading screens for /laws, /blog, /lawyers/browse and the
 *     dashboards.
 * Spacing, RTL alignment and the phone layout are checked in the preview.
 *
 * Run: npx -y node@22 --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/components/ui/designTokens.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { NAV_SOLID_AFTER_PX, isNavbarTransparent, isPastSolidThreshold } from "../navbarChrome.ts";

const read = (rel: string) => readFileSync(path.join(process.cwd(), "src", rel), "utf8");
const css = read("app/globals.css");
const themeBlock = css.match(/@theme\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";

/** WCAG relative luminance of a #rrggbb colour. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

test("globals.css: a 12px radius token in @theme", () => {
  assert.match(themeBlock, /--radius-card:\s*12px;/);
});

test("Card and Button take their corners from the radius token, and only from it", () => {
  const card = read("components/ui/Card.tsx");
  assert.match(card, /"rounded-card border"/);
  assert.doesNotMatch(card, /rounded-(?!card)[\w[]/, "no other radius class in Card");

  const button = read("components/ui/Button.tsx");
  const sizes = button.match(/const sizeClasses[\s\S]*?\};/)?.[0] ?? "";
  for (const size of ["sm", "md", "lg"]) {
    assert.match(sizes, new RegExp(`${size}: "[^"]*\\brounded-card\\b[^"]*"`), `Button ${size} uses rounded-card`);
  }
  assert.doesNotMatch(button, /rounded-(lg|xl|2xl|3xl)\b/, "no fixed radius left in Button");
});

test("globals.css: hover-gold is built from the gold token and never colours text", () => {
  assert.match(themeBlock, /--color-gold:\s*#C8A762;/);
  const utility = css.match(/@utility hover-gold\s*\{[\s\S]*?\n\}/)?.[0];
  assert.ok(utility, "@utility hover-gold exists");
  assert.match(utility, /var\(--color-gold\)/);
  assert.doesNotMatch(utility, /(^|[\s;{])color\s*:/m, "gold text on white fails contrast");
});

test("hover-gold is used, so the utility actually ships", () => {
  assert.match(read("components/Navbar.tsx"), /\bhover-gold\b/);
});

test("muted body text is gray-600 (#4b5563) or darker on light surfaces; dark mode keeps its own", () => {
  const light = themeBlock.match(/--color-ink-muted:\s*(#[0-9a-fA-F]{6});/)?.[1];
  assert.ok(light, "@theme defines --color-ink-muted");
  assert.ok(luminance(light) <= luminance("#4b5563"), `${light} is at least as dark as gray-600`);
  const darkBlock = css.match(/\n\.dark\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(darkBlock, /--color-ink-muted:\s*#9ca3af;/, "dark mode's muted text is unchanged");
});

test("navbar chrome: see-through on the home hero only, solid after 8px of scroll", () => {
  assert.equal(NAV_SOLID_AFTER_PX, 8);
  assert.equal(isPastSolidThreshold(0), false);
  assert.equal(isPastSolidThreshold(8), false);
  assert.equal(isPastSolidThreshold(9), true);

  assert.equal(isNavbarTransparent("/", false, false), true, "home, at the top");
  assert.equal(isNavbarTransparent("/", true, false), false, "home, scrolled past 8px");
  assert.equal(isNavbarTransparent("/", false, true), false, "home with the phone menu open");
  for (const other of ["/laws", "/blog", "/pricing", "/services/individuals", "/dashboard/lawyer", ""]) {
    assert.equal(isNavbarTransparent(other, false, false), false, `${other || "(empty)"} is always solid`);
  }
  assert.equal(isNavbarTransparent(null, false, false), false);
});

test("Navbar wires the chrome to usePathname() and the scroll position", () => {
  const navbar = read("components/Navbar.tsx");
  assert.match(navbar, /from "\.\/navbarChrome"/);
  assert.match(navbar, /const pathname = usePathname\(\);/);
  assert.match(navbar, /isNavbarTransparent\(pathname, scrolled, mobileOpen\)/);
  assert.match(navbar, /isPastSolidThreshold\(window\.scrollY\)/);
  // The see-through branch drops the surface; the solid branch keeps it.
  const branch = navbar.match(/transparent\s*\?\s*"([^"]*)"\s*:\s*"([^"]*)"/);
  assert.ok(branch, "one static class string per state");
  assert.doesNotMatch(branch[1], /\bbg-white|dark:bg-dark-card|backdrop-blur/);
  assert.match(branch[2], /\bbg-white\/85\b/);
  assert.match(branch[2], /dark:bg-dark-card\/90/);
});

const LOADING = [
  "app/laws/loading.tsx",
  "app/blog/loading.tsx",
  "app/lawyers/browse/loading.tsx",
  "app/dashboard/loading.tsx",
];

test("the four loading screens render the shared Skeleton shimmer", () => {
  for (const file of LOADING) {
    assert.ok(existsSync(path.join(process.cwd(), "src", file)), `${file} exists`);
    const src = read(file);
    assert.match(src, /from "@\/components\/ui\/Skeleton"/, `${file} imports Skeleton`);
    assert.match(src, /<(\w*Skeleton|Shimmer)\b/, `${file} renders it`);
    assert.match(src, /aria-busy="true"/, `${file} tells assistive tech it is loading`);
  }
});

test("dark-mode trap: no text-gray-100/200 in the files this task touched", () => {
  const files = [
    "components/Navbar.tsx",
    "components/ui/Card.tsx",
    "components/ui/Button.tsx",
    "components/ui/Skeleton.tsx",
    ...LOADING,
  ];
  for (const file of files) {
    assert.doesNotMatch(read(file), /\btext-gray-(100|200)\b/, `${file}: gray-100/200 are dark SURFACES in dark mode`);
  }
});
