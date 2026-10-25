/**
 * Source pins for the client tracking link (N3.6): the public page is a
 * server page that is never cached, indexed or referred from; it reads only
 * through the whitelist; the service role stays behind one server module;
 * the lawyer routes never touch the token hash; the limiter covers /track.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = join(import.meta.dirname, "../..");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

test("the public page: server-rendered, dynamic, noindex, no Referer, the CTA, and 404 for a dead link", () => {
  const page = read("app/track/[token]/page.tsx");
  assert.doesNotMatch(page, /^"use client"/m, "never a client component — the service read must stay on the server");
  assert.match(page, /export const dynamic = "force-dynamic";/);
  assert.match(page, /robots: \{ index: false, follow: false/);
  assert.match(page, /referrer: "no-referrer"/);
  assert.match(page, /if \(read\.state === "none"\) notFound\(\);/);
  assert.match(page, /إنشاء حساب على منصة نظامي لحفظ القضية ومتابعتها/);
  assert.match(page, /readTrackingView\(token\)/);
  assert.doesNotMatch(page, /createServiceClient|\.rpc\(|\.from\(/, "the page itself queries nothing");
});

test("the page renders only the view's whitelisted fields", () => {
  const page = read("app/track/[token]/page.tsx");
  const used = new Set([...page.matchAll(/\bv\.(\w+)/g)].map((m) => m[1]));
  assert.deepEqual([...used].sort(), ["caseNumber", "court", "hearings", "stageLabel", "title"]);
  const hUsed = new Set([...page.matchAll(/\bh\.(\w+)/g)].map((m) => m[1]));
  assert.deepEqual([...hUsed].sort(), ["court", "date", "time"]);
});

test("the snapshot RPC is called from one server module, which hashes and serializes", () => {
  const callers: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) { if (name !== "node_modules") walk(full); continue; }
      if (!/\.(ts|tsx)$/.test(name) || /\.test\.ts$/.test(name)) continue;
      if (/rpc\(\s*["'`]case_tracking_snapshot/.test(readFileSync(full, "utf8"))) callers.push(relative(SRC, full).replace(/\\/g, "/"));
    }
  };
  walk(SRC);
  assert.deepEqual(callers, ["lib/tracking/trackingSnapshot.server.ts"]);
  const mod = read("lib/tracking/trackingSnapshot.server.ts");
  assert.match(mod, /if \(!isTrackingToken\(token\)\) return \{ state: "none" \};/, "the shape is checked before any database call");
  assert.match(mod, /p_token_hash: sha256Hex\(token\)/, "only the hash is sent");
  assert.match(mod, /toTrackingView\(data\)/, "the answer passes the whitelist");
});

test("the lawyer routes use the session (RLS), never read the hash, and the panel is on the case file", () => {
  for (const f of ["app/api/v1/cases/[id]/tracking-links/route.ts", "app/api/v1/cases/[id]/tracking-links/[linkId]/route.ts", "app/api/v1/cases/[id]/tracking-links/_shared.ts"]) {
    const src = read(f);
    assert.doesNotMatch(src, /createServiceClient/, f);
    assert.doesNotMatch(src, /select\([^)]*token_hash/, `${f} selects no hash`);
  }
  assert.match(read("app/api/v1/cases/[id]/tracking-links/route.ts"), /token_hash: sha256Hex\(token\)/);
  assert.match(read("app/dashboard/lawyer/cases/[id]/page.tsx"), /<CaseTrackingLinksPanel caseId=\{id\} isDark=\{isDark\} \/>/);
  assert.match(read("components/dashboard/caseTracking/CaseTrackingLinksPanel.tsx"), /لن يُعرض مرة أخرى/);
});

test("robots disallows /track/, the proxy rate-limits it, and the old /cases/[id] is still a 404", () => {
  assert.match(read("app/robots.ts"), /"\/track\/",/);
  const proxy = read("proxy.ts");
  assert.match(proxy, /const isTrackingMatch = isTrackingPageRoute\(method, pathname\);/);
  assert.match(proxy, /rateLimiter\.check\("tracking-page", key, TRACKING_PAGE_RATE_LIMIT\)/);
  assert.match(read("app/cases/[id]/page.tsx"), /notFound\(\);/);
});
