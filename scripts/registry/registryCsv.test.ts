// Unit tests for scripts/registry/registryCsv.mjs (launch batch R2/R3).
// SYNTHETIC rows only — never a real name, licence or mobile.
// Run: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test scripts/registry/registryCsv.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildImport,
  COLUMNS,
  hijriToGregorian,
  licenceKeyForReport,
  parseCsv,
  parseGregorian,
  toPsqlScript,
} from "./registryCsv.mjs";

const HEADER = [
  "#",
  COLUMNS.name,
  COLUMNS.mobile,
  COLUMNS.city,
  COLUMNS.licence,
  COLUMNS.status,
  COLUMNS.expiryHijri,
  COLUMNS.expiryGregorian,
  COLUMNS.note,
  COLUMNS.updated,
];

function csv(rows: string[][]): string {
  const q = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return `﻿${[HEADER, ...rows].map((r) => r.map(q).join(",")).join("\r\n")}\r\n`;
}

const row = (o: Partial<Record<keyof typeof COLUMNS, string>>): string[] => [
  "1",
  o.name ?? "اسم تجريبي أول",
  o.mobile ?? "0500000001",
  o.city ?? "مدينة",
  o.licence ?? "99001",
  o.status ?? "رخصة سارية",
  o.expiryHijri ?? "",
  o.expiryGregorian ?? "2030/01/15",
  o.note ?? "موثق",
  o.updated ?? "2026-11-16",
];

test("parseCsv: BOM, CRLF, quotes, doubled quotes, embedded comma and newline", () => {
  const rows = parseCsv('﻿a,b\r\n"x, y","he said ""hi""\nthen"\r\n');
  assert.deepEqual(rows, [["a", "b"], ["x, y", 'he said "hi"\nthen']]);
});

test("licenceKeyForReport mirrors the SQL normaliser's examples", () => {
  assert.equal(licenceKeyForReport(" ١٢ / ٣٤٥٦ "), "12/3456");
  assert.equal(licenceKeyForReport("12-3456"), "12/3456");
  assert.equal(licenceKeyForReport("12//3456/"), "12/3456");
  assert.equal(licenceKeyForReport("   "), null);
});

test("parseGregorian accepts YYYY/MM/DD only when the date exists", () => {
  assert.equal(parseGregorian("2030/01/15"), "2030-01-15");
  assert.equal(parseGregorian("2030-1-5"), "2030-01-05");
  assert.equal(parseGregorian("2030/02/30"), null);
  assert.equal(parseGregorian(""), null);
});

test("hijriToGregorian uses Umm al-Qura (DD-MM-YYYY)", () => {
  // 1 Ramadan 1447 = 18 Feb 2026 (Umm al-Qura); 1 Muharram 1448 = 16 Jun 2026.
  assert.equal(hijriToGregorian("01-09-1447"), "2026-02-18");
  assert.equal(hijriToGregorian("1-1-1448"), "2026-06-16");
  assert.equal(hijriToGregorian("garbage"), null);
  // Day 30 of a 29-day month → the day after the 29th.
  const d29 = hijriToGregorian("29-09-1447");
  const d30 = hijriToGregorian("30-09-1447");
  assert.ok(d29 && d30);
  assert.ok(Date.parse(d30!) - Date.parse(d29!) === 86_400_000);
});

test("buildImport: skips empty licence/name and EVERY row of a repeated licence", () => {
  const { records, stats } = buildImport(
    parseCsv(
      csv([
        row({ licence: "99001" }),
        row({ licence: "99002", name: "اسم تجريبي ثان" }),
        row({ licence: "٩٩٠٠٢", name: "اسم تجريبي ثالث" }), // same key as 99002
        row({ licence: "" }),
        row({ licence: "99003", name: "" }),
      ]),
    ),
    "2026-11-17",
  );
  assert.equal(stats.rows, 5);
  assert.equal(stats.noLicence, 1);
  assert.equal(stats.noName, 1);
  assert.equal(stats.duplicateLicences, 1);
  assert.equal(stats.duplicateRows, 2);
  assert.deepEqual(records.map((r) => r.licence_raw), ["99001"]);
});

test("buildImport: expiry from Gregorian, else Hijri, else unknown; archived and expired counted", () => {
  const { records, stats } = buildImport(
    parseCsv(
      csv([
        row({ licence: "1", expiryGregorian: "2030/01/15", expiryHijri: "" }),
        row({ licence: "2", expiryGregorian: "", expiryHijri: "01-09-1447" }),
        row({ licence: "3", expiryGregorian: "", expiryHijri: "" }),
        row({ licence: "4", expiryGregorian: "2020/01/01", note: "محفوظ من القاعدة السابقة (غير ظاهر)" }),
      ]),
    ),
    "2026-11-17",
  );
  assert.deepEqual(records.map((r) => r.expiry_date), ["2030-01-15", "2026-02-18", null, "2020-01-01"]);
  assert.equal(stats.expiryFromGregorian, 2);
  assert.equal(stats.expiryFromHijri, 1);
  assert.equal(stats.expiryUnknown, 1);
  assert.equal(stats.archived, 1);
  assert.equal(stats.expiredToday, 2); // 2026-02-18 and 2020-01-01
  assert.equal(records[1].expiry_hijri, "01-09-1447");
});

test("buildImport refuses a file without the expected columns", () => {
  assert.throws(() => buildImport([["a", "b"], ["1", "2"]], "2026-11-17"), /missing CSV columns/);
});

test("toPsqlScript: one transaction, COPY with quoted text and empty NULLs, upsert by licence_no, no DELETE of registry rows", () => {
  const { records } = buildImport(parseCsv(csv([row({ name: 'اسم "مقتبس", تجريبي', mobile: "" })])), "2026-11-17");
  const sql = toPsqlScript(records);
  assert.match(sql, /^\\set ON_ERROR_STOP on\nbegin;/);
  assert.match(sql, /\ncommit;\n$/);
  assert.match(sql, /copy _registry_import \(.*\) from stdin with \(format csv\);/);
  assert.match(sql, /\n"99001","اسم ""مقتبس"", تجريبي",,"مدينة",/);
  assert.match(sql, /on conflict \(licence_no\) do update/);
  assert.doesNotMatch(sql, /delete from public\.lawyer_registry/i);
  assert.doesNotMatch(sql, /truncate/i);
});
