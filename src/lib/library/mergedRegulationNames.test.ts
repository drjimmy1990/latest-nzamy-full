import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { mergedNamesForViewer } from "./mergedRegulationNames.ts";

const INIT = readFileSync(new URL("../../app/api/library/init/route.ts", import.meta.url), "utf8");

test("owner 2026-11-07: names are trimmed, blank / repeated / non-string ones dropped, order kept", () => {
  assert.deepEqual(mergedNamesForViewer(null, true), []);
  assert.deepEqual(mergedNamesForViewer("اللائحة", true), []);
  assert.deepEqual(
    mergedNamesForViewer(["  اللائحة التنفيذية لنظام العمل ", "", 7, "قواعد  الإحالة", "اللائحة التنفيذية لنظام العمل"], true),
    ["اللائحة التنفيذية لنظام العمل", "قواعد الإحالة"],
  );
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
