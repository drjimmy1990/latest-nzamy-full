/**
 * originBypass.test.ts — owner TODO S10 (17 Nov 2026): "origin bypass" and
 * "headers". A request that reaches the app directly (not through
 * Cloudflare) with a forged Host / X-Forwarded-Host / Origin / Referer must
 * not open an admin or cron route without the secret, and the security
 * headers must reach every path whatever host was asked for.
 *
 * Nothing in the code trusts those headers today, so this file is a
 * REGRESSION PIN, not a fix: it fails the day someone authorises on them.
 *   1. cronSecretMatches (every cron and the n8n callback) ignores forged
 *      headers — only the secret opens; an unset secret refuses everyone.
 *   2. Every cron handler checks the secret before it builds a service client.
 *   3. Every admin handler checks the caller's admin role from the session
 *      (user_type admin / requireAdmin / requireStaff / assertRole), and the
 *      edge treats /api/v1/admin/* as a protected API subtree by PATH.
 *   4. No authorisation surface reads Host, X-Forwarded-Host, Origin or
 *      Referer (comment-stripped source scan).
 *   5. next.config.ts: the security headers apply to "/:path*" with no host
 *      condition (`has` / `missing`), so admin, cron and API paths get them.
 *
 * Run: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/security/originBypass.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, sep } from "node:path";
import { cronSecretMatches } from "../payments/fulfillDecision.ts";
import { isProtectedApiPath } from "../auth/routeAccess.ts";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, "../..");
const ROOT = join(SRC, "..");

function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name)) out.push(p);
  }
  return out;
}

const rel = (p: string) => relative(SRC, p).split(sep).join("/");

// ── 1. the secret is the only key ───────────────────────────────────────────
test("forged Host / X-Forwarded-Host / Origin never stand in for the cron secret", () => {
  const secret = "s3cret-for-the-test-only-0123456789";
  const forged = ["nezamy.sa", "localhost", "127.0.0.1", "https://nezamy.sa", "admin.nezamy.sa", "x-forwarded-host: nezamy.sa"];
  for (const value of forged) {
    assert.equal(cronSecretMatches(value, secret), false, value);
  }
  assert.equal(cronSecretMatches(null, secret), false);
  assert.equal(cronSecretMatches(undefined, secret), false);
  assert.equal(cronSecretMatches("", secret), false);
  // an unset / empty secret refuses everyone, the right header included
  assert.equal(cronSecretMatches(secret, undefined), false);
  assert.equal(cronSecretMatches(secret, ""), false);
  assert.equal(cronSecretMatches("", ""), false);
  // only the exact secret opens
  assert.equal(cronSecretMatches(secret, secret), true);
  assert.equal(cronSecretMatches(secret + " ", secret), false);
});

// ── 2. cron handlers: the secret before anything privileged ─────────────────
test("every cron handler checks x-cron-secret before it builds a service client", () => {
  const cronDir = join(SRC, "app/api/v1/cron");
  const routes = walk(cronDir).filter((p) => p.endsWith("route.ts"));
  assert.ok(routes.length >= 7, `cron routes found: ${routes.length}`);
  for (const r of routes) {
    const code = codeOnly(readFileSync(r, "utf8"));
    for (const m of code.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\b/g)) {
      const start = m.index ?? 0;
      const next = code.indexOf("\nexport ", start + 1);
      const fn = code.slice(start, next === -1 ? code.length : next);
      const secretAt = fn.indexOf('cronSecretMatches(request.headers.get("x-cron-secret"), process.env.CRON_SECRET)');
      assert.ok(secretAt > 0, `${rel(r)} ${m[1]}: no x-cron-secret check`);
      const serviceAt = fn.indexOf("createServiceClient(");
      assert.ok(serviceAt === -1 || serviceAt > secretAt, `${rel(r)} ${m[1]}: service client before the secret`);
    }
  }
  const n8n = codeOnly(readFileSync(join(SRC, "app/api/v1/n8n/callback/route.ts"), "utf8"));
  assert.ok(n8n.includes('cronSecretMatches(request.headers.get("x-webhook-secret"), process.env.N8N_WEBHOOK_SECRET)'));
});

// ── 3. admin handlers: the role comes from the session ──────────────────────
test("every admin route checks the caller's admin role, and the edge guards the subtree by path", () => {
  const routes = walk(join(SRC, "app/api/v1/admin")).filter((p) => p.endsWith("route.ts"));
  assert.ok(routes.length >= 20, `admin routes found: ${routes.length}`);
  const ADMIN_CHECK = /requireAdmin\(|requireStaff\(|assertRole\(\s*\[\s*"admin"|user_type\s*!==\s*"admin"|user_type\s*===\s*"admin"|isAdmin\b/;
  const missing = routes.filter((r) => !ADMIN_CHECK.test(codeOnly(readFileSync(r, "utf8")))).map(rel);
  assert.deepEqual(missing, []);
  for (const p of ["/api/v1/admin", "/api/v1/admin/users", "/api/v1/admin/settings/x"]) {
    assert.equal(isProtectedApiPath(p), true, p);
  }
});

// ── 4. no authorisation surface reads a forgeable origin header ─────────────
test("proxy, auth helpers, admin, cron and n8n routes never read Host / X-Forwarded-Host / Origin / Referer", () => {
  const files = [
    join(SRC, "proxy.ts"),
    ...walk(join(SRC, "lib/auth")),
    ...walk(join(SRC, "app/api/v1/admin")),
    ...walk(join(SRC, "app/api/v1/cron")),
    ...walk(join(SRC, "app/api/v1/n8n")),
    ...walk(join(SRC, "app/auth")),
  ];
  const FORGEABLE = /headers\.get\(\s*["'`](host|x-forwarded-host|x-forwarded-proto|origin|referer|x-original-host)["'`]\s*\)|nextUrl\.(host|hostname|origin)\b/i;
  const offenders = files.filter((f) => FORGEABLE.test(codeOnly(readFileSync(f, "utf8")))).map(rel);
  assert.deepEqual(offenders, []);
});

// ── 5. the security headers reach every path, whatever the host ─────────────
test("security headers apply to every path with no host condition", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://auth.nezamy.sa";
  const { default: nextConfig } = await import("../../../next.config.ts");
  type Rule = { source: string; has?: unknown; missing?: unknown; headers: { key: string; value: string }[] };
  const rules = (await nextConfig.headers!()) as Rule[];
  const global = rules[0];
  assert.equal(global.source, "/:path*");
  assert.equal(global.has, undefined, "no `has` (host) condition on the global rule");
  assert.equal(global.missing, undefined, "no `missing` condition on the global rule");
  const keys = new Set(global.headers.map((h) => h.key));
  for (const k of ["Strict-Transport-Security", "X-Frame-Options", "X-Content-Type-Options", "Referrer-Policy", "Content-Security-Policy-Report-Only"]) {
    assert.ok(keys.has(k), k);
  }
  // no later rule turns a security header off (an empty value) for some path
  for (const r of rules.slice(1)) {
    for (const h of r.headers) {
      if (keys.has(h.key)) assert.notEqual(h.value.trim(), "", `${r.source} blanks ${h.key}`);
    }
  }
  // the proxy never strips them on its way out
  const proxy = codeOnly(readFileSync(join(SRC, "proxy.ts"), "utf8"));
  assert.doesNotMatch(proxy, /headers\.delete\(\s*["'](x-frame-options|strict-transport-security|x-content-type-options|referrer-policy|content-security-policy)/i);
  assert.ok(readFileSync(join(ROOT, "next.config.ts"), "utf8").includes("poweredByHeader: false"));
});
