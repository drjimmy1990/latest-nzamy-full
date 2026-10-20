/**
 * founderBadge.test.ts — the «المحامي المؤسس» read (owner ٢١٨ / ٢٢٥). Run with:
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/lawyers/founderBadge.test.ts
 *
 * Two halves: the pure tolerance helper (any error — 42703 before
 * 20261021_50 runs — or a throw is "no badge", logged once per process), and
 * source contracts on the two routes and the dashboard page: each reads the
 * column with its own explicit select("founder_badge"), never through "*".
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { founderBadgeFrom } from "./founderBadge.ts";

function captureWarnings(): { calls: unknown[][]; restore: () => void } {
  const calls: unknown[][] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => { calls.push(args); };
  return { calls, restore: () => { console.warn = original; } };
}

test("true only when the row says true", async () => {
  assert.equal(await founderBadgeFrom(Promise.resolve({ data: { founder_badge: true }, error: null }), "t"), true);
  assert.equal(await founderBadgeFrom(Promise.resolve({ data: { founder_badge: false }, error: null }), "t"), false);
  assert.equal(await founderBadgeFrom(Promise.resolve({ data: null, error: null }), "t"), false);
  assert.equal(await founderBadgeFrom(Promise.resolve({ data: { founder_badge: "true" }, error: null }), "t"), false);
});

test("42703, any other error and a throw are all 'no badge', logged once per process", async () => {
  const w = captureWarnings();
  try {
    const missing = { data: null, error: { code: "42703", message: "column lawyer_profiles.founder_badge does not exist" } };
    assert.equal(await founderBadgeFrom(Promise.resolve(missing), "a"), false);
    assert.equal(await founderBadgeFrom(Promise.resolve(missing), "b"), false);
    assert.equal(await founderBadgeFrom(Promise.resolve({ data: null, error: { message: "boom" } }), "c"), false);
    assert.equal(await founderBadgeFrom(Promise.reject(new Error("network")), "d"), false);
    assert.equal(w.calls.length, 1, "logged once");
  } finally {
    w.restore();
  }
});

const root = join(import.meta.dirname, "../..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

test("both routes read founder_badge with an explicit select through the tolerant helper", () => {
  for (const p of ["app/api/v1/lawyers/[id]/route.ts", "app/api/v1/profile/route.ts"]) {
    const src = read(p);
    assert.match(src, /founderBadgeFrom\(\s*\w+\s*\.from\("lawyer_profiles"\)\s*\.select\("founder_badge"\)/, p);
  }
  assert.ok(!/founder_badge/.test(read("app/api/v1/lawyers/[id]/route.ts").match(/const PUBLIC_COLUMNS =[^;]*;/)?.[0] ?? ""),
    "never in PUBLIC_COLUMNS (42703 would 404 every profile)");
});

test("the profile route sends founderBadge only when true, and the dashboard reads that field, not roleProfile", () => {
  assert.match(read("app/api/v1/profile/route.ts"), /\.\.\.\(founderBadge \? \{ founderBadge: true \} : \{\}\)/);
  const page = read("app/dashboard/lawyer/profile/page.tsx");
  assert.match(page, /founderBadge: res\.founderBadge === true/);
  assert.ok(!/r\?\.founder_badge/.test(page), "the page must not depend on select(\"*\")");
});
