/**
 * sitemap-tools.test.ts — the sitemap advertises no AI tool that opens to
 * nothing usable (Wave 1 task 6 review M1): every route in
 * TERMINAL_TOOL_ROUTES (the beta-gate card or «قريباً») stays out of it.
 *
 * Source-read: sitemap.ts imports Next and the Supabase server client, which
 * node:test cannot load.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/app/sitemap-tools.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { TERMINAL_TOOL_ROUTES } from "../constants/betaGatedRoutes.ts";
import { LAWYER_ONLY_AI_PAGES } from "../lib/ai/lawyerOnlyTools.ts";

const src = readFileSync(new URL("./sitemap.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const urls = [...src.matchAll(/\{ url: "([^"]+)"/g)].map((m) => m[1]);

test("the sitemap lists static routes (the read found them)", () => {
  // 46 since the 25-Nov package dropped six redirect / «قريباً» URLs (GSC-01).
  assert.ok(urls.length > 40, `only ${urls.length} static urls read from sitemap.ts`);
  assert.ok(urls.includes("/ai"), "the AI hub itself stays listed");
});

test("task 6 review M1: no gate-only or «قريباً» tool route is advertised to search engines", () => {
  const listed = urls.filter((u) => TERMINAL_TOOL_ROUTES.includes(u));
  assert.deepEqual(listed, []);
});

test("the guest tools with a working path stay listed", () => {
  for (const route of ["/ai/collector", "/ai/procedures"]) {
    assert.ok(urls.includes(route), route);
  }
});

test("owner package 25-Nov (GSC-01): no redirect and no «قريباً» page is listed", () => {
  // /ai/legal-translate renders DashboardComingSoon (its page.tsx); it was
  // pinned as listed above until then. /lawyers, /precedents and
  // /community/public always redirect; /academy and /media say «قريباً».
  for (const route of ["/ai/legal-translate", "/lawyers", "/precedents", "/community/public", "/academy", "/media"]) {
    assert.ok(!urls.includes(route), route);
  }
  // /marketplace and /lawyers/browse redirect only during the beta: they stay
  // in the list and are filtered at runtime while BETA_MONOPOLY_MODE is on.
  assert.match(src, /const BETA_HIDDEN_ROUTES: readonly string\[\] = \["\/lawyers\/browse", "\/marketplace"\];/);
  assert.match(src, /BETA_MONOPOLY_MODE\n\s*\? publicRoutes\.filter\(\(r\) => !BETA_HIDDEN_ROUTES\.includes\(r\.url\)\)/);
});

test("owner 18 Nov, item 4.3: /ai/draft and /ai/legal-opinion are sign-in pages (proxy.ts PROTECTED) — not advertised", () => {
  for (const route of ["/ai/draft", "/ai/legal-opinion"]) {
    assert.ok(!urls.includes(route), route);
  }
});

test("17 Nov 2026 (N05-V2 / N05-M6): the newly sign-in-only pages are not advertised; the public listing is", () => {
  for (const route of ["/ai/templates", "/marketplace/post", "/marketplace/collaborate", "/marketplace/order", "/marketplace/workspace"]) {
    assert.ok(!urls.some((u) => u === route || u.startsWith(`${route}/`)), route);
  }
  assert.ok(urls.includes("/marketplace"), "the public listing stays listed");
});

test("final review 2026-11-08 (8): no lawyer-only tool page is advertised — it sends a guest to /login", () => {
  const listed = urls.filter((u) => Object.keys(LAWYER_ONLY_AI_PAGES).some((p) => u === p || u.startsWith(`${p}/`)));
  assert.deepEqual(listed, []);
});

test("8 Nov 2026: the three older login-only pages are not advertised — a guest lands on /login", () => {
  for (const route of ["/ai/secretary", "/ai/fee-calculator", "/ai/direction-support"]) {
    assert.ok(!urls.includes(route), route);
  }
});
