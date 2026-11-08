/**
 * pageCount.test.ts — owner ٤٣٩ (8 Nov 2026): a page is 3000 characters,
 * counted after the tashkeel (U+064B–U+065F, U+0670) and the tatweel (U+0640)
 * are dropped and each run of whitespace is one space. Only the count changes:
 * the model still reads the original text. One function for the browser's
 * paste box and the server's caps.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/pageCount.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RAW_CEILING_FACTOR, TEXT_CHARS_PER_PAGE, countableChars, countableText, measurePaste, textPages } from "./pageCount.ts";
import * as textExtract from "./textExtract.ts";
import { AI_TOOLS, BRIEF_CHECK_PASTE_MAX, BRIEF_CHECK_PASTE_MIN } from "./tools.ts";
import { pasteState } from "../../components/ai/aiReadable.ts";

const src = (rel: string) => readFileSync(join(process.cwd(), "src", rel), "utf8");

/** Every mark the owner named: U+064B..U+065F, the dagger alif U+0670, and the tatweel U+0640. */
const MARKS = [
  ...Array.from({ length: 0x065f - 0x064b + 1 }, (_, i) => String.fromCodePoint(0x064b + i)),
  "ٰ",
  "ـ",
];

test("٤٣٩: every mark in U+064B–U+065F, U+0670 and the tatweel is not counted; the letters are", () => {
  assert.equal(MARKS.length, 23);
  for (const m of MARKS) assert.equal(countableChars(`ب${m}`), 1, `U+${m.codePointAt(0)!.toString(16)} counted`);
  assert.equal(countableText("قَالَ اللّٰهُ تَعَالَىٰ"), "قال الله تعالى");
  assert.equal(countableText("الحـــمد"), "الحمد");
  // The neighbours of the range are letters and digits, and stay.
  assert.equal(countableText("ء٠٩يٱ"), "ء٠٩يٱ");
});

test("٤٣٩: each run of whitespace counts as one space, and the ends are trimmed", () => {
  assert.equal(countableText("  أ    ب\t\t\tج\r\n\r\nد  ه  "), "أ ب ج د ه");
  assert.equal(countableChars(" \n\t "), 0);
  assert.equal(countableChars("نص     نص"), 5);
});

test("٤٣٩: pages — tashkeel-heavy text and repeated spaces cost no extra page", () => {
  assert.equal(TEXT_CHARS_PER_PAGE, 3000);
  assert.equal(textPages(""), 1);
  assert.equal(textPages("س".repeat(3000)), 1);
  assert.equal(textPages("س".repeat(3001)), 2);
  // 3000 letters, each with a shadda and a fatha: 9000 raw characters, one page.
  const vocalised = "سَّ".repeat(3000);
  assert.equal(vocalised.length, 9000);
  assert.equal(textPages(vocalised), 1);
  assert.equal(textPages(`${vocalised}ب`), 2);
  // 1500 one-letter words, five spaces apart: 8995 raw, 1500 + 1499 counted.
  const spaced = Array.from({ length: 1500 }, () => "و").join("     ");
  assert.equal(spaced.length, 8995);
  assert.equal(countableChars(spaced), 2999);
  assert.equal(textPages(spaced), 1);
  // 30 pages of fully vocalised text stay 30 pages.
  assert.equal(textPages("كَ".repeat(TEXT_CHARS_PER_PAGE * 30)), 30);
  assert.equal(textPages("كَ".repeat(TEXT_CHARS_PER_PAGE * 30 + 1)), 31);
});

test("٤٣٩: the count never changes the text — countableText only measures", () => {
  const original = "  قَالَ    تَعَالَىٰ  ";
  const before = original.slice();
  countableText(original);
  textPages(original);
  measurePaste(original, { min: 1, max: 10 });
  assert.equal(original, before);
  assert.notEqual(countableText(original), original);
});

test("٤٣٩: textExtract re-exports the same functions, and the raw file ceiling fits 30 vocalised pages", () => {
  assert.equal(textExtract.textPages, textPages);
  assert.equal(textExtract.countableChars, countableChars);
  assert.equal(textExtract.TEXT_CHARS_PER_PAGE, TEXT_CHARS_PER_PAGE);
  assert.equal(textExtract.TEXT_FILE_MAX_CHARS, 30 * TEXT_CHARS_PER_PAGE * RAW_CEILING_FACTOR);
  assert.ok("كَ".repeat(TEXT_CHARS_PER_PAGE * 30).length <= textExtract.TEXT_FILE_MAX_CHARS);
});

test("٤٣٩: a paste box is measured by counted characters, with a raw ceiling of twice the limit", () => {
  const rules = { min: 10, max: 100 };
  assert.deepEqual(measurePaste("   ", rules), { chars: 0, empty: true, tooShort: false, tooLong: false });
  assert.equal(measurePaste("سَ".repeat(9), rules).tooShort, true);
  assert.equal(measurePaste("سَ".repeat(100), rules).tooLong, false, "200 raw, 100 counted");
  assert.equal(measurePaste("سَ".repeat(101), rules).tooLong, true);
  assert.equal(measurePaste(`س${" ".repeat(150)}س`, rules).tooLong, false, "152 raw, 3 counted");
  assert.equal(measurePaste(`س${" ".repeat(199)}س`, rules).tooLong, true, "201 raw: past the raw ceiling");
  assert.equal(measurePaste("سًّ".repeat(99), rules).tooLong, true, "297 raw: past the raw ceiling though 99 counted");
});

test("٤٣٩: the browser's paste box and the server agree, and the server keeps the original text", () => {
  const rules = { min: BRIEF_CHECK_PASTE_MIN, max: BRIEF_CHECK_PASTE_MAX };
  const v = AI_TOOLS["brief-check"].validateInput;
  const base = { client_capacity: "مدعى عليه" };
  const cases = [
    "سَ".repeat(BRIEF_CHECK_PASTE_MAX),
    "سَ".repeat(BRIEF_CHECK_PASTE_MAX + 1),
    "سَ".repeat(BRIEF_CHECK_PASTE_MIN - 1),
    `  ${Array.from({ length: 150 }, () => "نص").join("    ")}  `,
    "x".repeat(BRIEF_CHECK_PASTE_MAX * RAW_CEILING_FACTOR + 1),
    "سًّ".repeat(BRIEF_CHECK_PASTE_MAX - 1),
  ];
  const verdicts = cases.map((text) => {
    const client = pasteState(text, rules);
    const server = v({ ...base, memo_text: text });
    assert.equal(server.ok, client.ok, `${text.length} raw / ${client.chars} counted`);
    if (server.ok) assert.equal(server.input.memo_text, text.trim(), "the model reads the original, marks and spaces included");
    return client.ok;
  });
  assert.deepEqual(verdicts, [true, false, false, true, false, false]);
});

test("٤٣٩: one function — both sides import pageCount.ts, and nothing else counts text.length for a page", () => {
  assert.match(src("components/ai/aiReadable.ts"), /import \{ measurePaste \} from "\.\.\/\.\.\/lib\/ai\/pageCount\.ts"/);
  assert.match(src("lib/ai/tools.ts"), /import \{ measurePaste \} from "\.\/pageCount\.ts"/);
  assert.match(src("lib/ai/textExtract.ts"), /export \{ TEXT_CHARS_PER_PAGE, countableChars, countableText, textPages \} from "\.\/pageCount\.ts"/);
  assert.doesNotMatch(src("lib/ai/textExtract.ts"), /\.length \/ TEXT_CHARS_PER_PAGE/);
  assert.doesNotMatch(src("lib/ai/pageCount.ts"), /^import /m, "the module stays import-free, safe in the browser");
});
