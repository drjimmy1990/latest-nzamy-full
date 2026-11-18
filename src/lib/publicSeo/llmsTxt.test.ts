/**
 * Owner 18 Nov, item 4.5: /llms.txt — plain UTF-8 text, public pages only,
 * and it says plainly what is for subscribers.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/publicSeo/llmsTxt.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildLlmsTxt } from "./llmsTxt.ts";
import { isPrivatePath } from "./privatePages.ts";
import { SERVICE_PAGES } from "./servicePages.ts";

const txt = buildLlmsTxt();
const links = [...txt.matchAll(/\]\((https:\/\/nezamy\.sa[^)]*)\)/g)].map((m) => m[1]);

test("llms.txt layout: one H1, a summary line, H2 sections, markdown links", () => {
  assert.match(txt, /^# نظامي \(Nezamy\)\n\n> /);
  assert.equal((txt.match(/^# /gm) ?? []).length, 1);
  assert.ok((txt.match(/^## /gm) ?? []).length >= 4);
  assert.ok(links.length >= 20, `${links.length} links`);
});

test("only public pages, every one on nezamy.sa", () => {
  for (const url of links) assert.ok(!isPrivatePath(url), url);
  assert.ok(!links.some((u) => /\/(login|register|dashboard|ai\/draft|ai\/legal-opinion)/.test(u)));
  for (const p of ["/about", "/pricing", "/founder", "/faq", "/blog", "/laws", "/precedents"]) {
    assert.ok(links.includes(`https://nezamy.sa${p}`), p);
  }
});

test("every public service page is listed; the vault is not", () => {
  for (const [path, s] of Object.entries(SERVICE_PAGES)) {
    assert.equal(links.includes(`https://nezamy.sa${path}`), !s.noIndex, path);
  }
});

test("it says what is for subscribers and is not shown to visitors", () => {
  assert.match(txt, /## المحتوى المدفوع\n.*للمشتركين/);
  assert.match(txt, /LegalTech Provider/);
  assert.doesNotMatch(txt, /للمحاماة/);
});

test("the route serves it as text/plain UTF-8, statically", () => {
  const src = readFileSync(new URL("../../app/llms.txt/route.ts", import.meta.url), "utf8");
  assert.match(src, /"Content-Type": "text\/plain; charset=utf-8"/);
  assert.match(src, /export const dynamic = "force-static";/);
  assert.match(src, /new Response\(buildLlmsTxt\(\)/);
});
