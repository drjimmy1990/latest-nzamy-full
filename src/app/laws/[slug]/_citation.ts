/**
 * _citation.ts — build the citation prefix that goes on the clipboard when a
 * reader copies statutory text.
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 *
 * The prefix used to be built inline in two copy handlers, roughly as:
 *
 *     "المادة (" + stripLeadingNoun(article.num) + ") من نظام (" + lawName + ") ونصه:"
 *
 * Two things are wrong with that, both measured against the delivered corpus
 * (41,462 articles across 1,532 documents), not guessed at:
 *
 *  1. IT CITES PAGES AS ARTICLES.
 *     6,566 articles (15.8%) have a `number_text` that is a page marker —
 *     "الصفحة 1", "الصفحة 2", … — because those source documents are paginated
 *     scans rather than numbered articles. The old template wrapped that
 *     verbatim, producing «المادة (الصفحة 3) من نظام (دليل السلامة) ونصه:».
 *     A page is a position in a document, not a legal locator, and a citation
 *     that says otherwise is wrong in a filing.
 *
 *  2. IT CALLS EVERY DOCUMENT A نظام.
 *     Only 526 of 1,532 documents are a نظام. 811 are لائحة تنفيذية, 165 are
 *     دليل إرشادي, 15 تعميم, plus قرار مجلس الوزراء / مرسوم ملكي / نموذج /
 *     أمر ملكي. The hardcoded noun mislabels 66% of the library.
 *
 * DESIGN RULES
 *  • Never invent a noun. If the document's kind is unknown, the noun is
 *    omitted — «من (العنوان)» — rather than defaulted to نظام (rule ق-2).
 *  • Never present a page as a locator. LOCATOR_NOUNS deliberately excludes
 *    الصفحة / صفحة / ص and their English equivalents.
 *  • Never put a NAME inside «المادة (…)». Part of `number_text` holds the
 *    instrument's title instead of a locator («اللائحة التنفيذية لنظام العمل»)
 *    or markdown heading marks («### المادة (1):») — owner test 2026-09-28
 *    produced «المادة (### المادة (1)…» and «المادة (اللائحة التنفيذية لنظام
 *    العمل) من …». The title-vs-locator decision is the reader's own
 *    (_article-label.ts, the one source of truth for the contents list), so a
 *    citation and the card header can never disagree about it.
 *  • Pure (its only import is another pure module), so it is unit-testable:
 *      node --test "src/app/laws/[slug]/_citation.test.ts"
 */

import { articleDisplayLabel, cleanNumberText, leadingOrdinal } from "../../api/library/laws/[slug]/_article-label.ts";

/**
 * Nouns that legitimately introduce a citable legal locator.
 *
 * ⚠️ الصفحة / صفحة / ص — and "Page" / "Article" — are ABSENT ON PURPOSE. An
 * earlier draft of this list included them; measured against the fiqh corpus
 * that made 10,451 blocks (24.9%) cite a page number as if it were the legal
 * locator, and against the laws corpus it affects 6,566 articles. Do not add
 * them back.
 */
export const LOCATOR_NOUNS = [
  "المادة",
  "الفقرة",
  "البند",
  "القاعدة",
  "الضابط",
  "المبدأ",
  "الملحق",
  "الجدول",
] as const;

/** A locator that is really a page position: "الصفحة 3", "صفحة ٤", "ص. 12". */
const PAGE_LOCATOR_RE =
  /^\s*(?:الصفحة|صفحة|ص\.?)\s*[\d٠-٩۰-۹]/;

/** A leading locator noun, so we never emit «المادة (المادة السادسة)». */
const LEADING_NOUN_RE = new RegExp(`^\\s*(?:${LOCATOR_NOUNS.join("|")})\\s+`);

/**
 * True when the locator names a page rather than an article. Exported so the
 * caller can decide separately (e.g. whether to offer an "add to draft" action).
 */
export function isPageLocator(value: string | null | undefined): boolean {
  return PAGE_LOCATOR_RE.test(String(value ?? ""));
}

/**
 * Document kinds seen in the corpus. Anything outside this set is treated as
 * unknown and the noun is dropped — a wrong kind is worse than none.
 */
const KNOWN_DOC_TYPES: Record<string, { ar: string; en: string }> = {
  "نظام":                { ar: "نظام",                en: "Law" },
  "نظام_ولائحة":         { ar: "نظام",                en: "Law" },
  "لائحة":               { ar: "لائحة",               en: "Regulation" },
  "لائحة تنفيذية":       { ar: "لائحة تنفيذية",       en: "Executive Regulation" },
  "قواعد":               { ar: "قواعد",               en: "Rules" },
  "ضوابط":               { ar: "ضوابط",               en: "Controls" },
  "تعليمات":             { ar: "تعليمات",             en: "Instructions" },
  "دليل":                { ar: "دليل",                en: "Guide" },
  "دليل إرشادي":         { ar: "دليل إرشادي",         en: "Guidance Manual" },
  "سياسة":               { ar: "سياسة",               en: "Policy" },
  "تعميم":               { ar: "تعميم",               en: "Circular" },
  "قرار":                { ar: "قرار",                en: "Decision" },
  "قرار مجلس الوزراء":   { ar: "قرار مجلس الوزراء",   en: "Council of Ministers Decision" },
  "مرسوم ملكي":          { ar: "مرسوم ملكي",          en: "Royal Decree" },
  "أمر ملكي":            { ar: "أمر ملكي",            en: "Royal Order" },
  "أمر سامي":            { ar: "أمر سامي",            en: "Supreme Order" },
  "نموذج":               { ar: "نموذج",               en: "Form" },
  "جداول":               { ar: "جداول",               en: "Schedules" },
};

export interface CitationSubject {
  /** Title of the containing document, as the source states it. */
  docTitle: string;
  /** The document's own kind, e.g. "لائحة تنفيذية". Unknown → noun omitted. */
  docType?: string | null;
  /** The source's own locator, e.g. "السادسة والأربعون" or "الصفحة 3". */
  numberText?: string | null;
  /** Display label to fall back on when numberText is absent, e.g. "المادة 12". */
  displayNum?: string | null;
  /** Article lifecycle status; "repealed" changes the wording. */
  status?: string | null;
  /**
   * Set when citing the executive regulation rather than the law article. Its
   * value is the regulation's own article reference, e.g. "المادة الثالثة".
   */
  regulationRef?: string | null;
  /**
   * The regulation article's own number (`article_regulations.reg_num`, e.g.
   * "5" or "1/3") — the fallback when `regulationRef` is the instrument's name
   * rather than a locator.
   */
  regulationNum?: string | null;
}

export interface Citation {
  /** Plain-text prefix, no trailing newline. */
  plain: string;
  /** Same string wrapped in <b> for the rich-text clipboard flavour. */
  html: string;
  /** How the locator was understood — useful in tests and for telemetry. */
  kind: "article" | "regulation" | "page" | "document";
}

/** The trailing "ولوائحه التنفيذية…" suffix is the reader's title, not the law's. */
function baseTitle(title: string): string {
  return String(title ?? "").replace(/\s*ولوائحه التنفيذية.*/, "").trim();
}

/** Strip surrounding brackets/parens a source sometimes wraps a locator in. */
function cleanLocator(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(LEADING_NOUN_RE, "")
    .replace(/^[([{«"']+|[)\]}»"':：\-–]+$/g, "")
    .trim();
}

/**
 * The source text as a usable locator, or "" when it is not one: heading
 * marks and the trailing colon are dropped, and a title in place of a locator
 * («اللائحة التنفيذية لنظام العمل», a heading, a sentence) is rejected.
 *
 * `articleDisplayLabel(text, 1)` keeps the text when the reader accepts it as
 * a locator and substitutes its «المادة 1» fallback when it does not — so a
 * mismatch against the cleaned text means "not a locator".
 */
export function usableLocator(value: string | null | undefined): string {
  const cleaned = cleanNumberText(value);
  if (!cleaned) return "";
  if (isPageLocator(cleaned)) return cleaned;
  if (articleDisplayLabel(cleaned, 1) !== cleaned) return "";
  // A long heading that opens with an item ordinal («ثالثًا- الأمانة العامة
  // للغرف…», accepted as a locator since 2026-10-04) is cited by the ordinal
  // alone — «المادة (ثالثًا)», as a bare «ثالثاً» always was — never with the
  // whole heading inside the parentheses.
  const ordinal = cleaned.length > 60 ? leadingOrdinal(cleaned) : null;
  return ordinal ?? cleaned;
}

/**
 * Build the citation prefix for a piece of copied legal text.
 *
 * @param subject what is being cited
 * @param isRTL   true for the Arabic UI, false for the English one
 */
export function buildCitation(subject: CitationSubject, isRTL: boolean): Citation {
  const base = baseTitle(subject.docTitle);
  const doc = subject.docType ? KNOWN_DOC_TYPES[subject.docType.trim()] : undefined;
  const isRepealed = String(subject.status ?? "") === "repealed";

  // «من نظام (X)» when the kind is known, «من (X)» when it is not.
  const ofDoc = isRTL
    ? doc ? `من ${doc.ar} (${base})` : `من (${base})`
    : doc ? `of the ${doc.en} (${base})` : `of (${base})`;

  // Trailing clause. Repealed text is historical and must say so — an attorney
  // pasting it into a filing has to see that it is no longer in force.
  const tail = isRTL
    ? isRepealed ? "ونصه قبل الإلغاء:" : "ونصه:"
    : isRepealed ? "text prior to repeal:" : "text:";

  // ── Executive regulation ───────────────────────────────────────────────────
  // `ref` is often the regulation's NAME («اللائحة التنفيذية لنظام العمل»),
  // not its article: fall back to reg_num, then to citing the regulation
  // itself — never «المادة (اللائحة التنفيذية …)».
  if (subject.regulationRef || subject.regulationNum) {
    const loc = cleanLocator(usableLocator(subject.regulationRef) || usableLocator(subject.regulationNum));
    const ofReg = isRTL
      ? `من اللائحة التنفيذية لنظام (${base})`
      : `of the Executive Regulations of (${base})`;
    const prefix = loc
      ? isRTL
        ? `المادة (${loc}) ${ofReg} ${tail}`
        : `Article (${loc}) ${ofReg}, ${tail}`
      : isRTL
        ? `${ofReg} ${tail}`
        : `${ofReg}, ${tail}`;
    return { plain: prefix, html: `<b>${prefix}</b>`, kind: "regulation" };
  }

  // The source's own locator when it is one, else the display label when THAT
  // is one, else no locator (the document is cited instead).
  const rawLocator = usableLocator(subject.numberText) || usableLocator(subject.displayNum);

  // ── Page marker — cite the position verbatim, never as an article ──────────
  if (isPageLocator(rawLocator)) {
    const pageNum = rawLocator.replace(/^\s*(?:الصفحة|صفحة|ص\.?)\s*/, "").trim();
    const prefix = isRTL
      ? `الصفحة (${pageNum}) ${ofDoc} ${tail}`
      : `Page (${pageNum}) ${ofDoc}, ${tail}`;
    return { plain: prefix, html: `<b>${prefix}</b>`, kind: "page" };
  }

  // ── No locator at all — cite the document ─────────────────────────────────
  const loc = cleanLocator(rawLocator);
  if (!loc) {
    const prefix = isRTL ? `${ofDoc} ${tail}` : `${ofDoc}, ${tail}`;
    return { plain: prefix, html: `<b>${prefix}</b>`, kind: "document" };
  }

  // ── Ordinary article ──────────────────────────────────────────────────────
  const repealedMark = isRepealed ? (isRTL ? " الملغاة" : " (repealed)") : "";
  const prefix = isRTL
    ? `المادة (${loc})${repealedMark} ${ofDoc} ${tail}`
    : `Article (${loc})${repealedMark} ${ofDoc}, ${tail}`;
  return { plain: prefix, html: `<b>${prefix}</b>`, kind: "article" };
}
