/**
 * N02-13 (batch l11): a decree named in a law's text resolves to one library
 * record only with its number AND date, and only when exactly one row fits.
 *
 *   node --test src/lib/library/decreeRef.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { decreeRefKey, decreeRefVariants, parseDecreeRef, parseHijriDate, pickDecree } from "./decreeRef.ts";

test("a royal decree with its date, in either digit set and either date order", () => {
  assert.deepEqual(parseDecreeRef("المرسوم الملكي رقم (م/٥١) وتاريخ ٢٣/٨/١٤٢٦هـ"), { letter: "م", digits: "51", date: { y: 1426, m: 8, d: 23 } });
  assert.deepEqual(parseDecreeRef("المرسوم الملكي رقم (م/6) وتاريخ 1440/01/02هـ"), { letter: "م", digits: "6", date: { y: 1440, m: 1, d: 2 } });
  assert.deepEqual(parseDecreeRef("بموجب الأمر الملكي رقم (أ/90) بتاريخ 27/8/1412هـ")?.letter, "أ");
  assert.deepEqual(parseDecreeRef("قرار مجلس الوزراء رقم (8) وتاريخ 1440/01/01هـ"), { letter: "", digits: "8", date: { y: 1440, m: 1, d: 1 } });
});

test("no date, no number: no key to resolve with", () => {
  assert.equal(parseDecreeRef("المرسوم الملكي رقم (م/51)")?.date, null);
  assert.equal(parseDecreeRef("بموجب مرسوم ملكي"), null);
  assert.equal(parseDecreeRef(""), null);
  assert.equal(parseHijriDate("2020/01/01"), null, "not a Hijri year");
  assert.equal(parseHijriDate("1440/13/01"), null);
});

test("stored refs read as the same key; the variants cover the spellings", () => {
  assert.equal(decreeRefKey("م/6"), "م/6");
  assert.equal(decreeRefKey("(م / ٦)"), "م/6");
  assert.equal(decreeRefKey("ا/90"), "أ/90");
  assert.equal(decreeRefKey("222"), "/222");
  const v = decreeRefVariants({ letter: "م", digits: "51", date: null });
  for (const s of ["م/51", "م / 51", "(م/51)", "م/٥١", "م51"]) assert.ok(v.includes(s), s);
  assert.ok(decreeRefVariants({ letter: "أ", digits: "90", date: null }).includes("ا/90"));
});

test("pickDecree: number and date must both match, and exactly one row", () => {
  const rows = [
    { id: "a", title: "مرسوم ملكي رقم (م/6) وتاريخ 1440/01/02هـ", ref: "م/6", date: "1440/01/02هـ" },
    { id: "b", title: "مرسوم ملكي رقم (م/6) وتاريخ 1428/02/01هـ", ref: "م/6", date: "1428-02-01" },
    { id: "c", title: "قرار", ref: "6", date: "1440/01/02" },
  ];
  const ref = parseDecreeRef("المرسوم الملكي رقم (م/٦) وتاريخ ١٤٤٠/١/٢هـ")!;
  assert.equal(pickDecree(rows, ref)?.id, "a");
  assert.equal(pickDecree(rows, parseDecreeRef("المرسوم الملكي رقم (م/6)")!), null, "no date: ambiguous, never guessed");
  assert.equal(pickDecree([...rows, { ...rows[0], id: "dup" }], ref), null, "two rows fit: no answer");
  assert.equal(pickDecree(rows, parseDecreeRef("المرسوم الملكي رقم (م/7) وتاريخ 1440/01/02هـ")!), null);
});

test("the reader's decree popover asks only with a date and full access, and falls back to the plain note", async () => {
  const { readFileSync } = await import("node:fs");
  const pop = readFileSync(new URL("../../app/laws/[slug]/_citation-popover.tsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(pop, /const ask = ctx\.viewerHasFullAccess && !!parseDecreeRef\(chip\.label\)\?\.date;/);
  assert.match(pop, /citations\?decree=\$\{encodeURIComponent\(chip\.label\.slice\(0, 200\)\)\}/);
  assert.match(pop, /أداة تشريعية مذكورة في النص\. حالتها لا تُستنتج من هنا/);
});
