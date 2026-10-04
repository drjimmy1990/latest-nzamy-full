import assert from "node:assert/strict";
import test from "node:test";

import {
  maskOfficialDates,
  buildLatest,
  buildRecentlyEffective,
  buildUpcoming,
  compareHijri,
  countdownPhraseAr,
  hijriToIsoDate,
  hijriYearTokens,
  likeYearClauses,
  lawHref,
  monitorDateLabelAr,
  orderHref,
  parseHijriDate,
  saudiHijriToday,
  signedDayDiff,
  sincePhraseAr,
  type MonitorLawRow,
  type MonitorOrderRow,
} from "./monitorFeed.ts";

// 2026-09-28 in Riyadh = 17 ربيع الآخر 1448 (Umm al-Qura).
const TODAY = new Date("2026-09-28T09:00:00Z");

// ─── Parsing: every shape the live tables hold (probed 2026-09-28) ──────────

test("parses the year-first shapes of library.laws", () => {
  assert.deepEqual(parseHijriDate("1448/08/12"), { year: 1448, month: 8, day: 12 });
  assert.deepEqual(parseHijriDate("1448-02-05"), { year: 1448, month: 2, day: 5 });
  assert.deepEqual(parseHijriDate("1447/08/03هـ"), { year: 1447, month: 8, day: 3 });
  assert.deepEqual(parseHijriDate("1447/08/03ه"), { year: 1447, month: 8, day: 3 });
  assert.deepEqual(parseHijriDate("1448/3/7 هـ"), { year: 1448, month: 3, day: 7 });
});

test("parses the Arabic-Indic and day-first shapes of library.decrees_circulars", () => {
  assert.deepEqual(parseHijriDate("١٤٤٨/٠١/٠٣"), { year: 1448, month: 1, day: 3 });
  assert.deepEqual(parseHijriDate("١٩ / ١٠ / ١٤٣٩"), { year: 1439, month: 10, day: 19 });
  assert.deepEqual(parseHijriDate("17/11/1436"), { year: 1436, month: 11, day: 17 });
  assert.deepEqual(parseHijriDate("3/7/1444"), { year: 1444, month: 7, day: 3 });
});

test("rejects junk instead of guessing a day", () => {
  assert.equal(parseHijriDate("1473-13-36"), null); // month 13, day 36 — a live row
  assert.equal(parseHijriDate("1448"), null); // bare year — a live row
  assert.equal(parseHijriDate("1448/03"), null); // month only — a live row
  assert.equal(parseHijriDate(""), null);
  assert.equal(parseHijriDate(null), null);
  assert.equal(parseHijriDate(undefined), null);
  assert.equal(parseHijriDate("2026-06-17"), null); // a Gregorian date in a Hijri column
  assert.equal(parseHijriDate("soon"), null);
});

test("compareHijri orders by year, then month, then day", () => {
  const a = { year: 1448, month: 2, day: 29 };
  const b = { year: 1448, month: 10, day: 1 };
  assert.ok(compareHijri(a, b) < 0);
  assert.ok(compareHijri(b, a) > 0);
  assert.equal(compareHijri(a, { ...a }), 0);
});

// ─── Calendar conversion ────────────────────────────────────────────────────

test("Umm al-Qura anchors", () => {
  assert.deepEqual(saudiHijriToday(TODAY), { year: 1448, month: 4, day: 17 });
  assert.equal(hijriToIsoDate({ year: 1448, month: 8, day: 12 }), "2027-01-20");
  assert.equal(hijriToIsoDate({ year: 1449, month: 1, day: 26 }), "2027-07-01");
  assert.equal(hijriToIsoDate({ year: 1448, month: 4, day: 17 }), "2026-09-28");
});

test("signedDayDiff is signed and rejects malformed input", () => {
  assert.equal(signedDayDiff("2026-09-28", "2026-10-01"), 3);
  assert.equal(signedDayDiff("2026-09-28", "2026-09-20"), -8);
  assert.equal(signedDayDiff("2026-09-28", "2026-09-28"), 0);
  assert.equal(signedDayDiff("bad", "2026-09-28"), null);
});

// ─── Prefilter clauses ──────────────────────────────────────────────────────

test("year tokens cover both digit systems", () => {
  assert.deepEqual(hijriYearTokens(1447, 1448), ["1447", "1448", "١٤٤٧", "١٤٤٨"]);
  assert.equal(
    likeYearClauses(["date"], ["1448", "١٤٤٨"]),
    "date.like.*1448*,date.like.*١٤٤٨*",
  );
  assert.equal(
    likeYearClauses(["a", "b"], ["1448"]),
    "a.like.*1448*,b.like.*1448*",
  );
});

// ─── Upcoming ───────────────────────────────────────────────────────────────

const LAWS: MonitorLawRow[] = [
  // The two live deferred laws that carry an effective date.
  { slug: "tourism-hospitality-facility-regulation-1448h", title: "لائحة مرفق الضيافة السياحي", type: "لائحة تنفيذية", status: "deferred_effective", effective_date_hijri: "1449/01/26", issue_date_hijri: "1448/03/17" },
  { slug: "law-general-education", title: "نظام التعليم العام", type: "نظام", status: "deferred_effective", effective_date_hijri: "1448/08/12", issue_date_hijri: "1448/01/27" },
  // A live deferred law the source gives no effective date for.
  { slug: "government-tenders-and-procurement-law-1448", title: "نظام المنافسات والمشتريات الحكومية", type: "نظام", status: "deferred_effective", effective_date_hijri: null, issue_date_hijri: "1448/02/27", publication_date_hijri: "1448/03/22" },
  // Effective today, three days ago, and outside the window.
  { slug: "today-law", title: "نظام نافذ اليوم", status: "active", effective_date_hijri: "1448/04/17", issue_date_hijri: "1448/01/01" },
  { slug: "three-days", title: "نظام نافذ منذ ثلاثة أيام", status: "active", effective_date_hijri: "1448/04/14" },
  { slug: "old", title: "نظام قديم", status: "active", effective_date_hijri: "1448/03/29" },
  // Repealed rows never count, whatever their date says.
  { slug: "repealed-future", title: "ملغى", status: "repealed", effective_date_hijri: "1448/09/01" },
  { slug: "repealed-recent", title: "ملغى حديثاً", status: "repealed", effective_date_hijri: "1448/04/15" },
  // Junk date on an active law: neither upcoming nor recent.
  { slug: "junk", title: "تاريخ تالف", status: "active", effective_date_hijri: "1473-13-36" },
];

test("upcoming: soonest first with days remaining, then undated deferred laws", () => {
  const up = buildUpcoming(LAWS, TODAY);
  assert.deepEqual(up.map((u) => u.slug), [
    "law-general-education",
    "tourism-hospitality-facility-regulation-1448h",
    "government-tenders-and-procurement-law-1448",
  ]);
  assert.equal(up[0].daysRemaining, 114); // 2026-09-28 → 2027-01-20
  assert.equal(up[0].gregorianDate, "2027-01-20");
  assert.equal(up[0].countdownLabel, "يبدأ نفاذه بعد ١١٤ يوماً");
  assert.equal(up[0].dateLabel, "١٢ شعبان ١٤٤٨ هـ الموافق ٢٠ يناير ٢٠٢٧ م");
  assert.equal(up[0].href, "/laws/law-general-education");
  assert.equal(up[0].statusLabel, "مؤجّل النفاذ");
  assert.equal(up[1].daysRemaining, 276); // → 2027-07-01
  assert.equal(up[2].daysRemaining, null);
  assert.equal(up[2].hijriDate, null);
  assert.equal(up[2].dateLabel, null);
  assert.equal(up[2].countdownLabel, "موعد النفاذ غير محدَّد في المصدر");
});

test("date label: Hijri first, Gregorian after «الموافق», Hijri alone when there is no such day", () => {
  assert.equal(monitorDateLabelAr({ year: 1448, month: 8, day: 12 }, "2027-01-20"), "١٢ شعبان ١٤٤٨ هـ الموافق ٢٠ يناير ٢٠٢٧ م");
  assert.equal(monitorDateLabelAr({ year: 1448, month: 2, day: 30 }, null), "٣٠ صفر ١٤٤٨ هـ");
  // No «·» anywhere: beside an Arabic-Indic digit it reads as a zero.
  assert.ok(!monitorDateLabelAr({ year: 1448, month: 8, day: 12 }, "2027-01-20").includes("·"));
});

test("upcoming carries no instrument, number, gazette or official link", () => {
  const keys = new Set(buildUpcoming(LAWS, TODAY).flatMap((u) => Object.keys(u)));
  for (const banned of ["issuing_instrument", "issuingInstrument", "gazette_issue_number", "gazetteIssueNumber", "official_source_url", "officialUrl", "ref"]) {
    assert.ok(!keys.has(banned), banned);
  }
});

// ─── Recently effective ─────────────────────────────────────────────────────

test("recently effective: today and the previous 14 days, most recent first", () => {
  const recent = buildRecentlyEffective(LAWS, TODAY);
  assert.deepEqual(recent.map((r) => r.slug), ["today-law", "three-days"]);
  assert.equal(recent[0].daysSinceEffective, 0);
  assert.equal(recent[0].countdownLabel, "نافذ اليوم");
  assert.equal(recent[1].daysSinceEffective, 3);
  assert.equal(recent[1].countdownLabel, "نافذ منذ ٣ أيام");
});

test("the window edge: 14 days ago is in, 15 is out", () => {
  const rows: MonitorLawRow[] = [
    { slug: "d14", title: "a", status: "active", effective_date_hijri: "1448/04/03" }, // 2026-09-14
    { slug: "d15", title: "b", status: "active", effective_date_hijri: "1448/04/02" }, // 2026-09-13
  ];
  assert.deepEqual(buildRecentlyEffective(rows, TODAY).map((r) => r.slug), ["d14"]);
});

// ─── Latest ─────────────────────────────────────────────────────────────────

const ORDERS: MonitorOrderRow[] = [
  { id: "f4331ed6-0000-0000-0000-000000000001", title: "تعديل المواد", instrument_ar: "قرار", date: "١٤٤٨/٠١/٠٣" },
  { id: "c65bb379-0000-0000-0000-000000000002", title: "تعميم حديث", instrument_ar: "تعميم", date: "15/04/1448" },
  { id: "old-order", title: "مرسوم قديم", instrument_ar: "مرسوم ملكي", date: "١٩ / ١٠ / ١٤٣٩" },
  { id: "future-order", title: "تاريخ لم يأتِ", instrument_ar: "تعميم", date: "1448/11/01" },
  { id: "no-date", title: "بلا تاريخ", instrument_ar: "تعميم", date: "" },
];

test("latest: laws and orders merged newest first, junk and future dates dropped", () => {
  const latest = buildLatest(LAWS, ORDERS, { year: 1448, month: 4, day: 17 });
  assert.deepEqual(latest.map((i) => `${i.kind}:${i.slug}`), [
    "order:c65bb379-0000-0000-0000-000000000002", // 1448/04/15
    "law:tourism-hospitality-facility-regulation-1448h", // 1448/03/17
    "law:government-tenders-and-procurement-law-1448", // 1448/02/27
    "law:law-general-education", // 1448/01/27
    "order:f4331ed6-0000-0000-0000-000000000001", // 1448/01/03
    "law:today-law", // 1448/01/01
    "order:old-order", // 1439/10/19
  ]);
  const order = latest[0];
  assert.equal(order.href, "/laws/orders/c65bb379-0000-0000-0000-000000000002");
  assert.equal(order.typeLabel, "تعميم");
  assert.equal(order.status, null);
  assert.equal(order.hijriDate, "1448/04/15");
  assert.equal(latest[1].dateKind, "issue");
});

test("latest falls back to the publication date when the issue date is unusable", () => {
  const rows: MonitorLawRow[] = [
    { slug: "pub-only", title: "منشور", status: "active", issue_date_hijri: "1448", publication_date_hijri: "1448/03/22" },
  ];
  const [item] = buildLatest(rows, [], { year: 1448, month: 4, day: 17 });
  assert.equal(item.dateKind, "publication");
  assert.equal(item.hijriDate, "1448/03/22");
});

test("latest respects the limit and keeps future dates when today is unknown", () => {
  assert.equal(buildLatest(LAWS, ORDERS, { year: 1448, month: 4, day: 17 }, 2).length, 2);
  const withoutToday = buildLatest([], ORDERS, null);
  assert.equal(withoutToday[0].slug, "future-order");
});

// ─── Labels and links ───────────────────────────────────────────────────────

test("phrases follow the Arabic counted-noun rule", () => {
  assert.equal(countdownPhraseAr(1), "يبدأ نفاذه بعد يوم واحد");
  assert.equal(countdownPhraseAr(2), "يبدأ نفاذه بعد يومين");
  assert.equal(countdownPhraseAr(0), "يبدأ نفاذه اليوم");
  assert.equal(sincePhraseAr(1), "نافذ منذ يوم واحد");
  assert.equal(sincePhraseAr(11), "نافذ منذ ١١ يوماً");
});

test("links encode the stored slug once", () => {
  assert.equal(lawHref("labor-law"), "/laws/labor-law");
  assert.equal(lawHref("نظام العمل"), "/laws/%D9%86%D8%B8%D8%A7%D9%85%20%D8%A7%D9%84%D8%B9%D9%85%D9%84");
  assert.equal(orderHref("8e0a338f-0b9f-55b8-a3c5-a6b94cc73ffd"), "/laws/orders/8e0a338f-0b9f-55b8-a3c5-a6b94cc73ffd");
});

test("maskOfficialDates: a non-subscriber loses issue/publication dates, keeps effective dates and the order", () => {
  const items = [
    { dateKind: "issue" as const, hijriDate: "1448/03/19", gregorianDate: "2026-09-11", dateLabel: "x" },
    { dateKind: "effective" as const, hijriDate: "1448/08/12", gregorianDate: "2027-01-20", dateLabel: "y" },
    { dateKind: "publication" as const, hijriDate: "1448/01/01", gregorianDate: null, dateLabel: "z" },
  ];
  const masked = maskOfficialDates(items, false) as Array<Record<string, unknown>>;
  assert.deepEqual(masked.map((i) => [i.dateKind, i.hijriDate, i.dateLabel, i.dateLocked ?? false]), [
    ["issue", null, null, true],
    ["effective", "1448/08/12", "y", false],
    ["publication", null, null, true],
  ]);
  assert.equal(maskOfficialDates(items, true), items);
});
