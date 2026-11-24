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
  // l14: while an article's links are open in the side column (pinned), the box shows that one in full.
  assert.match(BOX, /useArticleRefs\(ctx\?\.lawSlug \?\? "", ctx && !pinned \? articleId : null, \{ delayMs: 350 \}\)/, "the fallback waits for the scroll to settle");
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
  // Batch l14 (owner file 07 §6, approved 23 Nov): under the article only the counter — folded;
  // a press opens the panel (side column or bottom sheet), never cards inside the text.
  assert.doesNotMatch(BOX, /const \[open, setOpen\] = useState\(true\);/);
  assert.match(BOX, /onClick=\{\(\) => ctx\.openPanel\(articleId\)\}/);
  assert.match(BOX, /<RefGroups ctx=\{ctx\} articleId=\{articleId\} data=\{data\} max=\{2\} \/>/, "the side box while reading: two per relation");
  assert.match(BOX, /\{total > 0 && data && data\.available && \(/);
  // The panel asks for the full list when the cache holds three per group.
  assert.match(BOX, /useArticleRefs\(ctx\.lawSlug, articleId, \{ full: true \}\)/);
});

test("Q133 + owner Q171 (l13): the similar-meaning section stays, with no «رابط آلي» / «(ربط آلي)» label", () => {
  assert.match(BOX, /title: "مواد متقاربة في المعنى",/);
  assert.doesNotMatch(BOX, /item\.auto/, "no tag on an unreviewed automatic «إحالة»");
  // no label in the reader's code (comments aside)
  const code = BOX.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(code, /رابط آلي|ربط آلي/);
});

test("coloured sections, «عرض الكل (n)», every empty section hidden (file 16 §8)", () => {
  for (const t of ["التشريعات", "المبادئ والأحكام القضائية", "الآراء الفقهية"]) assert.ok(BOX.includes(`title: "${t}"`), t);
  assert.match(BOX, /bar: "bg-emerald-500"/);
  assert.match(BOX, /bar: "bg-sky-500"/);
  assert.match(BOX, /bar: "bg-amber-500"/);
  assert.match(BOX, /عرض الكل \(\{arDigits\(sec\.total\)\}\)/);
  assert.match(BOX, /SECTIONS\.filter\(\(s\) => data\.sections\[s\] && data\.sections\[s\]\.total > 0 && data\.sections\[s\]\.items\.length > 0\)/);
  assert.doesNotMatch(BOX, /لا توجد إحالات مسجّلة في هذا القسم/, "never an empty section with «لا توجد»");
  // l14: the panel's quick filters are its tabs (file 07 §6.4).
  assert.match(BOX, /role="tablist" aria-label="تصنيف الإحالات"/);
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
  // l14: a filter with nothing is not offered; a stale one falls back to «الكل».
  assert.match(BOX, /const filters = REF_FILTERS\.filter\(\(f\) => f === "all" \|\| all\.some\(\(it\) => refMatchesFilter\(it, f\)\)\);/);
  assert.match(BOX, /const picked = filters\.includes\(filter\) \? filter : "all";/);
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
  assert.equal(locks.length, 1, "one section renderer for the side box and the panel (l14: the «عرض الكل» dialog is the panel)");
  assert.doesNotMatch(BOX, /!ctx\.viewerHasFullAccess/);
  // The page starts and resets it at null (unknown), never false.
  assert.match(PAGE, /useState<boolean \| null>\(null\)/);
  assert.match(PAGE, /setViewerHasFullAccess\(null\);/);
  assert.doesNotMatch(PAGE, /setViewerHasFullAccess\(false\)/);
  // The «partial» search note and the citation popover treat unknown as "not yet".
  assert.match(PAGE, /partial=\{viewerHasFullAccess === false && /);
  assert.match(PAGE, /viewerHasFullAccess: viewerHasFullAccess === true,/);
});

test("Q132 (batch l12): the links on the whole law (an unpinned owner link opens the law) in their own box beside the article's", () => {
  assert.match(PAGE, /\{viewMode !== "regulation" && <LawRefsBox \/>\}/);
  assert.match(BOX, /expandLawLinks\(bulk\.data, LAW_LINKS_ID\)/);
  assert.match(BOX, /روابط النظام كله/);
});

test("fallback (bulk missing or failed): only while the article is on screen, after 600 ms, one request per article", () => {
  assert.match(BOX, /\{ enabled: near, delayMs: 600 \}/);
  assert.doesNotMatch(BOX, /rootMargin/, "no prefetch of articles off screen — they count toward the public guard");
  assert.match(BOX, /const pending = inflight\.get\(id\);\s*if \(pending\) return pending;/);
});

test("lib05 (l12 integration): the preview cleans a principle's text with cleanPrincipleText and its number", () => {
  const src = readFileSync(new URL("./_ref-box.tsx", import.meta.url), "utf8");
  assert.match(src, /item\.kind === "principle" \? cleanPrincipleText\(p\.text, p\.num\) : plain\(p\.text\)/);
});

test("l14 (owner file 07 §6–§7, approved 23 Nov §15): the panel, the header button, the order and the status badges", () => {
  // The panel: the side box shows the opened article in full on a wide screen, else a bottom sheet.
  assert.match(BOX, /window\.matchMedia\("\(min-width: 1024px\)"\)\.matches/, "lg — the side column's own breakpoint (page.tsx `hidden lg:block`)");
  assert.match(BOX, /if \(inlineTrigger \|\| typeof window === "undefined"/, "reading mode hides the side column: a sheet");
  assert.match(BOX, /\{ctx && panel\?\.mode === "sheet" && <RefPanelSheet /);
  assert.match(BOX, /flex items-end sm:items-center/, "a bottom sheet on a phone");
  assert.match(BOX, /else if \(articleId !== at\.active\) closePanel\?\.\(\);/, "the side box follows the reading again once the reader moves on");
  // The header button never asks the server: count from the law's one answer only.
  assert.match(BOX, /export function ArticleRefsButton\(/);
  assert.match(BOX, /useArticleRefs\(ctx\?\.lawSlug \?\? "", ctx \? articleId : null, \{ enabled: false \}\)/);
  assert.match(BOX, /الإحالات \(\{arDigits\(total\)\}\)/);
  assert.match(ARTICLE, /\{viewMode !== "regulation" && refBox && <ArticleRefsButton articleId=\{article\.id\} \/>\}/);
  assert.doesNotMatch(ARTICLE, /SendToDrafterNotesButton/, "«أرسل إلى الصائغ» left the article header");
  // …and stays reachable in the draft drawer (lawyer and firm).
  const drawer = readFileSync(new URL("../../../components/laws/DraftDrawer.tsx", import.meta.url), "utf8");
  assert.match(drawer, /handleSendToDrafter/);
  assert.match(drawer, /إرسال إلى الصائغ القانوني/);
  // Order and parts: other documents, then «في هذا النظام» with no fold.
  assert.match(BOX, /arrangeSection\(groups\.filter\(\(g\) => g\.section === s\), itemOf, ctx\.lawSlug\)/);
  assert.match(BOX, />في هذا النظام</);
  // Status: a worded badge, never colour alone.
  assert.match(BOX, /badges\.push\(\{ label: "لائحة"/);
  assert.match(BOX, /tone === "repealed"\s*\? isDark\s*\? "border-red-500\/20 bg-red-950\/20 text-zinc-400 opacity-80"/);
  assert.match(BOX, /if \(pill && tone !== "active"\) \{\s*badges\.push\(\{\s*label: pill\.labelAr,/);
  for (const label of ["الكل", "لوائح", "أحكام", "معدِّلة", "ملغاة"]) assert.ok(BOX.includes(`"${label}"`), label);
  // No emoji pill any more.
  assert.doesNotMatch(BOX, /\{pill\.emoji\}/);
});
