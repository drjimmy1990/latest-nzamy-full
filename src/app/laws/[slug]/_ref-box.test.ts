/**
 * _ref-box.test.ts — owner message 18 Nov, item 6: the links box beside the
 * article replaces the bar under it and the «وثائق وأنظمة ذات صلة» card; three
 * sections, two items each with «عرض الكل (n)», a tabbed dialog, a text preview
 * with its four actions, titles only for a non-subscriber in the judicial and
 * fiqh sections, a bottom sheet on the phone, the fiqh section hidden when
 * empty. Source contract (the component is a client module).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const BOX = read("./_ref-box.tsx");
const PAGE = read("./page.tsx");
const ARTICLE = read("./_article-components.tsx");

test("the old bar and the related-documents card are gone from the law reader", () => {
  assert.equal(existsSync(new URL("./_article-links-bar.tsx", import.meta.url)), false);
  assert.doesNotMatch(ARTICLE, /ArticleLinksBar/);
  assert.doesNotMatch(PAGE, /lawMeta\.related_systems|lawMeta\.related_principles/);
  assert.doesNotMatch(PAGE, /"وثائق وأنظمة ذات صلة"/);
});

test("the box sits in the side column for the article in view; the provider wraps both columns", () => {
  assert.match(PAGE, /\{viewMode !== "regulation" && <RefBox articleId=\{activeArticle\?\.id \?\? null\} \/>\}/);
  assert.match(PAGE, /<RefBoxProvider value=\{refBoxContext\}>/);
  assert.match(PAGE, /inlineTrigger: isReadingMode,/);
  assert.match(ARTICLE, /\{viewMode !== "regulation" && refBox && <RefSheetButton articleId=\{article\.id\} \/>\}/);
  assert.match(BOX, /useArticleRefs\(ctx\?\.lawSlug \?\? "", ctx \? articleId : null, 350\)/, "waits for the scroll to settle");
});

test("three coloured sections, two items each, «عرض الكل (n)», every empty section hidden (file 16 §8)", () => {
  for (const t of ["التشريعات", "المبادئ والأحكام القضائية", "الآراء الفقهية"]) assert.ok(BOX.includes(`title: "${t}"`), t);
  assert.match(BOX, /bar: "bg-emerald-500"/);
  assert.match(BOX, /bar: "bg-sky-500"/);
  assert.match(BOX, /bar: "bg-amber-500"/);
  assert.match(BOX, /<RefSections ctx=\{ctx\} articleId=\{articleId\} state=\{state\} max=\{2\} \/>/);
  assert.match(BOX, /عرض الكل \(\{arDigits\(sec\.total\)\}\)/);
  assert.match(BOX, /SECTIONS\.filter\(\(s\) => data\.sections\[s\]\.total > 0 && data\.sections\[s\]\.items\.length > 0\)/);
  assert.doesNotMatch(BOX, /لا توجد إحالات مسجّلة في هذا القسم/, "never an empty section with «لا توجد»");
  assert.match(BOX, /role="tablist"/);
});

test("the preview: text first, then copy / add to draft / go to / open whole; subscribe for locked text", () => {
  assert.match(BOX, /\/citations\/preview\?key=\$\{encodeURIComponent\(item\.key\)\}/);
  for (const label of ["نسخ", "إضافة للمسودة", "انتقل إلى", "فتح النظام كاملاً", "فتح الحكم كاملاً", "اشترك في المكتبة"]) {
    assert.ok(BOX.includes(label), label);
  }
  assert.match(BOX, /const SUBSCRIBER_SECTIONS: ReadonlySet<Section> = new Set\(\["judicial", "fiqh"\]\);/);
  assert.match(BOX, /onClick=\{ctx\.showPaywall\}/);
  assert.match(BOX, /\{!item\.anchorMissing && p\?\.found !== false && \(/, "no «انتقل إلى» to an anchor that is gone");
  assert.doesNotMatch(BOX, /dangerouslySetInnerHTML/, "the preview text is rendered as text");
});

test("file 16 §8: the side box is hidden when the article has no link; the dialog never opens on an empty tab", () => {
  assert.match(BOX, /if \(state\.status !== "failed" && shownSections\(state\)\.length === 0\) return null;/);
  assert.match(BOX, /const tab = tabs\.includes\(picked\) \? picked : \(tabs\[0\] \?\? picked\);/);
});

test("file 16 §9.7: a link whose anchor is gone is never shown as a confirmed article", () => {
  assert.match(BOX, /const pill = item\.anchorMissing \? null : pillOf\(item\);/, "no article status pill");
  assert.match(BOX, /مادة غير مؤكَّدة/);
  assert.match(BOX, /مبدأ غير مؤكَّد/);
});

test("register 14 item 14: the law map is gone from the law page", () => {
  assert.equal(existsSync(new URL("./_law-map-button.tsx", import.meta.url)), false);
  assert.equal(existsSync(new URL("./_law-map.tsx", import.meta.url)), false);
  assert.doesNotMatch(PAGE, /LawMapButton|_law-map|خريطة التشابك/);
});
