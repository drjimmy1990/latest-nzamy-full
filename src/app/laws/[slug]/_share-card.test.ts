import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { articleShareUrl, clampLines, shareCardFileName, shareCardText, wrapText } from "./_share-card.ts";

/** A fake measure: one unit per character (the real one is the canvas's, shaping included). */
const len = (s: string) => Array.from(s).length;

test("B-12: the direct link is the page with the article's anchor (no query, no old hash)", () => {
  assert.equal(articleShareUrl("https://nezamy.sa", "/laws/judiciary-law", "art-1"), "https://nezamy.sa/laws/judiciary-law#art-1");
  assert.equal(articleShareUrl("https://nezamy.sa/", "/laws/x?q=العمل#old", "مادة 5"), "https://nezamy.sa/laws/x#%D9%85%D8%A7%D8%AF%D8%A9%205");
  assert.equal(articleShareUrl("https://nezamy.sa", "/laws/x", ""), "https://nezamy.sa/laws/x");
});

test("B-12: the card's text is plain — no history block, tags, marks or quote prefixes", () => {
  const raw = "> **للعامل** الحق في __إجازة__\n<details><summary>قبل التعديل</summary>نص قديم</details>\n\n\n\n<!-- note -->ثانياً: `شيء`";
  assert.equal(shareCardText(raw), "للعامل الحق في إجازة\n\nثانياً: شيء");
  assert.equal(shareCardText(null), "");
  // The caller's mark stripper runs too.
  assert.equal(shareCardText("## عنوان", (s) => s.replace(/^#+ /gm, "")), "عنوان");
});

test("B-12: lines are measured whole and never exceed the width; paragraphs keep a blank line", () => {
  const lines = wrapText("أ ب ج د هـ و\n\nز ح", 5, len);
  assert.deepEqual(wrapText("أ\nب", 5, len), ["أ", "ب"], "a single line break is a new line, not a blank one");
  assert.deepEqual(lines, ["أ ب ج", "د هـ", "و", "", "ز ح"]);
  for (const l of lines) assert.ok(len(l) <= 5);
  // A word longer than the line gets its own line, never cut inside.
  assert.deepEqual(wrapText("قصير الاستئنافيةالطويلة جداً", 8, len), ["قصير", "الاستئنافيةالطويلة", "جداً"]);
  assert.deepEqual(wrapText("", 10, len), []);
});

test("B-12: a long text is cut to the room left, ending with «…» that still fits", () => {
  const lines = wrapText("واحد اثنان ثلاثة أربعة خمسة ستة سبعة ثمانية تسعة عشرة", 12, len);
  const { lines: kept, truncated } = clampLines(lines, 2, 12, len);
  assert.equal(truncated, true);
  assert.equal(kept.length, 2);
  assert.match(kept[1], / …$/);
  assert.ok(len(kept[1]) <= 12);
  assert.deepEqual(clampLines(["أ", "ب"], 3, 10, len), { lines: ["أ", "ب"], truncated: false });
  assert.deepEqual(clampLines(["أ", "", "ب"], 2, 10, len).lines, ["أ …"], "never ends on an empty line");
});

test("B-12: the download's name is safe on every system", () => {
  assert.equal(shareCardFileName("نظام العمل", "المادة الأولى"), "نظامي-نظام-العمل-المادة-الأولى.png");
  assert.equal(shareCardFileName('a/b:c*?"<>|', ""), "نظامي-a-b-c.png");
});

test("B-12: the share button sits in the article's header; the image only for text this reader may read", () => {
  const reader = readFileSync(join(import.meta.dirname, "_article-components.tsx"), "utf8").replace(/\r\n/g, "\n");
  const header = reader.slice(reader.indexOf("{!isReadingMode && ("), reader.indexOf("{/* Body */}"));
  assert.match(header, /<ArticleShareButton/);
  assert.match(header, /canImage=\{!isLocked && !isRepealed && /);
  const share = readFileSync(join(import.meta.dirname, "_article-share.tsx"), "utf8");
  assert.match(share, /"مشاركة كصورة \(قصاصة نظامي\)"/);
  assert.match(share, /"نسخ رابط المادة المباشر"/);
  assert.match(share, /\{canImage && \(/, "no image option without canImage");
  // The card is drawn on a canvas with the page's fonts — not html2canvas (it breaks Arabic joining).
  assert.doesNotMatch(share, /html2canvas/);
  assert.match(share, /getPropertyValue\(name\)/);
  assert.match(share, /document\.fonts\?\.load\(/);
  assert.match(share, /ctx\.direction = "rtl";/);
  assert.match(share, /"\/brand\/nezamy-wordmark\.png"/);
});
