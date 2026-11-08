import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  hourlyCapMessageAr,
  hourlyCapMinutesLeft,
  libraryLockDialogTextAr,
  lockHoursLeftAr,
  readerRefusalFrom,
  deviceRefusalOf,
} from "./readerRefusal.ts";

const NOW = Date.parse("2026-11-07T10:00:00.000Z");
const at = (ms: number) => new Date(NOW + ms).toISOString();
const H = 3_600_000;
const M = 60_000;

test("lock hours are rounded up, with Arabic agreement", () => {
  assert.equal(lockHoursLeftAr(at(24 * H), NOW), "24 ساعة");
  assert.equal(lockHoursLeftAr(at(23 * H + 1), NOW), "24 ساعة");
  assert.equal(lockHoursLeftAr(at(4 * H + 10 * M), NOW), "5 ساعات");
  assert.equal(lockHoursLeftAr(at(10 * H), NOW), "10 ساعات");
  assert.equal(lockHoursLeftAr(at(11 * H), NOW), "11 ساعة");
  assert.equal(lockHoursLeftAr(at(1 * H + 1), NOW), "ساعتين");
  assert.equal(lockHoursLeftAr(at(1 * H), NOW), "ساعة واحدة");
});

test("under an hour, or already past, is «أقل من ساعة»; no end or a bad date is null", () => {
  assert.equal(lockHoursLeftAr(at(59 * M), NOW), "أقل من ساعة");
  assert.equal(lockHoursLeftAr(at(-5 * M), NOW), "أقل من ساعة");
  assert.equal(lockHoursLeftAr(null, NOW), null);
  assert.equal(lockHoursLeftAr("nonsense", NOW), null);
});

test("the owner's sentence, verbatim, with X filled in", () => {
  assert.equal(
    libraryLockDialogTextAr(at(24 * H), NOW),
    "تم تعليق التصفح مؤقتاً لتجاوز معدل القراءة السريع — ينتهي التعليق تلقائياً خلال 24 ساعة، أو يمكنك التواصل الفوري مع الدعم الفني للمراجعة الفورية",
  );
  assert.match(libraryLockDialogTextAr(at(30 * M), NOW), /خلال أقل من ساعة،/);
});

test("a lock with no end promises no automatic end", () => {
  const t = libraryLockDialogTextAr(null, NOW);
  assert.ok(!t.includes("ينتهي التعليق تلقائياً"));
  assert.ok(t.startsWith("تم تعليق التصفح مؤقتاً لتجاوز معدل القراءة السريع"));
  assert.ok(t.includes("التواصل الفوري مع الدعم الفني"));
});

test("hourly cap minutes: rounded up, 1–60, else unknown", () => {
  assert.equal(hourlyCapMinutesLeft(at(12 * M + 1), NOW), 13);
  assert.equal(hourlyCapMinutesLeft(at(10), NOW), 1);
  assert.equal(hourlyCapMinutesLeft(at(-M), NOW), 1);
  assert.equal(hourlyCapMinutesLeft(at(60 * M), NOW), 60);
  assert.equal(hourlyCapMinutesLeft(at(61 * M), NOW), null, "more than an hour is not the hourly reset");
  assert.equal(hourlyCapMinutesLeft(null, NOW), null);
  assert.equal(hourlyCapMinutesLeft("x", NOW), null);
});

test("hourly cap message: the owner's wording with Y, or the generic one", () => {
  assert.equal(hourlyCapMessageAr(13), "بلغت حد القراءة في هذه الساعة — يمكنك المتابعة بعد 13 دقيقة");
  assert.equal(hourlyCapMessageAr(5), "بلغت حد القراءة في هذه الساعة — يمكنك المتابعة بعد 5 دقائق");
  assert.equal(hourlyCapMessageAr(2), "بلغت حد القراءة في هذه الساعة — يمكنك المتابعة بعد دقيقتين");
  assert.equal(hourlyCapMessageAr(1), "بلغت حد القراءة في هذه الساعة — يمكنك المتابعة بعد دقيقة واحدة");
  assert.equal(hourlyCapMessageAr(null), "بلغت حد القراءة في هذه الساعة — يمكنك المتابعة بعد قليل");
});

test("423 → the lock, from the body the proxy sends", () => {
  const r = readerRefusalFrom(
    423,
    { error: "msg", code: "library_security_lock", reference: "SEC-1", support: "/contact", lockedUntil: at(3 * H) },
    NOW,
  );
  assert.deepEqual(r, { kind: "lock", lock: { reference: "SEC-1", lockedUntil: at(3 * H), message: "msg", support: "/contact" } });
});

test("423 with an unreadable body still shows the lock (no end, /contact)", () => {
  const r = readerRefusalFrom(423, null, NOW);
  assert.equal(r?.kind, "lock");
  if (r?.kind !== "lock") return;
  assert.equal(r.lock.lockedUntil, null);
  assert.equal(r.lock.reference, null);
  assert.equal(r.lock.support, "/contact");
  assert.ok(r.lock.message.length > 0);
  // an off-site support link is never followed
  const off = readerRefusalFrom(423, { support: "https://evil.example" }, NOW);
  assert.equal(off?.kind === "lock" && off.lock.support, "/contact");
  // nor a protocol-relative one
  const protoRel = readerRefusalFrom(423, { support: "//evil.example/x" }, NOW);
  assert.equal(protoRel?.kind === "lock" && protoRel.lock.support, "/contact");
  const local = readerRefusalFrom(423, { support: "/support/tickets" }, NOW);
  assert.equal(local?.kind === "lock" && local.lock.support, "/support/tickets");
});

test("429 is classified by its code, not its status", () => {
  const hourly = readerRefusalFrom(429, { code: "library_hourly_limit", resetsAt: at(20 * M), error: "x" }, NOW);
  assert.deepEqual(hourly, { kind: "limit", scope: "hourly", messageAr: "بلغت حد القراءة في هذه الساعة — يمكنك المتابعة بعد 20 دقيقة" });

  const hourlyNoTime = readerRefusalFrom(429, { code: "library_hourly_limit" }, NOW);
  assert.equal(hourlyNoTime?.kind === "limit" && hourlyNoTime.messageAr, "بلغت حد القراءة في هذه الساعة — يمكنك المتابعة بعد قليل");

  const daily = readerRefusalFrom(429, { code: "library_daily_limit", error: "الحد اليومي" }, NOW);
  assert.deepEqual(daily, { kind: "limit", scope: "daily", messageAr: "الحد اليومي" });
  const dailyBare = readerRefusalFrom(429, { code: "library_daily_limit" }, NOW);
  assert.ok(dailyBare?.kind === "limit" && !dailyBare.messageAr.includes("هذه الساعة"));

  const rate = readerRefusalFrom(429, { error: "طلبات كثيرة — حاول بعد قليل." }, NOW);
  assert.deepEqual(rate, { kind: "limit", scope: "rate", messageAr: "طلبات كثيرة — حاول بعد قليل." });
  assert.equal(readerRefusalFrom(429, "not json", NOW)?.kind, "limit");
});

test("other statuses are not a refusal", () => {
  for (const s of [200, 400, 401, 403, 404, 500, 503]) assert.equal(readerRefusalFrom(s, { error: "x" }, NOW), null);
});

test("deviceRefusalOf: a later window's 403 device refusal, and nothing else", () => {
  const body = { code: "device_limit", error: "هذا الحساب مفعّل على جهازين بالفعل.", limit: 2, devices: [{ id: "d1", label: "كمبيوتر — Chrome / Windows", lastSeen: null }] };
  assert.deepEqual(deviceRefusalOf(403, body), {
    kind: "device", messageAr: "هذا الحساب مفعّل على جهازين بالفعل.", limit: 2,
    devices: [{ id: "d1", label: "كمبيوتر — Chrome / Windows", lastSeen: null }],
  });
  assert.equal(deviceRefusalOf(403, { code: "device_cookie_required", error: "x" })?.kind, "device");
  assert.equal(deviceRefusalOf(403, { error: "forbidden" }), null, "another 403");
  assert.equal(deviceRefusalOf(403, null), null);
  assert.equal(deviceRefusalOf(423, { code: "library_security_lock" }), null, "a lock is not a device refusal");
  assert.equal(deviceRefusalOf(500, body), null);
});

test("final review 2026-11-08 (9): the readers' later fetches and the feqh preview hand a device refusal to the device page", () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), "src", rel), "utf8").replace(/\r\n/g, "\n");
  const book = read("app/book/[slug]/page.tsx");
  assert.equal(book.match(/const device = deviceRefusalOf\(res\.status, body\);\n\s*if \(device\) setDeviceRefusal\(device\);/g)?.length, 2, "book: the window and the section jump");
  const precedents = read("app/precedents/[slug]/page.tsx");
  assert.equal(precedents.match(/const device = deviceRefusalOf\(res\.status, body\);\n\s*if \(device\) \{ setDeviceRefusal\(device\); return/g)?.length, 3, "precedents: more, before, target window");
  const feqh = read("app/laws/feqh-preview/page.tsx");
  assert.match(feqh, /const device = deviceRefusalOf\(bookRes\.status, await bookRes\.json\(\)\.catch\(\(\) => null\)\);/);
  assert.match(feqh, /if \(deviceRefusal\) return <LibraryDeviceLimitPage refusal=\{deviceRefusal\} \/>;/);
});
