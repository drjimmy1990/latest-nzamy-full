import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { mergedNamesForViewer } from "./mergedRegulationNames.ts";
import { regulationNameFromRefs } from "./regulationName.ts";
import { readWithOptionalFeatures, type OptionalFeature } from "./optionalColumn.ts";

const INIT = readFileSync(new URL("../../app/api/library/init/route.ts", import.meta.url), "utf8");

test("owner 2026-11-07: names are trimmed, blank / repeated / non-string ones dropped, order kept", () => {
  assert.deepEqual(mergedNamesForViewer(null, true), []);
  assert.deepEqual(mergedNamesForViewer("اللائحة", true), []);
  assert.deepEqual(
    mergedNamesForViewer(["  اللائحة التنفيذية لنظام العمل ", "", 7, "قواعد  الإحالة", "اللائحة التنفيذية لنظام العمل"], true),
    ["اللائحة التنفيذية لنظام العمل", "قواعد الإحالة"],
  );
});

test("prod refs are per regulation article: reduced to the regulation's name; bare ordinals dropped", () => {
  // The shapes 20261107_10 found on prod (2026-11-08).
  assert.deepEqual(
    mergedNamesForViewer([
      "المادة الأولى من اللائحة التنفيذية لنظام المدفوعات وخدماتها",
      "المادة السادسة عشرة بعد المئة من اللائحة التنفيذية لنظام المدفوعات وخدماتها",
    ], true),
    ["اللائحة التنفيذية لنظام المدفوعات وخدماتها"],
  );
  assert.deepEqual(
    mergedNamesForViewer([
      "المادة (1) من اللائحة التنفيذية",
      "اللائحة التنظيمية لحماية الأغذية من المخاطر المتعمدة",
      "المادة (2) من اللائحة التنفيذية",
    ], true),
    ["اللائحة التنفيذية", "اللائحة التنظيمية لحماية الأغذية من المخاطر المتعمدة"],
  );
  assert.deepEqual(
    mergedNamesForViewer([
      "المادة الثانية والأربعون من القواعد الإجرائية",
      "المادة السابعة عشرة من قواعد غرفة التحكيم المختصة بمنازعات تراخيص الأندية",
    ], true),
    ["القواعد الإجرائية", "قواعد غرفة التحكيم المختصة بمنازعات تراخيص الأندية"],
  );
  // The reader's subtitle: the first regulation name in its merged ref.
  assert.equal(regulationNameFromRefs("الأولى, المادة الثانية من اللائحة التنفيذية لنظام العمل"), "اللائحة التنفيذية لنظام العمل");
  assert.equal(regulationNameFromRefs("الأولى"), "");
  assert.equal(regulationNameFromRefs(undefined), "");
  // law-agriculture: article labels only — no regulation name to show.
  assert.deepEqual(mergedNamesForViewer(["الأولى", "الثامنة والعشرون بعد المائة", "ستة بعد المائتين", "مائتين"], true), []);
});

test("owner ٤٢٤ / ٣٨٠: a visitor's name loses its decree number and date; a subscriber's is whole", () => {
  const name = "اللائحة التنفيذية لنظام العمل الصادرة بالقرار الوزاري رقم (178) وتاريخ 1440/08/12هـ";
  assert.deepEqual(mergedNamesForViewer([name], true), [name]);
  const [guest] = mergedNamesForViewer([name], false);
  assert.ok(guest && guest.startsWith("اللائحة التنفيذية لنظام العمل"), guest);
  assert.doesNotMatch(guest, /178|1440|رقم\s*\(/);
});

test("the init route reads merged_regulation_names as an optional feature and cleans it per tier", () => {
  assert.match(INIT, /\{ key: "mergedNames", columns: \[LAW_MERGED_NAMES_COLUMN\] \}/);
  assert.match(INIT, /on\.has\("mergedNames"\) \? `, \$\{LAW_MERGED_NAMES_COLUMN\}` : ""/);
  assert.match(INIT, /"mergedNames"\],/);
  assert.match(INIT, /mergedNamesForViewer\(shaped\[LAW_MERGED_NAMES_COLUMN\], hasFullAccess\)/);
});

test("owner ٤٢٤ / ٣٨٠: the init orders list masks the number and date by full access", () => {
  assert.match(INIT, /maskDecreeOfficialFields\(shaped, hasFullAccess\)/);
});

// The init route's four optional features (LAW_OPTIONAL_FEATURES), as declared there.
const FEATURES: readonly OptionalFeature[] = [
  { key: "summary", columns: ["summary_brief"] },
  { key: "sort", columns: ["catalogue_recency_key"] },
  { key: "repealedLast", columns: ["catalogue_is_repealed"] },
  { key: "mergedNames", columns: ["merged_regulation_names"] },
];

test("before 20261107_10: a 42703 naming merged_regulation_names drops only mergedNames, the rest stay on", async () => {
  for (const [key, cols] of [["summary", "LAW_SUMMARY_COLUMN"], ["sort", "LAW_SORT_KEY"], ["repealedLast", "LAW_REPEALED_KEY"], ["mergedNames", "LAW_MERGED_NAMES_COLUMN"]]) {
    assert.match(INIT, new RegExp(`\\{ key: "${key}", columns: \\[${cols}\\] \\}`), `init declares ${key}`);
  }
  const seen: string[][] = [];
  const res = await readWithOptionalFeatures(async (on) => {
    seen.push([...on].sort());
    if (on.has("mergedNames")) {
      return { data: null, error: { code: "42703", message: "column laws.merged_regulation_names does not exist" } };
    }
    return { data: [{ slug: "x" }], error: null };
  }, FEATURES);
  assert.equal(res.error, null);
  assert.deepEqual(res.data, [{ slug: "x" }]);
  assert.deepEqual(seen, [
    ["mergedNames", "repealedLast", "sort", "summary"],
    ["repealedLast", "sort", "summary"],
  ]);
});

test("fix round 1: decree موجز / summary / search snippet go through summaryForViewer; titles do not", () => {
  const decree = readFileSync(new URL("../../app/api/library/decrees/[id]/route.ts", import.meta.url), "utf8");
  const search = readFileSync(new URL("../../app/api/library/search/route.ts", import.meta.url), "utf8");
  assert.match(decree, /summary: typeof decree\.summary === 'string' \? summaryForViewer\(decree\.summary, isSubscriber\) : decree\.summary,/);
  assert.match(decree, /summary_brief: typeof decree\.summary_brief === 'string' \? summaryForViewer\(decree\.summary_brief, isSubscriber\) : decree\.summary_brief,/);
  assert.match(decree, /title: decree\.title,/);
  assert.match(decree, /officialMetaLocked: !isSubscriber && Boolean\(decree\.ref \|\| decree\.date \|\| decree\.official_url\),/);
  assert.match(INIT, /for \(const key of \["summary_brief", "summary"\]\) \{\s*if \(typeof shaped\[key\] === "string"\) shaped\[key\] = summaryForViewer\(shaped\[key\] as string, hasFullAccess\);/);
  assert.match(search, /const brief = summaryForViewer\(r\.summary_brief as string \|\| '', hasFullAccess\);/);
});
