/**
 * «دليل ناجز» → plain blocks (batch 2026-11-08, A2). The reader slice starts at
 * «الباب الثاني» and stops before the developers' appendix; tables split
 * `<br>` into lines; callout markers become a kind; inline marks become
 * segments. Nothing is HTML.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { INTERNAL_NOTE_PHRASES, extractUserGuide, isInternalNote, parseGuideBlocks, parseInline, plainText, stripInternalNotes } from "./guideBlocks.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const md = fs.readFileSync(path.resolve(here, "../../data/murshid/najiz-guide-2026-10-28.md"), "utf8");

test("the committed guide is the reader slice only (written by scripts/murshid-import.mjs)", () => {
  assert.match(md, /^## الباب الثاني/);
  assert.equal(extractUserGuide(md), md.trim(), "nothing before الباب الثاني, no appendix");
  assert.ok(!md.includes("ملحق معماري للمطورين"));
  assert.ok(!md.includes("document_id:"));
  assert.ok(!md.includes("الباب الأول"));
});

test("no internal research / audit note line is left in the committed guide", () => {
  for (const line of md.split(/\r?\n/)) {
    const segments = line.trim().startsWith("|") ? line.split(/\||<br\s*\/?>/i) : [line];
    for (const seg of segments) assert.ok(!isInternalNote(seg), seg.slice(0, 120));
  }
  for (const p of ["مكتبة الماك", "أيجنت", "لم تصلنا", "LAW-00-1185", "الملف الخام"]) assert.ok(!md.includes(p), p);
  assert.deepEqual(stripInternalNotes(md).removed, []);
});

test("stripInternalNotes: whole lines, table-cell segments, empty callout shells", () => {
  const src = [
    "فقرة للقارئ.",
    "- بند بحسب أيجنت المكتبة.",
    "| **58** | الشركات | نص الوصف.<br>• **تنبيه تدقيقي (مصوّب):** ورد في الملف الخام خطأ. | ص 12 |",
    "> [!NOTE]",
    "> اللائحة LAW-00-1185 موجودة في مكتبة الماك ولم تصلنا نصوصها.",
    "",
    "> [!WARNING]",
    "> تنبيه للقارئ يبقى.",
    "TODO: راجع هذا",
  ].join("\n");
  const r = stripInternalNotes(src);
  assert.equal(r.removed.length, 4);
  assert.ok(r.md.includes("فقرة للقارئ."));
  assert.ok(r.md.includes("| **58** | الشركات | نص الوصف. | ص 12 |"));
  assert.ok(!r.md.includes("[!NOTE]"), "an emptied callout leaves no shell");
  assert.ok(r.md.includes("> [!WARNING]\n> تنبيه للقارئ يبقى."));
  assert.ok(!r.md.includes("TODO"));
  assert.ok(INTERNAL_NOTE_PHRASES.includes("مكتبة الماك") && INTERNAL_NOTE_PHRASES.includes("أيجنت المكتبة") && INTERNAL_NOTE_PHRASES.includes("لم تصلنا"));
  assert.equal(isInternalNote("فسخ عقد الزواج وفق نظام الأحوال الشخصية"), false);
});

test("the reader slice: from «الباب الثاني» to before the developers' appendix", () => {
  const full = "---\ndocument_id: X\n---\n# عنوان\n## الباب الأول: مواصفة\nنص للمطورين\n## الباب الثاني: الخطوات\nنص\n## ملحق معماري للمطورين\n```ts\nx\n```";
  const slice = extractUserGuide(full);
  assert.match(slice, /^## الباب الثاني/);
  assert.ok(!slice.includes("ملحق معماري للمطورين"));
  assert.ok(!slice.includes("document_id:"), "front matter dropped");
  assert.ok(!slice.includes("الباب الأول"), "the developer spec chapter is not served");
  assert.ok(!slice.includes("export interface NajizClaimType"));
});

test("the guide parses into 249 table rows: 6 filing steps + 243 claim types", () => {
  const blocks = parseGuideBlocks(extractUserGuide(md));
  const tables = blocks.filter((b) => b.type === "table");
  assert.equal(tables.reduce((a, b) => a + (b.type === "table" ? b.rows.length : 0), 0), 249);
  for (const t of tables) {
    if (t.type !== "table") continue;
    assert.ok(t.header.length > 0);
    assert.ok(t.rows.every((r) => r.length === t.header.length));
  }
  const json = JSON.stringify(blocks);
  assert.ok(!/<br\s*\/?>/i.test(json), "<br> never survives as text");
  assert.ok(!json.includes("[!WARNING]"));
});

test("pipe tables, alignment rows and <br> cells", () => {
  const blocks = parseGuideBlocks("| a | b |\n| :-: | :--- |\n| **1** | x<br>y |\n");
  assert.deepEqual(blocks, [{ type: "table", header: [["a"], ["b"]], rows: [[["**1**"], ["x", "y"]]] }]);
});

test("callouts, headings, list items and paragraphs", () => {
  const blocks = parseGuideBlocks("### عنوان\n\n> [!WARNING]\n> **تنبيه:** نص\n\n- بند\n  1. فرعي\n\nفقرة\nتكملة");
  assert.deepEqual(blocks, [
    { type: "heading", level: 3, text: "عنوان" },
    { type: "callout", kind: "warning", lines: ["**تنبيه:** نص"] },
    { type: "item", ordered: false, marker: "•", depth: 0, text: "بند" },
    { type: "item", ordered: true, marker: "1.", depth: 1, text: "فرعي" },
    { type: "paragraph", text: "فقرة تكملة" },
  ]);
});

test("markup in the text stays text", () => {
  const blocks = parseGuideBlocks('<script>alert(1)</script> <img src=x onerror="y">');
  assert.deepEqual(blocks, [{ type: "paragraph", text: '<script>alert(1)</script> <img src=x onerror="y">' }]);
});

test("parseInline: bold, italic, code; unpaired marks stay", () => {
  assert.deepEqual(parseInline("أ **ب** *ج* `د` 5 * 3"), [
    { t: "text", v: "أ " },
    { t: "strong", v: "ب" },
    { t: "text", v: " " },
    { t: "em", v: "ج" },
    { t: "text", v: " " },
    { t: "code", v: "د" },
    { t: "text", v: " 5 * 3" },
  ]);
  assert.equal(plainText("**الدخول للمنصة (`ناجز أفراد`)**"), "الدخول للمنصة (ناجز أفراد)");
});
