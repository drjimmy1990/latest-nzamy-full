/**
 * Owner package 2026-11-06 — precedent numbering and the new card fields.
 *   item 22: a Board-of-Grievances ruling with no number (anchor id «ص<n>»)
 *            is never numbered in sequence and never NaN;
 *   item 25: `printed_page` reaches the parsed row and the principles row;
 *   manifest 1.20/1.21: codex `court` / `ruling_id` aliases, decision_number
 *            never the ordinal, reference keeps case/appeal/session parts;
 *   manifest 1.27: year_hijri ranges give null, not NaN;
 * and no existing principles.id changes (identity_number).
 * Temp fixture files only (no corpus, no database, no env).
 *   node --import tsx --test scripts/parsers/parse-precedents.numbering.test.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parsePrecedents, principleOrdinal, principleReference, printedPageOf, singleHijriYear } from "./parse-precedents.ts";
import { resolvePrecedentPrincipleIds, seedPrecedents } from "../seed-library.ts";

type Row = Record<string, unknown>;

function file(name: string, content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nzamy-prec-num-"));
  const f = path.join(dir, name);
  fs.writeFileSync(f, content, "utf8");
  return f;
}

const CODEX = file("ديوان_المظالم_مدونة_اختبار.md", `---
type: مدونة سوابق
title: مدونة سوابق اختبارية لديوان المظالم
slug: bog-codex-test
year_hijri: "1425-1430"
---
<!-- PRINCIPLE_START {"number": 7, "court": "الدائرة الإدارية الأولى", "ruling_id": "12/ت/1428", "printed_page": "45-47"} -->
> مبدأ مرقم.
<!-- PRINCIPLE_END -->
<!-- PRINCIPLE_START {"id": "ص112", "issuing_body": "ديوان المظالم"} -->
> حكم بلا رقم ظاهر.
<!-- PRINCIPLE_END -->
<!-- PRINCIPLE_START {"number": "ص113", "printed_page": 113} -->
> حكم آخر بلا رقم، معرّفه صفحة الأصل.
<!-- PRINCIPLE_END -->
<!-- PRINCIPLE_START {"number": "٩", "reference": "قرار رقم 5", "case_number": "77/1/ق", "session_date": "1429/02/03"} -->
> مبدأ برقم عربي هندي.
<!-- PRINCIPLE_END -->
`);

const CONTAINER = file("مجموعة_سوابق_اختبار.md", `---
type: مجموعة سوابق قضائية
slug: prec-container-test
collection_title: مجموعة سوابق اختبارية
issuing_body: لجنة الاستئناف
---
<!-- ARTICLE_START {"number": "4152/ل.س/2026 لعام 1447", "court_type": "لجنة الاستئناف في منازعات الأوراق المالية", "summary": "قرار أول.", "number_text": "الصفحة 1", "printed_page": "9"} -->
> قرار أول.
<!-- ARTICLE_END -->
<!-- ARTICLE_START {"id": "page_2", "summary": "قرار بلا رقم."} -->
> قرار بلا رقم.
<!-- ARTICLE_END -->
<!-- ARTICLE_START {"number": "3", "summary": "قرار مرقم."} -->
> قرار مرقم.
<!-- ARTICLE_END -->
`);

const STANDALONE = file("سابقة_اختبار.md", `---
type: سابقة قضائية
title: سابقة اختبارية
slug: standalone-prec-test
court_type: المحكمة التجارية
ruling_number: "33"
case_number: "44"
printed_page: "210"
---
<!-- ARTICLE_START {"number": "1", "number_text": "الابتدائي"} -->
> نص الحكم.
<!-- ARTICLE_END -->
`);

function parseAll() {
  const codex = parsePrecedents(CODEX).collections[0];
  const container = parsePrecedents(CONTAINER).collections[0];
  return { codex, container };
}

test("item 22: an unnumbered or page-id ruling has no number — no sequence, no NaN", () => {
  const { codex, container } = parseAll();
  assert.deepEqual(codex.principles.map((p) => p.number), [7, null, null, 9]);
  assert.deepEqual(container.principles.map((p) => p.number), [null, null, 3]);
  for (const p of [...codex.principles, ...container.principles]) {
    assert.ok(p.number === null || Number.isInteger(p.number), `never NaN (${p.number})`);
  }
});

test("manifest 1.21: decision_number is never the ordinal; 1.20: codex aliases court / ruling_id", () => {
  const { codex } = parseAll();
  assert.equal(codex.principles[0].issuing_body, "الدائرة الإدارية الأولى");
  assert.equal(codex.principles[0].decision_number, "12/ت/1428");
  assert.equal(codex.principles[1].issuing_body, "ديوان المظالم");
  for (const p of codex.principles.slice(1)) assert.equal(p.decision_number, "", "absent decision number stays empty");
});

test("manifest 1.21: the explicit reference is kept and the case / session parts are appended", () => {
  const { codex } = parseAll();
  assert.equal(codex.principles[3].reference, "قرار رقم 5 - رقم القضية 77/1/ق - تاريخ الجلسة 1429/02/03");
  assert.equal(principleReference({ case_number: "1", appeal_number: "2" }), "رقم القضية 1 - رقم الاستئناف 2");
  assert.equal(principleReference({ ref: "رقم القضية 1", case_number: "1" }), "رقم القضية 1", "a part already in the reference is not repeated");
  assert.equal(principleReference({ source_ref: "مرجع", reference: "  " }), "مرجع");
});

test("item 25: printed_page is kept as written; absent is null; a non-codex collection ignores the aliases", () => {
  const { codex, container } = parseAll();
  assert.deepEqual(codex.principles.map((p) => p.printed_page), ["45-47", null, "113", null]);
  assert.deepEqual(container.principles.map((p) => p.printed_page), ["9", null, null]);
  assert.equal(printedPageOf("  12 "), "12");
  assert.equal(printedPageOf(""), null);
  assert.equal(printedPageOf(true), null);
  const plain = parsePrecedents(file("مبادئ_اختبار.md", `---
type: مبادئ قضائية
title: مبادئ اختبارية
slug: plain-principles-test
---
<!-- PRINCIPLE_START {"number": 1, "court": "محكمة", "ruling_id": "9"} -->
> مبدأ.
<!-- PRINCIPLE_END -->
`)).collections[0].principles[0];
  assert.equal(plain.issuing_body, "");
  assert.equal(plain.decision_number, "");
});

test("manifest 1.27: a year range is null, a single year (any digits) is that year", () => {
  const { codex } = parseAll();
  assert.equal(codex.year_hijri, null);
  assert.equal(singleHijriYear("1440"), 1440);
  assert.equal(singleHijriYear("١٤٤٠"), 1440);
  assert.equal(singleHijriYear(1440), 1440);
  assert.equal(singleHijriYear(undefined), 0);
  assert.equal(singleHijriYear("1425-1430"), null);
});

test("principleOrdinal: digits only, any script", () => {
  assert.equal(principleOrdinal(12), 12);
  assert.equal(principleOrdinal(" 12 "), 12);
  assert.equal(principleOrdinal("۱۲"), 12);
  assert.equal(principleOrdinal(1.5), null);
  for (const v of ["ص12", "12/ت", "", null, undefined, {}]) assert.equal(principleOrdinal(v), null, String(v));
});

async function seedRows(data: Row): Promise<Row[]> {
  const rows: Row[] = [];
  const client = {
    async upsert(table: string, batch: Row[]) {
      if (table === "principles") rows.push(...batch);
      return { data: batch, error: null };
    },
    async delete() { return { error: null }; },
    async rpc() { return { data: 0, error: null }; },
  };
  const errors: string[] = [];
  await seedPrecedents(client as never, data, false, errors, false);
  assert.deepEqual(errors, []);
  return rows;
}

test("no principles.id changes: the seeder keys on the old token, through the JSON file as in the real pipeline", async () => {
  const out = parsePrecedents(path.dirname(CODEX));
  const viaJson = JSON.parse(JSON.stringify(out)) as Row;
  const rows = await seedRows(viaJson);
  // The old ids: `<collection>__pr-<Number(number || principles.length + 1)>`,
  // where a NaN («ص113», and «٩» — Number() reads no Arabic-Indic digits)
  // became null in the JSON file and the seeder then used the row index; the
  // old collision resolver then ran over that list.
  const legacyTokens = ["__pr-7", "__pr-2", "__pr-2", "__pr-3"].map((t) => `bog-codex-test${t}`);
  assert.deepEqual(rows.map((r) => r.id), resolvePrecedentPrincipleIds(legacyTokens));
  assert.deepEqual(rows.map((r) => r.principle_number), ["7", "", "", "9"]);
  assert.deepEqual(rows.map((r) => r.printed_page), ["45-47", null, "113", null]);
  assert.deepEqual(rows.map((r) => r.decision_number), ["12/ت/1428", "", "", ""]);
});

test("container volume: ids keep the old token (NaN → index, absent → the old ++idx sequence)", async () => {
  const out = JSON.parse(JSON.stringify(parsePrecedents(CONTAINER))) as Row;
  const rows = await seedRows(out);
  assert.deepEqual(
    rows.map((r) => r.id),
    resolvePrecedentPrincipleIds(["__pr-0", "__pr-1", "__pr-3"].map((t) => `prec-container-test${t}`)),
  );
  assert.deepEqual(rows.map((r) => r.principle_number), ["", "", "3"]);
  assert.deepEqual(rows.map((r) => r.printed_page), ["9", null, null]);
});

test("standalone ruling: printed_page reaches its principles row", async () => {
  const out = JSON.parse(JSON.stringify(parsePrecedents(STANDALONE))) as Row;
  const rows = await seedRows(out);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].printed_page, "210");
  assert.equal(rows[0].principle_number, "33");
});
