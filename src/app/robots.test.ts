/**
 * robots.txt — owner note ١٤ §٢ item ١٠ (the build's static files open, the
 * API and the other /_next/ paths closed, the library sitemaps listed, the
 * noindex judgment page left crawlable for search) and batch l9 (owner
 * register 57 / 58 / 60): his legal notice and TDM reservation, and three
 * crawler tiers — search open, training crawlers kept off library full text,
 * bulk collectors off the whole site.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { buildRobotsTxt, BULK_AGENTS, SEARCH_AGENTS, TRAINING_AGENTS } from "../lib/publicSeo/robotsTxt.ts";

const txt = buildRobotsTxt();

interface Group { agents: string[]; allow: string[]; disallow: string[] }

/** The groups of the file, as a crawler reads them (comments skipped). */
function groups(text: string): Group[] {
  const out: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const [field, ...rest] = line.split(":");
    const value = rest.join(":").trim();
    const key = field.trim().toLowerCase();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], allow: [], disallow: [] };
        out.push(current);
      }
      current.agents.push(value);
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === "allow") current.allow.push(value);
    if (key === "disallow") current.disallow.push(value);
  }
  return out;
}

const all = groups(txt);
const groupOf = (agent: string) => {
  const g = all.find((x) => x.agents.some((a) => a.toLowerCase() === agent.toLowerCase()));
  return g ?? all.find((x) => x.agents.includes("*"))!;
};

/** Google's rule: the longest matching path wins; on a tie, allow. */
function allowed(agent: string, path: string): boolean {
  const g = groupOf(agent);
  const best = (paths: string[]) => Math.max(-1, ...paths.filter((p) => path.startsWith(p)).map((p) => p.length));
  return best(g.allow) >= best(g.disallow);
}

const EVERY_GROUP = ["Googlebot", "GPTBot", "*", "SomeNewBot"];

test("every group: /_next/static/ and /_next/image open, the rest of /_next/ and /api/ closed (a named group does not inherit *)", () => {
  for (const agent of ["Googlebot", "Bingbot", "GPTBot", "ClaudeBot", "SomeNewBot"]) {
    assert.ok(allowed(agent, "/_next/static/chunks/app/laws/page.js"), agent);
    assert.ok(allowed(agent, "/_next/static/css/app.css"), agent);
    assert.ok(allowed(agent, "/_next/image?url=%2Fog-image.png&w=640&q=75"), agent);
    assert.ok(!allowed(agent, "/_next/data/build/laws.json"), agent);
    assert.ok(!allowed(agent, "/api/library/laws/x"), agent);
    assert.ok(!allowed(agent, "/api/v1/library/status"), agent);
  }
});

test("the private disallows are kept in every group that may crawl", () => {
  for (const agent of EVERY_GROUP) {
    const g = groupOf(agent);
    for (const p of ["/dashboard/", "/api/", "/ai/settings", "/ai/vault", "/ai/share-history", "/track/", "/_next/"]) {
      assert.ok(g.disallow.includes(p), `${agent}: ${p}`);
    }
  }
});

test("tier 1 (search and answers) and everyone else: library pages crawlable — the judgment page too (its noindex must be readable)", () => {
  for (const agent of ["Googlebot", "Bingbot", "OAI-SearchBot", "PerplexityBot", "Amazonbot", "SomeNewBot"]) {
    for (const p of ["/laws/x", "/laws/orders/x", "/precedents/x", "/precedents/judgment/x", "/book/x", "/blog/x", "/"]) {
      assert.ok(allowed(agent, p), `${agent} ${p}`);
    }
  }
  for (const a of SEARCH_AGENTS) assert.equal(groupOf(a), groupOf("Googlebot"), a);
});

test("tier 2 (training crawlers): public pages yes, a ruling's full-text page and /library/ no", () => {
  for (const agent of TRAINING_AGENTS) {
    assert.ok(allowed(agent, "/laws/x"), agent);
    assert.ok(allowed(agent, "/blog/x"), agent);
    assert.ok(!allowed(agent, "/precedents/judgment/x"), agent);
    assert.ok(!allowed(agent, "/library/x"), agent);
    assert.ok(!allowed(agent, "/api/library/laws/x"), agent);
  }
});

test("tier 3 (bulk collection): the whole site is closed", () => {
  for (const agent of BULK_AGENTS) {
    for (const p of ["/", "/laws/x", "/blog/x", "/_next/static/x.js"]) assert.ok(!allowed(agent, p), `${agent} ${p}`);
  }
});

test("a noindex private page is NOT disallowed (its noindex must be read)", () => {
  for (const agent of EVERY_GROUP) {
    for (const p of ["/login", "/register", "/checkout", "/settings", "/onboarding"]) {
      assert.ok(allowed(agent, p), `${agent} ${p}`);
    }
  }
});

test("his legal notice and TDM reservation are published as comments; his drafting notes are not", () => {
  assert.match(txt, /^# إشعار قانوني$/m);
  assert.match(txt, /^# LEGAL NOTICE$/m);
  assert.match(txt, /يُمنع منعاً باتاً الهندسة العكسية لمنصة نظامي/);
  assert.match(txt, /TDM \/ AI-USE RESERVATION/);
  assert.match(txt, /construed narrowly/);
  assert.doesNotMatch(txt, /قرار المالك|على المبرمج|DRAFT|probation|legal@/i);
  // every non-rule line is a comment
  for (const line of txt.split("\n")) {
    if (!line.trim()) continue;
    assert.match(line, /^(#|User-agent: |Allow: |Disallow: |Host: |Sitemap: )/, line);
  }
});

test("robots lists the site map and the four library document maps", () => {
  const maps = txt.split("\n").filter((l) => l.startsWith("Sitemap: ")).map((l) => l.slice(9));
  assert.deepEqual(maps, [
    "https://nezamy.sa/sitemap.xml",
    "https://nezamy.sa/library-sitemaps/sitemap/laws.xml",
    "https://nezamy.sa/library-sitemaps/sitemap/orders.xml",
    "https://nezamy.sa/library-sitemaps/sitemap/collections.xml",
    "https://nezamy.sa/library-sitemaps/sitemap/books.xml",
  ]);
  assert.match(txt, /^Host: https:\/\/nezamy\.sa$/m);
});

test("served by a route handler as text/plain UTF-8 (app/robots.ts cannot print comments, and both would clash)", () => {
  const route = readFileSync(new URL("./robots.txt/route.ts", import.meta.url), "utf8");
  assert.match(route, /"Content-Type": "text\/plain; charset=utf-8"/);
  assert.match(route, /new Response\(buildRobotsTxt\(\)/);
  assert.equal(existsSync(new URL("./robots.ts", import.meta.url)), false);
});
