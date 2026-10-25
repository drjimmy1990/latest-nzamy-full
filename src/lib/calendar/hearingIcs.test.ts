import test from "node:test";
import assert from "node:assert/strict";
import { buildHearingIcs, escapeIcsText, foldIcsLine, formatIcsDuration, hearingIcsFilename } from "./hearingIcs.ts";

const NOW = new Date("2026-10-25T09:15:30.000Z");

const base = {
  uid: "hearing-1b2c",
  title: "جلسة نظر الدعوى التجارية رقم ٤٤٥ لدى الدائرة الثالثة في المحكمة التجارية بالرياض",
  date: "2026-11-10",
  time: "09:00",
  durationMinutes: 90,
  location: "المحكمة التجارية، الرياض; القاعة 3",
  description: "الموكل: شركة س\nالقضية: مطالبة مالية",
  now: NOW,
};

/** RFC 5545 §3.1 unfolding: CRLF followed by one space or tab is removed. */
const unfold = (ics: string) => ics.replace(/\r\n[ \t]/g, "");
const lines = (ics: string) => unfold(ics).split("\r\n");

test("CRLF everywhere, a trailing CRLF, no bare LF and no BOM", () => {
  const ics = buildHearingIcs(base)!;
  assert.ok(ics.endsWith("\r\n"));
  assert.equal(/(^|[^\r])\n/.test(ics), false, "no LF without CR");
  assert.notEqual(ics.charCodeAt(0), 0xfeff);
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n"));
});

test("every physical line is at most 75 octets and folding never splits a UTF-8 character", () => {
  const ics = buildHearingIcs(base)!;
  for (const line of ics.split("\r\n")) {
    assert.ok(Buffer.byteLength(line, "utf8") <= 75, `${Buffer.byteLength(line, "utf8")}: ${line}`);
    assert.equal(line.includes("�"), false);
  }
  assert.ok(lines(ics).includes(`SUMMARY:${base.title}`), "unfolding restores the Arabic title");
});

test("floating DTSTART/DTEND (no Z, no TZID), DTSTAMP in UTC, stable UID", () => {
  const l = lines(buildHearingIcs(base)!);
  assert.ok(l.includes("DTSTART:20261110T090000"));
  assert.ok(l.includes("DTEND:20261110T103000"), "duration_minutes (90) sets the end");
  assert.ok(l.includes("DTSTAMP:20261025T091530Z"));
  assert.ok(l.includes("UID:hearing-1b2c@nezamy.sa"));
  assert.equal(l.some((x) => x.startsWith("DTSTART;TZID") || /^DTSTART:.*Z$/.test(x)), false);
});

test("no duration falls back to one hour, the same block the Google link uses; the end may cross midnight", () => {
  const l = lines(buildHearingIcs({ ...base, time: "23:30", durationMinutes: null })!);
  assert.ok(l.includes("DTSTART:20261110T233000"));
  assert.ok(l.includes("DTEND:20261111T003000"));
});

test("four VALARMs with relative triggers for a 09:00 hearing", () => {
  const l = lines(buildHearingIcs(base)!);
  assert.deepEqual(l.filter((x) => x.startsWith("TRIGGER:")), ["TRIGGER:-P7D", "TRIGGER:-P3D", "TRIGGER:-PT13H", "TRIGGER:-PT2H"]);
  assert.equal(l.filter((x) => x === "BEGIN:VALARM").length, 4);
  assert.equal(l.filter((x) => x === "ACTION:DISPLAY").length, 4);
  assert.equal(l.filter((x) => x.startsWith("DESCRIPTION:موعد الجلسة")).length, 4);
});

test("a 06:30 hearing gets its morning alarm an hour before, not after it starts", () => {
  const l = lines(buildHearingIcs({ ...base, time: "06:30" })!);
  assert.deepEqual(l.filter((x) => x.startsWith("TRIGGER:")), ["TRIGGER:-P7D", "TRIGGER:-P3D", "TRIGGER:-PT10H30M", "TRIGGER:-PT1H"]);
});

test("a hearing with no hour is an all-day event; the morning alarm fires 7 hours after its midnight start", () => {
  const l = lines(buildHearingIcs({ ...base, time: null })!);
  assert.ok(l.includes("DTSTART;VALUE=DATE:20261110"));
  assert.ok(l.includes("DTEND;VALUE=DATE:20261111"));
  assert.deepEqual(l.filter((x) => x.startsWith("TRIGGER:")), ["TRIGGER:-P6DT15H", "TRIGGER:-P2DT15H", "TRIGGER:-PT4H", "TRIGGER:PT7H"]);
});

test("text values are escaped; a bad date builds nothing", () => {
  assert.equal(escapeIcsText("a\\b;c,d\ne\r\nf"), "a\\\\b\\;c\\,d\\ne\\nf");
  const l = lines(buildHearingIcs(base)!);
  // The Arabic comma «،» (U+060C) is not the TEXT separator; only ASCII , ; \ are escaped.
  assert.ok(l.includes("LOCATION:المحكمة التجارية، الرياض\\; القاعة 3"));
  assert.ok(l.some((x) => x.startsWith("DESCRIPTION:الموكل: شركة س\\nالقضية")));
  assert.equal(buildHearingIcs({ ...base, date: "2026-02-30" }), null);
});

test("helpers: duration format, folding, filename", () => {
  assert.equal(formatIcsDuration(7 * 1440), "-P7D");
  assert.equal(formatIcsDuration(1440 + 150), "-P1DT2H30M");
  assert.equal(formatIcsDuration(-420), "PT7H");
  assert.equal(formatIcsDuration(45), "-PT45M");
  assert.equal(foldIcsLine("abc"), "abc");
  const long = "X".repeat(200);
  assert.deepEqual(foldIcsLine(long).split("\r\n").map((p) => p.length), [75, 75, 52]);
  assert.equal(hearingIcsFilename("2026-11-10"), "hearing-2026-11-10.ics");
});
