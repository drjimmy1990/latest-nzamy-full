/**
 * O4 (batch l11-sec): modules that hold the service-role client or read
 * secrets must never reach the browser.
 *   1. The `server-only` package is a dependency, and every module in
 *      SERVER_ONLY imports it first: a client component importing one of them
 *      then fails the build instead of shipping the module.
 *   2. `server-only` throws outside the react-server build, so a module that
 *      `node --test` loads, or that src/proxy.ts loads, cannot import it. Those
 *      are held here by a source contract instead: no "use client" module
 *      reaches them (value imports, "@/…" resolved, followed transitively).
 *   3. And the SERVER_ONLY modules themselves are reached by no unit test, no
 *      proxy.ts and no client module (else a test or the proxy would throw).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const SRC = join(ROOT, "src");

/** Import `server-only` (service-role client, secrets, staff-only readers). */
const SERVER_ONLY = [
  "src/lib/supabase/server.ts",
  "src/lib/auth/verifiedProviderServer.ts",
  "src/lib/auth/platformStaffServer.ts",
  "src/lib/auth/staffMfaServer.ts",
  "src/lib/branding/brandingServer.ts",
  "src/lib/lawyerSignup/adminViewServer.ts",
  "src/lib/library/accountAccessServer.ts",
  "src/lib/library/deviceLimitServer.ts",
  "src/lib/library/monitorAdminServer.ts",
  "src/lib/library/pointsGateServer.ts",
  "src/lib/membership/founderVerificationServer.ts",
  "src/lib/offers/offersServer.ts",
  "src/lib/publicSeo/platformRegistryServer.ts",
  "src/lib/testBatches/freshTotpServer.ts",
  "src/lib/tracking/trackingSnapshot.server.ts",
];

/** Secret readers `node --test` or the proxy loads: held by contract (no client reaches them). */
const CONTRACT_ONLY = [
  "src/lib/email/sendEmail.ts",
  "src/lib/email/emailConfig.ts",
  "src/lib/pricing/clientPricingServer.ts",
  "src/lib/tracking/trackingUnlockCookie.ts",
  "src/lib/accountDeletion/accountDeletionServer.ts",
  "src/lib/accountSuspension/suspensionServer.ts",
  "src/lib/payments/couponServer.ts",
  "src/lib/library/readQuotaServer.ts",
  "src/lib/library/publicGuardServer.ts",
  "src/lib/library/activityMeterServer.ts",
];

function allFiles(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) allFiles(p, out);
    else if (/\.(ts|tsx|js|mjs)$/.test(n)) out.push(p);
  }
  return out;
}
const FILES = allFiles(SRC);
const TEXT = new Map(FILES.map((f) => [f, readFileSync(f, "utf8")]));

function resolveSpec(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
  else return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

const DEPS = new Map<string, string[]>();
for (const [f, text] of TEXT) {
  const out: string[] = [];
  const re = /(?:^|\n)\s*(?:import|export)\s+(type\s+)?([^;]*?)\s+from\s+["']([^"']+)["']|(?:^|\n)\s*import\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
  for (const m of text.matchAll(re)) {
    if (m[1]) continue; // import type … from
    const clause = (m[2] ?? "").trim();
    if (/^\{[^}]*\}$/.test(clause) && clause.replace(/[{}\s]/g, "").split(",").every((x) => x === "" || x.startsWith("type"))) continue;
    const r = resolveSpec(f, m[3] ?? m[4] ?? m[5]);
    if (r) out.push(r);
  }
  DEPS.set(f, out);
}

function reach(starts: string[]): Set<string> {
  const seen = new Set<string>();
  const stack = [...starts];
  while (stack.length) {
    const f = stack.pop() as string;
    if (seen.has(f)) continue;
    seen.add(f);
    for (const d of DEPS.get(f) ?? []) stack.push(d);
  }
  return seen;
}

const abs = (rel: string) => join(ROOT, rel);
const rel = (p: string) => relative(ROOT, p).replace(/\\/g, "/");
/** A "use client" directive at the top, after any leading line or block comments. */
function isClientModule(text: string): boolean {
  let s = text.replace(/^﻿/, "");
  for (;;) {
    const t = s.replace(/^\s+/, "");
    if (t.startsWith("//")) s = t.slice(t.indexOf("\n") === -1 ? t.length : t.indexOf("\n") + 1);
    else if (t.startsWith("/*")) s = t.slice(t.indexOf("*/") === -1 ? t.length : t.indexOf("*/") + 2);
    else return /^["']use client["']/.test(t);
  }
}
const clientModules = FILES.filter((f) => isClientModule(TEXT.get(f) ?? ""));
const fromClient = reach(clientModules);

test("O4: server-only is a dependency", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { dependencies?: Record<string, string> };
  assert.ok(pkg.dependencies?.["server-only"], "package.json dependencies lack server-only");
});

test("O4: every SERVER_ONLY module imports server-only before anything else", () => {
  for (const r of SERVER_ONLY) {
    const text = readFileSync(abs(r), "utf8");
    const first = text.match(/(?:^|\n)import [^\n]*/);
    assert.ok(first, r);
    assert.equal(first[0].trim(), 'import "server-only";', `${r}: first import is ${first[0].trim()}`);
  }
});

test("O4: no unit test, no proxy.ts and no client module loads a SERVER_ONLY module (it would throw)", () => {
  const fromTests = reach(FILES.filter((f) => /\.test\.tsx?$/.test(f)));
  const fromProxy = reach([join(SRC, "proxy.ts")]);
  const bad: string[] = [];
  for (const r of SERVER_ONLY) {
    if (fromTests.has(abs(r))) bad.push(`${r} ← a unit test`);
    if (fromProxy.has(abs(r))) bad.push(`${r} ← src/proxy.ts`);
    if (fromClient.has(abs(r))) bad.push(`${r} ← a "use client" module`);
  }
  assert.deepEqual(bad, []);
});

test("O4: the node-loaded secret modules are reached by no \"use client\" module", () => {
  const bad = CONTRACT_ONLY.filter((r) => fromClient.has(abs(r)));
  assert.deepEqual(bad, [], `client-reachable: ${bad.join(", ")} via ${clientModules.length} client modules`);
});

test("O4: the client walk is real (it finds the browser Supabase client)", () => {
  assert.ok(clientModules.length > 50, `only ${clientModules.length} "use client" modules found`);
  assert.ok(fromClient.has(join(SRC, "lib", "supabase", "client.ts")), rel(join(SRC, "lib", "supabase", "client.ts")));
});
