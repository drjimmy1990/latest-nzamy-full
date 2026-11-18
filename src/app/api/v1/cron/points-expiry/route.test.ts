/**
 * route.test.ts — source contract for POST /api/v1/cron/points-expiry (owner
 * 18 Nov G9 / G16, batch l7). The route imports next/server and the service
 * client, so it cannot run under `node --test`; its wiring is pinned in the
 * source. The notice is executed in src/lib/points/pointsExpiryNotice.test.ts,
 * and points_expire_lots + the marker table in Docker
 * (supabase/tests/rls/points_wallets_l7.test.sql).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isGeneralRateLimitedApiPath } from "../../../../../lib/rateLimitRoutes.ts";

const src = readFileSync(join(import.meta.dirname, "route.ts"), "utf8");

test("the cron secret is checked (timing-safe helper) before any database work", () => {
  const post = src.slice(src.indexOf("export async function POST("));
  const checkAt = post.indexOf('cronSecretMatches(request.headers.get("x-cron-secret"), process.env.CRON_SECRET)');
  assert.ok(checkAt > -1);
  assert.ok(post.indexOf("status: 401") > checkAt);
  assert.ok(post.indexOf("createServiceClient(") > post.indexOf("status: 401"));
  assert.equal(isGeneralRateLimitedApiPath("POST", "/api/v1/cron/points-expiry"), false);
});

test("expiry first: points_expire_lots, bounded", () => {
  assert.match(src, /admin\.rpc\("points_expire_lots", \{ p_limit: EXPIRE_BATCH \}\)/);
  assert.match(src, /const EXPIRE_BATCH = 500;/);
  assert.ok(src.indexOf('"points_expire_lots"') < src.indexOf('.from("points_lots")'));
});

test("warnings: a bounded read of lots with points ending within 7 days; marker first, notice only for a new marker", () => {
  assert.match(src, /\.gt\("points_left", 0\)\s*\.gt\("expires_at", now\.toISOString\(\)\)\s*\.lte\("expires_at"/);
  assert.match(src, /\.limit\(WARNING_LIMIT\)/);
  const loop = src.slice(src.indexOf("for (const lot of due)"));
  const upsertAt = loop.indexOf('.from("points_lot_expiry_notices")');
  const ignoreAt = loop.indexOf('{ onConflict: "lot_id", ignoreDuplicates: true }');
  const skipAt = loop.indexOf("if (!inserted || inserted.length === 0)");
  const notifyAt = loop.indexOf("await recordNotification(");
  assert.ok(upsertAt > -1 && ignoreAt > upsertAt && skipAt > ignoreAt && notifyAt > skipAt);
  assert.equal(src.split("recordNotification(").length - 1, 1, "one notice call, inside the loop");
});

test("before the SQL runs: 200 schema_missing and nothing sent", () => {
  assert.match(src, /skipped: "schema_missing"/);
  for (const code of ["42P01", "PGRST205", "42883", "PGRST202"]) assert.ok(src.includes(`"${code}"`), code);
});
