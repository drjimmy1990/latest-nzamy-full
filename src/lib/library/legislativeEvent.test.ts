import { test } from "node:test";
import assert from "node:assert/strict";

import {
  formatHijriKey,
  hijriDateSortKey,
  isoFromHijriKey,
  latestLegislativeEvent,
  stripOfficialRefsFromSummary,
  summaryForViewer,
  summaryLeaksOfficialRefs,
} from "./legislativeEvent.ts";

test("hijriDateSortKey reads the shapes 20261025_40 documents, like the SQL parser", () => {
  const cases: Array<[string, number | null]> = [
    ["1440/10/29", 14401029],
    ["1426-08-02", 14260802],
    ["1443/5/26", 14430526],
    ["1446/11/7", 14461107],
    ["1444/06/25ه", 14440625],
    ["1447/07/30هـ", 14470730],
    ["1446/02", 14460200],
    ["1444", 14440000],
    ["1446 ه", 14460000],
    ["17/3/1447هـ", 14470317],
    ["1443/10/16 ه  الموافق : 17/05/2022 م", 14431016],
    ["1437/07/04:11/04/2016", 14370704],
    ["١٤٤٨/٠١/٠٨هـ", 14480108],
    ["2019/12/01م", null],
    ["1446/13/01", null],
    ["1446/01/31", null],
    ["", null],
  ];
  for (const [input, want] of cases) assert.equal(hijriDateSortKey(input), want, input);
});

test("formatHijriKey / isoFromHijriKey", () => {
  assert.equal(formatHijriKey(14480108), "1448/01/08هـ");
  assert.equal(formatHijriKey(14460200), "1446/02هـ");
  assert.equal(formatHijriKey(14460000), "1446هـ");
  assert.equal(formatHijriKey(null), "");
  assert.match(isoFromHijriKey(14480108) ?? "", /^2026-0[6-7]-\d\d$/);
  assert.equal(isoFromHijriKey(14460200), null, "a month-only date has no day: no ISO, never a guess");
});

test("٣١٧/٣١٨: one date = the later of latest_update and the issue date", () => {
  // Note ٠١: نظام تملك غير السعوديين للعقار — the merged regulation (1448/01/08) is the latest event.
  const merged = latestLegislativeEvent({ latest_update: { date_hijri: "1448/01/08", instrument: "قرار مجلس الوزراء رقم (43)" }, issue_date_hijri: "1447/01/30هـ" });
  assert.deepEqual({ ...merged, iso: undefined }, { key: 14480108, dateHijri: "1448/01/08هـ", iso: undefined, kind: "update" });
  const issueOnly = latestLegislativeEvent({ latest_update: null, issue_date_hijri: "1421/9/20هـ" });
  assert.equal(issueOnly?.dateHijri, "1421/09/20هـ");
  assert.equal(issueOnly?.kind, "issue");
  // An "update" dated before the issue does not win.
  assert.equal(latestLegislativeEvent({ latest_update: { date_hijri: "1400/01/01" }, issue_date_hijri: "1420/01/01" })?.kind, "issue");
  assert.equal(latestLegislativeEvent({ latest_update: { date_hijri: "غير متوفر" }, issue_date_hijri: "" }), null);
  assert.equal(latestLegislativeEvent({ latest_update: "1448/01/08" }), null, "latest_update is jsonb {date_hijri}");
});

test("٣١٩: decree numbers and dates are stripped from a guest's موجز", () => {
  const cases: Array<[string, string]> = [
    [
      "صدر نظام الضمان الاجتماعي بالمرسوم الملكي رقم (م/45) وتاريخ 1435/7/7هـ، ويهدف إلى حماية الأسرة.",
      "صدر نظام الضمان الاجتماعي بالمرسوم الملكي، ويهدف إلى حماية الأسرة.",
    ],
    ["صدر بالمرسوم الملكي رقم (م/‏14) وتاريخ ١٤٤٢/٩/٢٢هـ.", "صدر بالمرسوم الملكي."],
    ["صدر في 22 رمضان 1442هـ بقرار مجلس الوزراء رقم (43).", "صدر في بقرار مجلس الوزراء."],
    ["نُشر في 2019/12/01م ويسري بعد ٣٠ يوماً من نشره.", "نُشر في ويسري بعد ٣٠ يوماً من نشره."],
    ["يتكون من ١٥ مادة، وعُدّل بالمرسوم م/١٤ عام 1446هـ.", "يتكون من ١٥ مادة، وعُدّل بالمرسوم."],
    ["- أداة الإصدار: مرسوم ملكي رقم م/14\n- يتناول المادة 12 والمادة ١٣", "- أداة الإصدار: مرسوم ملكي\n- يتناول المادة 12 والمادة ١٣"],
    ["صدر بتاريخ 1442.9.22", "صدر"],
  ];
  for (const [input, want] of cases) {
    const got = stripOfficialRefsFromSummary(input);
    assert.equal(got, want, input);
    assert.equal(summaryLeaksOfficialRefs(got), false, got);
  }
});

test("٣١٩: a line that cannot be cleaned is dropped, never leaked; ordinary numbers stay", () => {
  const out = stripOfficialRefsFromSummary("سطر سليم فيه ٣٠ يوماً\n- م / ١٤ م / ١٤ ١٤٤٢/٩/٢٢\nسطر آخر");
  assert.equal(summaryLeaksOfficialRefs(out), false);
  assert.match(out, /سطر سليم فيه ٣٠ يوماً/);
  assert.match(out, /سطر آخر/);
});

test("summaryForViewer: whole for a subscriber, stripped for anyone else", () => {
  const s = "صدر بالمرسوم الملكي رقم (م/14) وتاريخ 1442/9/22هـ.";
  assert.equal(summaryForViewer(s, true), s);
  assert.equal(summaryForViewer(s, false), "صدر بالمرسوم الملكي.");
  assert.equal(summaryForViewer(null, false), "");
});
