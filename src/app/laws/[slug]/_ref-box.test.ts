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
  assert.match(BOX, /useArticleRefs\(ctx\?\.lawSlug \?\? "", ctx \? articleId : null, \{ delayMs: 350 \}\)/, "the fallback waits for the scroll to settle");
});

test("L1 (batch l12): the links under every article again, from ONE request for the law, the side box from the same cache", () => {
  assert.match(ARTICLE, /\{viewMode !== "regulation" && refBox && <ArticleRefsInline articleId=\{article\.id\} \/>\}/);
  assert.doesNotMatch(ARTICLE + BOX, /RefSheetButton/, "the folded phone-only button is gone");
  // The page starts the law's links request beside its own, never after it.
  assert.match(PAGE, /useEffect\(\(\) => \{\s*prefetchLawLinks\(decodeURIComponent\(apiSlug\(slug\)\)\);\s*\}, \[slug\]\);/);
  assert.match(BOX, /\/citations\?bulk=1/);
  assert.match(BOX, /expandLawLinks\(bulk\.data, articleId\)/, "the article's data comes from the bulk answer");
  // Fallback only (bulk missing or failed): near the screen, three requests at a time.
  assert.match(BOX, /const MAX_PARALLEL = 3;/);
  assert.match(BOX, /new IntersectionObserver\(/);
  assert.match(BOX, /needsNear = !!ctx && \(bulk\?\.status === "unavailable" \|\| bulk\?\.status === "failed"\)/);
  // The inline list: a counter chip, open by default, groups by relation, three each; nothing at 0.
  assert.match(BOX, /const \[open, setOpen\] = useState\(true\);/);
  assert.match(BOX, /<RefGroups ctx=\{ctx\} articleId=\{articleId\} data=\{data\} max=\{3\} \/>/);
  assert.match(BOX, /<RefGroups ctx=\{ctx\} articleId=\{articleId\} data=\{data\} max=\{2\} \/>/, "the same component in the side box");
  assert.match(BOX, /\{total > 0 && data && data\.available && \(/);
  // «عرض الكل» asks for the full list when the cache holds three per group.
  assert.match(BOX, /useArticleRefs\(ctx\.lawSlug, articleId, \{ full: true \}\)/);
});

test("Q133 / library-Q4 (batch l12): the similar-meaning section and the «رابط آلي» tag", () => {
  assert.match(BOX, /title: "مواد متقاربة في المعنى \(ربط آلي\)"/);
  assert.match(BOX, /\{item\.auto && \(/);
  assert.match(BOX, />\s*رابط آلي\s*</);
});

test("coloured sections, «عرض الكل (n)», every empty section hidden (file 16 §8)", () => {
  for (const t of ["التشريعات", "المبادئ والأحكام القضائية", "الآراء الفقهية"]) assert.ok(BOX.includes(`title: "${t}"`), t);
  assert.match(BOX, /bar: "bg-emerald-500"/);
  assert.match(BOX, /bar: "bg-sky-500"/);
  assert.match(BOX, /bar: "bg-amber-500"/);
  assert.match(BOX, /عرض الكل \(\{arDigits\(sec\.total\)\}\)/);
  assert.match(BOX, /SECTIONS\.filter\(\(s\) => data\.sections\[s\] && data\.sections\[s\]\.total > 0 && data\.sections\[s\]\.items\.length > 0\)/);
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
  assert.match(BOX, /if \(item\.anchorMissing\) \{\s*return \(\s*<Link href=\{item\.docHref\}/, "Q132: an unpinned link opens its document directly — no preview, no «انتقل إلى»");
  assert.doesNotMatch(BOX, /dangerouslySetInnerHTML/, "the preview text is rendered as text");
});

test("file 16 §8: the side box is hidden when the article has no link; the dialog never opens on an empty tab", () => {
  assert.match(BOX, /if \(\(state\.status === "done" \|\| state\.status === "idle"\) && shownSections\(state\)\.length === 0\) return null;/, "hidden on an empty answer, framed while loading");
  assert.match(BOX, /\{state\.status === "loading" && <RefsSkeleton isDark=\{isDark\} \/>\}/, "L12: a skeleton, not a spinner line");
  assert.match(BOX, /const tab = tabs\.includes\(picked\) \? picked : \(tabs\[0\] \?\? picked\);/);
});

test("Q132 (owner 20 Nov, 22:16 «شغّلهم من غير وسم»): an unpinned link is an ordinary link to its document — no tag", () => {
  assert.match(BOX, /const pill = item\.anchorMissing \? null : pillOf\(item\);/, "no article status pill (it is named by its document)");
  assert.doesNotMatch(BOX, /غير مؤكَّد|غير مؤكد|لم نتحقق/, "no «غير مؤكَّدة» tag, no «لم نتحقق» line");
});

test("register 14 item 14: the law map is gone from the law page", () => {
  assert.equal(existsSync(new URL("./_law-map-button.tsx", import.meta.url)), false);
  assert.equal(existsSync(new URL("./_law-map.tsx", import.meta.url)), false);
  assert.doesNotMatch(PAGE, /LawMapButton|_law-map|خريطة التشابك/);
});

test("O15 (batch l11): no lock before the entitlement is known — tri-state, lock on false only", () => {
  assert.match(BOX, /viewerHasFullAccess: boolean \| null;/);
  const locks = BOX.match(/SUBSCRIBER_SECTIONS\.has\((?:s|tab)\) && ctx\.viewerHasFullAccess === false/g) ?? [];
  assert.equal(locks.length, 2, "the side box and the «عرض الكل» dialog");
  assert.doesNotMatch(BOX, /!ctx\.viewerHasFullAccess/);
  // The page starts and resets it at null (unknown), never false.
  assert.match(PAGE, /useState<boolean \| null>\(null\)/);
  assert.match(PAGE, /setViewerHasFullAccess\(null\);/);
  assert.doesNotMatch(PAGE, /setViewerHasFullAccess\(false\)/);
  // The «partial» search note and the citation popover treat unknown as "not yet".
  assert.match(PAGE, /partial=\{viewerHasFullAccess === false && /);
  assert.match(PAGE, /viewerHasFullAccess: viewerHasFullAccess === true,/);
});
