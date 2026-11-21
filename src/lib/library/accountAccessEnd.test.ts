/**
 * Q94a (batch l12, 20261202_50): a library exception ENDS — on a date, or
 * with the account's library subscription. The pure rule (the twin of
 * public.library_access_for), the admin body, and the wiring.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { overrideEndFromRow, overrideInForce, parseOverrideExpiry, parseOverrideInput, OVERRIDE_MAX_DAYS } from "./accountAccess.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const NOW = Date.parse("2026-11-21T12:00:00Z");
const DAY = 86_400_000;

test("Q94a: no end = permanent; a date ahead holds; a past date does not", () => {
  assert.equal(overrideInForce({ expiresAt: null, endsWithSubscription: false }, false, NOW), true);
  assert.equal(overrideInForce({ expiresAt: new Date(NOW + DAY).toISOString(), endsWithSubscription: false }, false, NOW), true);
  assert.equal(overrideInForce({ expiresAt: new Date(NOW - 1000).toISOString(), endsWithSubscription: false }, true, NOW), false);
});

test("Q94a: «ends with the subscription» holds only while a library grant covers now; a date is a purchase window", () => {
  assert.equal(overrideInForce({ expiresAt: null, endsWithSubscription: true }, false, NOW), false);
  assert.equal(overrideInForce({ expiresAt: null, endsWithSubscription: true }, true, NOW), true);
  assert.equal(overrideInForce({ expiresAt: new Date(NOW + DAY).toISOString(), endsWithSubscription: true }, false, NOW), true);
  assert.equal(overrideInForce({ expiresAt: new Date(NOW - DAY).toISOString(), endsWithSubscription: true }, true, NOW), true);
  assert.equal(overrideInForce({ expiresAt: new Date(NOW - DAY).toISOString(), endsWithSubscription: true }, false, NOW), false);
});

test("Q94a: a stored row's end — the columns missing (SQL not run) read as no end", () => {
  assert.deepEqual(overrideEndFromRow({ allowed: true }), { expiresAt: null, endsWithSubscription: false });
  assert.deepEqual(overrideEndFromRow({ allowed: true, expires_at: "2027-01-01T00:00:00Z", ends_with_subscription: true }),
    { expiresAt: "2027-01-01T00:00:00Z", endsWithSubscription: true });
  assert.deepEqual(overrideEndFromRow(null), { expiresAt: null, endsWithSubscription: false });
});

test("Q94a: the admin's date — a day is its end in Riyadh, future only, five years at most", () => {
  assert.deepEqual(parseOverrideExpiry(undefined, NOW), { ok: true, expiresAt: null });
  assert.deepEqual(parseOverrideExpiry("", NOW), { ok: true, expiresAt: null });
  const day = parseOverrideExpiry("2026-12-31", NOW);
  assert.ok(day.ok && day.expiresAt === "2026-12-31T20:59:59.000Z");
  assert.equal(parseOverrideExpiry("2026-11-20", NOW).ok, false);
  assert.equal(parseOverrideExpiry("31/12/2026", NOW).ok, false);
  assert.equal(parseOverrideExpiry(20261231, NOW).ok, false);
  assert.equal(parseOverrideExpiry(new Date(NOW + (OVERRIDE_MAX_DAYS + 2) * DAY).toISOString(), NOW).ok, false);
});

test("Q94a: the override body carries the end; an old body (no end) still parses as permanent", () => {
  const old = parseOverrideInput({ email: "a@b.sa", allowed: true, reason: "فريق العمل" }, NOW);
  assert.ok(old.ok && old.expiresAt === null && old.endsWithSubscription === false);
  const firm = parseOverrideInput({ email: "a@b.sa", allowed: true, reason: "اشتراك مكتب", expiresAt: "2026-12-01", endsWithSubscription: true }, NOW);
  assert.ok(firm.ok && firm.endsWithSubscription === true && firm.expiresAt === "2026-12-01T20:59:59.000Z");
  assert.equal(parseOverrideInput({ email: "a@b.sa", allowed: true, reason: "اشتراك", endsWithSubscription: "yes" }, NOW).ok, false);
  assert.equal(parseOverrideInput({ email: "a@b.sa", allowed: true, reason: "اشتراك", expiresAt: "2020-01-01" }, NOW).ok, false);
});

test("wiring: the app's twin ignores an ended exception, and the admin route saves and lists the end", () => {
  const server = read("./accountAccessServer.ts");
  assert.match(server, /from\("library_access_user_overrides"\)\.select\("\*"\)/);
  assert.match(server, /if \(!overrideInForce\(end, needsGrant \? await hasActiveLibraryGrant\(userId\) : false\)\) allowed = undefined;/);
  const route = read("../../app/api/v1/admin/library-access/route.ts");
  assert.match(route, /expires_at: input\.expiresAt, ends_with_subscription: input\.endsWithSubscription/);
  assert.match(route, /if \(input\.endsWithSubscription && !input\.expiresAt && !\(await hasActiveLibraryGrant\(userId\)\)\)/);
  assert.match(route, /status: 409/);
  assert.match(route, /if \(hasEnd\) return NextResponse\.json\(\{ error: END_MIGRATION_MISSING_AR \}, \{ status: 503 \}\);/);
  assert.match(route, /inForce: overrideInForce\(end, subscribed\.has\(String\(r\.user_id\)\)\)/);
  const page = read("../../app/dashboard/admin/library-access/page.tsx");
  assert.match(page, /ينتهي بانتهاء اشتراك المكتبة/);
  assert.match(page, /منتهٍ \(يسري مفتاح النوع\)/);
});

test("wiring: the SQL authority has the same rule (20261202_50)", () => {
  const sql = read("../../../supabase/migrations/20261202_50_l12_rules.sql");
  assert.match(sql, /create or replace function public\.library_access_for\(p_user uuid\)/);
  assert.match(sql, /\(v_expires is null and not coalesce\(v_with_sub, false\)\)\s*or \(v_expires is not null and v_expires > now\(\)\)\s*or \(coalesce\(v_with_sub, false\) and exists \(/);
});
