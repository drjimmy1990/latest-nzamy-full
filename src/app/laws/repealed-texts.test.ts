/**
 * Owner decisions ٥١ / ٥٢ / ١٠١ (answers of 2026-10-06): repealed texts in the
 * library stay searchable, carry a red «⛔ ملغى وغير سارٍ» badge with no
 * strike-through, keep their historic text behind the same paywall as any
 * article, and the former text is introduced with «ونصه قبل الإلغاء:».
 *
 * Owner package 6-Nov #17/#18 (newer): the export now writes a repealed
 * article as «### ~~المادة X~~ `[ملغاة]`» + «🚫 أُلغيت هذه المادة بموجب: …» +
 * the prior wording folded + a neutral warning before the regulation, and
 * «القارئ يرسم الشطب والشارة والطيّة». So the article's NUMBER and TITLE are
 * struck; its texts (the notice, the prior wording) still are not (٥٢).
 *
 * The cards and the reader import next/* and "@/…" aliases, so (like the
 * other source contracts in this folder) this reads their source.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildCitation } from "./[slug]/_citation.ts";

const cards = readFileSync(new URL("./components/LawsTabContent.tsx", import.meta.url), "utf8");
const reader = readFileSync(new URL("./[slug]/_article-components.tsx", import.meta.url), "utf8");
const lawPage = readFileSync(new URL("./[slug]/page.tsx", import.meta.url), "utf8");

const BADGE = "⛔ ملغى وغير سارٍ";

test("a repealed law card and a repealed matched article both carry the owner's red badge", () => {
  // The law card (catalogue and search), from T28-23.
  assert.match(cards, /const isRepealedLaw = isRepealedLawStatus\(sys\.status\);/);
  assert.ok(cards.includes(BADGE));
  // A repealed article inside a search card (its law may be in force).
  assert.match(cards, /\{a\.status === "repealed" && \(\s*<span[^>]*>\s*⛔ ملغى وغير سارٍ\s*<\/span>\s*\)\}/);
});

test("the reader's article card uses the same badge and introduces the former text as «ونصه قبل الإلغاء:»", () => {
  assert.ok(reader.includes('⛔ {isRTL ? "ملغى وغير سارٍ"'), "article card badge");
  assert.ok(!reader.includes('🚫 {isRTL ? "ملغاة"'), "the old «🚫 ملغاة» badge is gone");
  assert.ok(reader.includes('{isRTL ? "ونصه قبل الإلغاء:"'), "historic text label");
  assert.ok(!reader.includes('"النص الأصلي:"'), "the old «النص الأصلي:» label is gone");
  // The law page says it before any article.
  assert.ok(lawPage.includes("هذا التشريع ملغى وغير سارٍ"));
});

test("strike-through only on a repealed article's number and title (6-Nov #17), never on a text", () => {
  for (const [name, src] of [["LawsTabContent", cards], ["[slug]/page", lawPage]] as const) {
    assert.doesNotMatch(src, /line-through/, `${name} strikes text through`);
  }
  // The reader: the number badge, the title (dark + light), and a «~~…~~» part of a markdown heading.
  assert.equal((reader.match(/line-through/g) || []).length, 4);
  assert.match(reader, /\$\{mainBadgeStyle\} \$\{isRepealed && viewMode !== "regulation" \? "line-through decoration-red-500\/70" : ""\}/);
  assert.match(reader, /isDark \? "text-red-400 line-through decoration-red-500\/60" : "text-red-600 line-through decoration-red-400\/70"/);
  assert.match(reader, /className=\{part\.struck \? "line-through decoration-red-500\/70" : undefined\}/);
  // Not in the repealed body: the notice, the folded prior wording, the warning.
  const start = reader.indexOf("{!isLocked && repealedNotice && (");
  const end = reader.indexOf("{!isLocked && repealedWarning && (");
  assert.ok(start > 0 && end > start, "repealed body found");
  assert.doesNotMatch(reader.slice(start, reader.indexOf("</div>", reader.indexOf("<MD text={repealedWarning}"))), /line-through/);
});

test("6-Nov #17/#18: «أُلغيت … بموجب» shown, prior wording folded, warning after the fold, then the regulation", () => {
  assert.match(reader, /import \{ repealedByLine, splitRepealedArticle, splitRepealedMarker, splitStrike \} from "\.\/_repealed-article";/);
  assert.match(reader, /splitRepealedArticle\(article\.text, article\.originalText\)/);
  assert.match(reader, /const repealedText = repealedParts\?\.prior \?\? "";/);
  // Order inside the card.
  const notice = reader.indexOf("{!isLocked && repealedNotice && (");
  const toggle = reader.indexOf("<button onClick={() => setShowRepealed(!showRepealed)}");
  const fold = reader.indexOf("{showRepealed && (");
  const warning = reader.indexOf("{!isLocked && repealedWarning && (");
  const regulation = reader.indexOf('aria-label={isRTL ? "اللائحة التنفيذية" : "Executive regulation"}');
  assert.ok(notice > 0 && notice < toggle && toggle < fold && fold < warning && warning < regulation, "order");
  // The never-populated `repealedBy` line is gone (the line now comes from the text or the repeal entry).
  assert.ok(!reader.includes("article.repealedBy"));
  // Copy: the prior wording, else the notice.
  assert.match(reader, /const body = isRepealed \? repealedText \|\| repealedNotice : article\.text;/);
});

test("#26: an empty regulation row is no block (no heading over nothing)", () => {
  assert.match(reader, /const rows = \(a\.regulations \?\? \[\]\)\.filter\(\(r\) => \(r\.text \|\| ""\)\.trim\(\)\);\s*if \(rows\.length === 0\) return null;/);
  assert.match(reader, /\{viewMode !== "law" && \(mergedReg \|\| historicRegulationDetails\) && \(/);
});

test("the historic text of a repealed article stays behind the paywall", () => {
  // Inside the repealed branch: no text → a notice; locked → a blurred two-line
  // preview and the subscribe button; otherwise the full text.
  const start = reader.indexOf("{showRepealed && (");
  const end = reader.indexOf("</AnimatePresence>", start);
  assert.ok(start > 0 && end > start, "repealed branch found");
  const branch = reader.slice(start, end);
  assert.match(branch, /!repealedText \? \(/);
  assert.match(branch, /\) : isLocked \? \(\s*<div className="relative">\s*<div className="blur-\[3px\]/);
  assert.match(branch, /repealedText\.split\("\\n"\)\.slice\(0, 2\)/);
  assert.match(branch, /onClick=\{showPaywall\}/);
  // Copying a locked repealed article opens the paywall, never the text.
  assert.match(reader, /const handleCopy = useCallback\(\(\) => \{\s*if \(isLocked\) \{ showPaywall\(\); return; \}/);
});

test("decision ١٠١: the citation of a repealed article ends «ونصه قبل الإلغاء:»", () => {
  const c = buildCitation({ docTitle: "نظام العمل", docType: "نظام", numberText: "السادسة", status: "repealed" }, true);
  assert.equal(c.plain, "المادة (السادسة) الملغاة من نظام (نظام العمل) ونصه قبل الإلغاء:");
  const active = buildCitation({ docTitle: "نظام العمل", docType: "نظام", numberText: "السادسة", status: "active" }, true);
  assert.equal(active.plain, "المادة (السادسة) من نظام (نظام العمل) ونصه:");
});
