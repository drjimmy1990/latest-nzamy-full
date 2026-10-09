/**
 * _numbered-item.test.ts — موجز-29-أ: printed item numbers are shown, never dropped.
 * Run: npm run test:unit   (or, from this folder: node --test _numbered-item.test.ts)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { splitNumberedItem } from "./_numbered-item.ts";

test("plain «N.» keeps its number", () => {
  assert.deepEqual(splitNumberedItem("1. يكون للوزارة ما يلي"), { number: "1", text: "يكون للوزارة ما يلي" });
  assert.deepEqual(splitNumberedItem("12. البند الثاني عشر"), { number: "12", text: "البند الثاني عشر" });
});

test("escaped «N\\.» (61 files re-numbered 2026-10-08) is a list item, without the backslash", () => {
  assert.deepEqual(splitNumberedItem("3\\. نص البند"), { number: "3", text: "نص البند" });
});

test("Arabic-Indic digits, including two-digit numbers", () => {
  assert.deepEqual(splitNumberedItem("١. أولاً"), { number: "١", text: "أولاً" });
  assert.deepEqual(splitNumberedItem("١٠\\. عاشراً"), { number: "١٠", text: "عاشراً" });
});

test("non-items are left alone", () => {
  for (const line of ["1.5 مليون ريال", "المادة 1. تعريفات", "1.", "- بند", "(1) بند"]) {
    assert.equal(splitNumberedItem(line), null, line);
  }
});

test("the reader component renders the number (guard against the old strip-and-forget)", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const src = fs.readFileSync(path.join(here, "_article-components.tsx"), "utf8");
  assert.ok(!/replace\(\/\^\\d\+\\\.\\s\+/.test(src), "the number must not be stripped with replace(/^\\d+\\.\\s+/)");
  assert.ok(src.includes("splitNumberedItem("), "num-list-item must be parsed by splitNumberedItem");
  assert.ok(/block\.number/.test(src), "the rendered num-list-item must print block.number");
});
