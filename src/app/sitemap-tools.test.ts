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
  assert.ok(urls.length > 50, `only ${urls.length} static urls read from sitemap.ts`);
  assert.ok(urls.includes("/ai"), "the AI hub itself stays listed");
});

test("task 6 review M1: no gate-only or «قريباً» tool route is advertised to search engines", () => {
  const listed = urls.filter((u) => TERMINAL_TOOL_ROUTES.includes(u));
  assert.deepEqual(listed, []);
});

test("the tools with a working path stay listed", () => {
  for (const route of ["/ai/draft", "/ai/legal-opinion", "/ai/templates", "/ai/legal-translate"]) {
    assert.ok(urls.includes(route), route);
  }
});

test("final review 2026-11-08 (8): no lawyer-only tool page is advertised — it sends a guest to /login", () => {
  const listed = urls.filter((u) => Object.keys(LAWYER_ONLY_AI_PAGES).some((p) => u === p || u.startsWith(`${p}/`)));
  assert.deepEqual(listed, []);
});
