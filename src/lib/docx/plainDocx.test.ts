/**
 * plainDocx.test.ts — N01-21/22/23 (batch l11): Word + print/PDF on every AI
 * result bar.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/docx/plainDocx.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { strFromU8 } from "fflate";
import { plainResultDocx, resultBlocks, safeFilename } from "./plainDocx.ts";
import { assertPackageOpens } from "./packageCheck.testkit.ts";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

test("resultBlocks: title, headings, bullets, paragraphs; no [S…] markers, no ** marks", () => {
  const blocks = resultBlocks("## الوقائع\nالمدعي عامل [S1].\n- بند أول\n• بند ثانٍ\n\n**الخلاصة**: يستحق [S2][S3]", "رأي قانوني");
  assert.deepEqual(blocks, [
    { kind: "title", text: "رأي قانوني" },
    { kind: "heading", text: "الوقائع" },
    { kind: "para", text: "المدعي عامل." },
    { kind: "list", items: ["بند أول", "بند ثانٍ"], ordered: false },
    { kind: "para", text: "الخلاصة: يستحق" },
  ]);
  assert.deepEqual(resultBlocks("  \n\n", ""), []);
});

test("plainResultDocx: a package Word opens, the text escaped once, RTL", () => {
  const files = assertPackageOpens(plainResultDocx("نص فيه & و < و > [S1]\nسطر ثانٍ", "نتيجة <أداة>"));
  const doc = strFromU8(files["word/document.xml"]);
  assert.match(doc, /نص فيه &amp; و &lt; و &gt;/);
  assert.match(doc, /نتيجة &lt;أداة&gt;/);
  assert.match(doc, /<w:bidi\/>/);
  assert.doesNotMatch(doc, /\[S1\]/);
  // No letterhead: no header, no footer, no media.
  assert.ok(!files["word/header1.xml"] && !files["word/footer1.xml"]);
  assert.equal(Object.keys(files).some((n) => n.startsWith("word/media/")), false);
});

test("plainResultDocx: control characters and lone surrogates never break the file", () => {
  assertPackageOpens(plainResultDocx("a\u0001b\uD800c￿", null));
});

test("safeFilename: no path or reserved characters, never empty", () => {
  assert.equal(safeFilename("case/brief:2026?"), "case-brief-2026-");
  assert.equal(safeFilename("   "), "nzamy-ai-result");
  assert.equal(safeFilename("مذكرة دفاع"), "مذكرة دفاع");
});

test("AiResultActions offers Word and print/PDF, fflate loaded on the click", () => {
  const src = read("src/components/AiResultActions.tsx");
  assert.match(src, /await import\("@\/lib\/docx\/plainDocx"\)/);
  assert.doesNotMatch(src, /^import .*plainDocx/m, "the Word writer must not ship with every result page");
  assert.match(src, /<AiResultPrint key=\{printRun\}/);
  assert.match(src, /طباعة \/ PDF/);
  assert.match(src, /showExport = true/);
  const print = read("src/components/ai/AiResultPrint.tsx");
  assert.match(print, /exportableBlocks\(resultBlocks\(text, title\)\)/);
  assert.match(print, /window\.print\(\)/);
  assert.doesNotMatch(print, /منصة نظامي/, "no platform stamp on the paper (owner ٤٤٢(أ))");
});

test("no second Word / print pair where the letterhead bar already offers one", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = `${dir}/${name}`;
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith(".tsx")) files.push(p);
    }
  };
  walk("src");
  const both = files.filter((p) => {
    const s = read(p);
    return /<AiResultActions\b/.test(s) && /<LetterheadExportBar\b/.test(s);
  });
  assert.ok(both.length >= 4, "the overlap is still found");
  for (const p of both) {
    const s = read(p);
    const tags = s.match(/<AiResultActions\b[^>]*?\/>/g) ?? [];
    assert.equal(tags.length, (s.match(/<AiResultActions\b/g) ?? []).length, `every mount read: ${p}`);
    for (const tag of tags) assert.match(tag, /letterheadBeside|showExport=\{false\}/, p);
  }
});
