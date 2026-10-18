/**
 * route.test.ts — GET /api/v1/admin/verifications: the licence image and the
 * practice kind (owner answer ٢١٩, ruling P12). Run with:
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/app/api/v1/admin/verifications/route.test.ts
 *
 * A source-contract test (the technique
 * src/app/api/v1/admin/entitlements/grant/route.test.ts uses): the route
 * imports `next/server` and a Supabase session, so `node --test` cannot
 * execute it.
 *
 * What it pins:
 *   - each lawyer row carries `licenceImageUrl` — a 10-minute signed link made
 *     with the service client, or null — and `practiceKind`;
 *   - a signing failure gives null, never a 500;
 *   - the new columns are read off the existing `select("*")`, not named in
 *     it: before 20261019_20 runs, naming them would fail the whole queue
 *     with 42703 (deploy-order rule), while `*` simply omits them;
 *   - the admin gate still runs before any of it.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(import.meta.dirname, "route.ts"), "utf8");

test("the licence image is signed for 10 minutes with the service client", () => {
  assert.match(src, /adminClient\.storage\s*\.from\("documents"\)\s*\.createSignedUrl\(\s*path,\s*600\s*\)/);
});

test("a signing failure is null, never a 500", () => {
  const at = src.indexOf("async function signLicenceImage(");
  assert.ok(at > -1, "the signing helper moved");
  const fn = src.slice(at, src.indexOf("\n}\n", at));
  assert.match(fn, /try\s*\{/, "a throw is caught");
  assert.match(fn, /return null;/);
  assert.ok(!/status:\s*500/.test(fn));
});

test("each lawyer row returns licenceImageUrl and practiceKind", () => {
  const lawyers = src.slice(src.indexOf("// Lawyer profiles"), src.indexOf("// Provider profiles"));
  assert.match(lawyers, /licenceImageUrl:/);
  assert.match(lawyers, /practiceKind:\s*toPracticeKind\(lp\.practice_kind\)/);
  assert.match(src, /import \{ toPracticeKind \} from "@\/lib\/auth\/practiceKind"/);
});

test("firm and provider rows carry licenceImageUrl: null, so every row has one shape", () => {
  const providers = src.slice(src.indexOf("// Provider profiles"), src.indexOf("// Firm profiles"));
  const firms = src.slice(src.indexOf("// Firm profiles"), src.indexOf("// ── Apply search filter"));
  assert.match(providers, /licenceImageUrl:\s*null/);
  assert.match(firms, /licenceImageUrl:\s*null/);
});

test("the new columns are not named in the lawyer select (deploy-order rule)", () => {
  const q = src.slice(src.indexOf("let lawyerQuery"), src.indexOf("const { data: lawyerData"));
  assert.match(q, /\.select\("\*, profiles!inner\(/);
  assert.ok(!/licence_image_path|practice_kind/.test(q), "naming them 500s the queue before 20261019_20 runs");
});

test("the admin gate still runs before the queue is read", () => {
  const gate = src.indexOf('profile.user_type !== "admin"');
  assert.ok(gate > -1);
  assert.ok(gate < src.indexOf("createServiceClient()"));
  assert.ok(gate < src.indexOf("createSignedUrl("));
});
