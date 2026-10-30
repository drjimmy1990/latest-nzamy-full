/**
 * readQuota.test.ts — owner note ١٣ C07 / C09, the pure half.
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/library/readQuota.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  LIBRARY_READ_QUOTA,
  TtlMemo,
  hasSupabaseAuthCookie,
  libraryQuotaTarget,
  normalizeDocSegment,
  parseQuotaRow,
  quotaRefusal,
  secondsUntil,
  type QuotaRow,
} from "./readQuota.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const API = path.resolve(HERE, "..", "..", "app", "api");

test("the owner's numbers (note ١٣): 220 for a person, 400 for an office / company member", () => {
  assert.equal(LIBRARY_READ_QUOTA.dailyDocs, 220);
  assert.equal(LIBRARY_READ_QUOTA.memberDailyDocs, 400);
  // The two numbers the note does not give stay generous: never below the daily cap's pace.
  assert.ok(LIBRARY_READ_QUOTA.hourlyDocs >= 60);
  assert.ok(LIBRARY_READ_QUOTA.lockAfterRefused >= 20);
});

test("libraryQuotaTarget: the four document reads are counted, by document, not by window", () => {
  assert.deepEqual(libraryQuotaTarget("GET", "/api/library/laws/labor-law"), { kind: "doc", docKey: "law:labor-law" });
  assert.deepEqual(libraryQuotaTarget("GET", "/api/library/books/b1"), { kind: "doc", docKey: "book:b1" });
  assert.deepEqual(libraryQuotaTarget("GET", "/api/library/precedents/col-9"), { kind: "doc", docKey: "precedent:col-9" });
  assert.deepEqual(libraryQuotaTarget("get", "/api/library/decrees/d-1"), { kind: "doc", docKey: "decree:d-1" });
});

test("libraryQuotaTarget: once- and twice-encoded Arabic slugs are the same document", () => {
  const once = "/api/library/laws/" + encodeURIComponent("نظام_العمل");
  const twice = "/api/library/laws/" + encodeURIComponent(encodeURIComponent("نظام_العمل"));
  const a = libraryQuotaTarget("GET", once);
  const b = libraryQuotaTarget("GET", twice);
  assert.deepEqual(a, { kind: "doc", docKey: "law:نظام_العمل" });
  assert.deepEqual(b, a);
});

test("libraryQuotaTarget: search, scoped search and library AI check the lock only", () => {
  for (const p of ["/api/library/search", "/api/library/scoped-search", "/api/ai/explain-article", "/api/ai/library-chat"]) {
    assert.deepEqual(libraryQuotaTarget("POST", p), { kind: "lock-only" }, p);
  }
});

test("libraryQuotaTarget: everything else is not counted (catalogue, facets, folders, writes, sub-paths)", () => {
  for (const [m, p] of [
    ["GET", "/api/library/init"],
    ["GET", "/api/library/autocomplete"],
    ["GET", "/api/library/facets"],
    ["GET", "/api/library/folders"],
    ["POST", "/api/library/laws/x"],
    ["GET", "/api/library/laws/x/y"],
    ["GET", "/api/library/laws/"],
    ["GET", "/api/library/search"],
    ["GET", "/api/v1/library/status"],
  ] as const) {
    assert.equal(libraryQuotaTarget(m, p), null, `${m} ${p}`);
  }
});

test("every document route that exists on disk is a quota target (a renamed route cannot slip out)", () => {
  for (const [dir, seg] of [["laws", "[slug]"], ["books", "[slug]"], ["precedents", "[slug]"], ["decrees", "[id]"]]) {
    const file = path.join(API, "library", dir, seg, "route.ts");
    assert.ok(fs.existsSync(file), `missing ${file}`);
    assert.match(fs.readFileSync(file, "utf8"), /export\s+async\s+function\s+GET\b/, file);
    assert.equal(libraryQuotaTarget("GET", `/api/library/${dir}/sample`)?.kind, "doc", dir);
  }
});

test("normalizeDocSegment: NFC, trimmed, capped, malformed escapes kept", () => {
  assert.equal(normalizeDocSegment("  a  "), "a");
  assert.equal(normalizeDocSegment(""), null);
  assert.equal(normalizeDocSegment("%E0%A4%A"), "%E0%A4%A");
  assert.equal(normalizeDocSegment("x".repeat(500))?.length, 200);
  const decomposed = "آ"; // ا + madda above
  assert.equal(normalizeDocSegment(decomposed), "آ"); // آ
});

test("hasSupabaseAuthCookie: the session cookie or a chunk of it; nothing else", () => {
  assert.equal(hasSupabaseAuthCookie(["sb-abc-auth-token"]), true);
  assert.equal(hasSupabaseAuthCookie(["x", "sb-auth-nezamy-auth-token.0"]), true);
  assert.equal(hasSupabaseAuthCookie(["sb-abc-auth-token-code-verifier"]), false);
  assert.equal(hasSupabaseAuthCookie(["theme", "nzamy_session"]), false);
  assert.equal(hasSupabaseAuthCookie([]), false);
});

const row = (over: Partial<Record<string, unknown>>) => [{
  status: "ok", used_today: 3, day_limit: 220, used_hour: 1, hour_limit: 120, refused_today: 0,
  lock_reference: null, locked_until: null, resets_at: "2026-10-30T21:00:00+00:00", ...over,
}];

test("parseQuotaRow: PostgREST's one-row array, or null for anything unknown (fail open)", () => {
  assert.equal(parseQuotaRow(row({}))?.usedToday, 3);
  assert.equal(parseQuotaRow(row({}))?.status, "ok");
  assert.equal(parseQuotaRow([]), null);
  assert.equal(parseQuotaRow(null), null);
  assert.equal(parseQuotaRow(row({ status: "maybe" })), null);
  assert.equal(parseQuotaRow({ message: "boom" }), null);
});

test("quotaRefusal: ok / exempt / no answer go on", () => {
  assert.equal(quotaRefusal(parseQuotaRow(row({})), 0), null);
  assert.equal(quotaRefusal(parseQuotaRow(row({ status: "exempt" })), 0), null);
  assert.equal(quotaRefusal(null, 0), null);
});

test("quotaRefusal: a lock is 423 with the reference, support page and an honest Arabic message", () => {
  const r = quotaRefusal(parseQuotaRow(row({ status: "locked", lock_reference: "SEC-0A1B2C3D4E" })) as QuotaRow, 0);
  assert.ok(r);
  assert.equal(r.status, 423);
  assert.equal(r.body.code, "library_security_lock");
  assert.equal(r.body.reference, "SEC-0A1B2C3D4E");
  assert.equal(r.body.support, "/contact");
  assert.match(r.body.error, /SEC-0A1B2C3D4E/);
  assert.match(r.body.error, /حسابك وبقية خدمات المنصة تعمل/); // not deleted, not frozen
  assert.match(r.body.error, /تواصل مع الدعم/);
  assert.equal(r.retryAfterSeconds, null);
});

test("quotaRefusal: the daily cap is 429 until Riyadh midnight; documents already read stay open", () => {
  const now = Date.parse("2026-10-30T20:00:00Z");
  const r = quotaRefusal(parseQuotaRow(row({ status: "over_daily", used_today: 220 })) as QuotaRow, now);
  assert.ok(r);
  assert.equal(r.status, 429);
  assert.equal(r.body.code, "library_daily_limit");
  assert.equal(r.retryAfterSeconds, 3600);
  assert.match(r.body.error, /220 وثيقة/);
  assert.match(r.body.error, /تبقى متاحة/);
  assert.match(r.body.error, /منتصف الليل بتوقيت الرياض/);
});

test("quotaRefusal: the hourly cap is 429 with its own message", () => {
  const r = quotaRefusal(parseQuotaRow(row({ status: "over_hourly", resets_at: null })) as QuotaRow, 0);
  assert.ok(r);
  assert.equal(r.status, 429);
  assert.equal(r.body.code, "library_hourly_limit");
  assert.equal(r.retryAfterSeconds, 3600);
});

test("secondsUntil: at least 1, 3600 when unknown", () => {
  assert.equal(secondsUntil("2026-01-01T00:00:10Z", Date.parse("2026-01-01T00:00:00Z")), 10);
  assert.equal(secondsUntil("2025-01-01T00:00:00Z", Date.parse("2026-01-01T00:00:00Z")), 1);
  assert.equal(secondsUntil("nonsense", 0), 3600);
});

test("TtlMemo: expires, and a hard cap drops the oldest", () => {
  let t = 0;
  const memo = new TtlMemo<number>(1000, 2, () => t);
  memo.set("a", 1);
  assert.equal(memo.get("a"), 1);
  t = 1000;
  assert.equal(memo.get("a"), undefined);
  memo.set("a", 1);
  memo.set("b", 2);
  memo.set("c", 3);
  assert.equal(memo.size, 2);
  assert.equal(memo.get("a"), undefined);
  assert.equal(memo.get("c"), 3);
  memo.set("d", 4, 10);
  t = 1011;
  assert.equal(memo.get("d"), undefined);
});
