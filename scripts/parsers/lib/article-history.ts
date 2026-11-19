/**
 * article-history.ts — extract an article's historical (pre-amendment /
 * pre-repeal) text out of the `<details>` blocks in the source markdown.
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 *
 * The library stores an article's superseded text inside a collapsible
 * `<details>` block, introduced by a bolded Arabic label. parse-laws.ts read
 * NONE of it: its only amendment path was the `<!-- AMENDMENT {json} -->`
 * anchor, and real anchors carry only {type, decree, date, source} — never the
 * text. So `original_text` was always empty.
 *
 * Worse, `cleanText` never stripped `<details>`, so the superseded text was
 * concatenated into the article's LIVE `text` column — the column lawyers read
 * and the full-text index searches. Measured on the delivered corpus: 3,005
 * articles across 322 files carry a `<details>` block.
 *
 * TWO FAILURES, OPPOSITE DIRECTIONS:
 *   1. repealed text leaking INTO the live text  → wrong law shown as current
 *   2. historical text never captured at all     → article's history lost
 *
 * DESIGN NOTES (all derived from surveying the real corpus, not assumed):
 *
 * • Labels are bolded, e.g. `**النص قبل التعديل:**`, and split into two kinds:
 *     BEFORE-TEXT  — what follows IS the superseded statutory text
 *     REFERENCE    — what follows is a decree citation or a change description
 *   Treating a REFERENCE label as text would store "amended by decree X" as if
 *   it were the article's previous wording. They are separated explicitly.
 *
 * • The text appears in two shapes, both present in the corpus:
 *     inline : `> **النص قبل التعديل:** يكون هدف المركز …`
 *     block  : `**النص قبل التعديل:**` then following `>` quote lines
 *
 * • A `<details>` containing a `<!-- REGULATION -->` anchor is historic
 *   executive-regulation text, NOT article history. It is quarantined rather
 *   than mixed into the article's amendment record.
 *
 * • Anything not recognised is QUARANTINED VERBATIM and counted — never
 *   dropped, never guessed at (rules ق-2 and ق-3).
 *
 * • The label lists and summary patterns below are exported for the reader
 *   (src/app/laws/[slug]/_details-block.ts), so the site folds a `<details>`
 *   by the same wording this parser reads — one source.
 */

/** One recovered historical version of an article. */
export interface HistoryEntry {
  /** Verbatim superseded text. Never synthesised. */
  original_text: string;
  /** The literal label it was found under — provenance for review. */
  label: string;
  /** Enclosing <summary> text, when present. */
  source_summary: string;
  /** "amended" | "repealed" — inferred from the label wording only. */
  kind: "amended" | "repealed" | "unknown";
}

/**
 * One amendment card (our reply to the owner's file 18, item 3 / «خامساً» 1):
 * an `<!-- AMENDMENT {json} -->` anchor PAIRED with the text that follows it
 * up to the next anchor or the end of its `<details>`, or — for the older
 * files — a before-text with no anchor in front of it.
 *
 * Before 2026-11-20 the parser made one card from every anchor (date and
 * decree, no text) and another from every bolded before-label (text, no date):
 * نظام القضاء's «سابعاً» showed 5 cards, two of them empty, for 2 amendments.
 */
export interface AmendmentRecord {
  /** Offset in the article body; records come out in source order. */
  offset: number;
  /** The anchor's JSON. null: a before-text with no anchor in front of it (older files). */
  anchor: Record<string, unknown> | null;
  /** An anchor was there but its JSON did not parse — reported, the record keeps its text. */
  anchorUnreadable?: boolean;
  /**
   * The reference lines in the record's span («🔄 تعديل: عُدّلت الفقرة (5)
   * بموجب …»), bold and emoji removed. Never the `<summary>` heading: that is
   * the same «📜 الإصدارات السابقة» on every card.
   */
  notes: string[];
  /** The superseded texts of this one amendment, in source order (one per before-label). */
  texts: HistoryEntry[];
}

export interface HistoryResult {
  entries: HistoryEntry[];
  /** The amendment cards, in source order (see AmendmentRecord). */
  records: AmendmentRecord[];
  /**
   * Verbatim `<details>` blocks that could not be classified. Must be preserved
   * (a human reviews them later) and counted, never silently discarded.
   */
  unparsed: string[];
  /** Historic executive-regulation blocks — real content, but not article history. */
  regulationBlocks: string[];
  /**
   * ب-114 (2026-08-21): `<details>` blocks whose <summary> matches
   * LIVE_ANNEX_SUMMARY_ALLOWLIST — CURRENT live content (schedules, a
   * requirements-guide appendix) that was wrapped in <details> for display
   * collapsing only, not because it is historical. Confirmed by corpus scan:
   * 26 such blocks across "أنظمة ولوائح", e.g. the narcotics-schedule tables
   * in نظام مكافحة المخدرات. Deliberately an ALLOWLIST, not a general
   * emoji/keyword rule — council-reviewed (Codex + Antigravity): a summary
   * heuristic alone risks misclassifying a genuinely-repealed table as live,
   * or hiding a genuine live annex with different wording. Any block matching
   * BEFORE_TEXT_LABELS in its body is still routed to `entries` regardless of
   * summary — historical evidence in the body always wins.
   */
  liveAnnexes: Array<{ summary: string; content: string }>;
  /**
   * Bilingual regulations (2026-08-21, e-waste / insurance-policy files):
   * a `<details>` block whose <summary> announces an English translation of
   * this SAME article (e.g. "🇬🇧 English text — Article One: Definitions"),
   * body confirmed >70% Latin characters. Populated only when EXACTLY ONE
   * such block exists in the article — a second one, or a body that fails the
   * Latin-ratio check, is quarantined into `unparsed` instead of guessed at
   * (council review: Codex + Antigravity, ambiguity must never silently pick
   * the first match). Never indexed into the Arabic `fts` column. Arabic
   * remains authoritative per Art. 1 of the Basic Law of Governance; this is
   * a courtesy translation, not a second original.
   */
  englishText?: string;
}

/**
 * Exact <summary> strings confirmed (2026-08-21 corpus scan + manual content
 * read) to introduce CURRENT, non-historical reference content: the four
 * narcotics/precursor/plant schedule tables (نظام مكافحة المخدرات) and the
 * SFDA conformity-assessment-body requirements guide (11 sections, appearing
 * in both the merged law and its standalone regulation file). Excludes one
 * unrelated 27th block (a SDAIA document-control metadata table) that is not
 * article content at all and correctly stays quarantined.
 * Match is exact and case-sensitive on purpose: an allowlist is only as safe
 * as its specificity — do not loosen to a substring/keyword test without
 * re-running the corpus scan to prove zero false positives (Codex review).
 */
export const LIVE_ANNEX_SUMMARY_ALLOWLIST: ReadonlySet<string> = new Set<string>([
  "🎨 الملحق الفني التفصيلي لشهادات المنح وتقارير التفتيش (4-1 من الدليل)",
  "📄 البنود التفصيلية للاستعانة بجهات خارجية (2-2 من الدليل)",
  "📊 الجدول الأول: المواد المخدرة",
  "📊 الجدول الثالث: السلائف الكيميائية",
  "📊 الجدول الثاني: المؤثرات العقلية",
  "📊 الجدول الرابع: النباتات والبذور المحظورة",
  "📊 جدول المستندات المطلوبة للرخصة (2-6 من الدليل)",
  "📝 إجراءات التجديد والتحديث والتقييم الدوري من دليل المتطلبات (2-9 و 2-10 من الدليل)",
  "📝 الغرض من دليل متطلبات التعيين",
  "📝 تعاريف إضافية من دليل المتطلبات",
  "📝 تفصيل مجالات الرخصة واشتراطاتها حسب كل مجال (2-3 و 2-4 من الدليل)",
  "📝 تفصيل مجالات رخصة نشاط الاختبار من دليل المتطلبات (2-7 من الدليل)",
  "📝 ضوابط تفصيلية من دليل المتطلبات (2-1 اشتراطات عامة)",
  "📝 متطلبات إضافية لنشاط الاختبار من دليل المتطلبات (2-8 من الدليل)",
  "📝 نطاق تطبيق دليل متطلبات التعيين",
]);

// ── Labels whose following content IS the superseded statutory text ──────────
// Ordered longest-first so a specific label wins over a shorter prefix of it.
export const BEFORE_TEXT_LABELS = [
  "النص قبل الإلغاء (نص صفحة هيئة الخبراء)",
  "نص صفحة هيئة الخبراء (قبل آخر تعديل)",
  "نص المادة قبل الإلغاء",
  "ونص المادة قبل التعديل",
  "ونصها الأصلي قبل التعديل",
  "النص قبل التعديلين",
  "ونصها قبل الإلغاء",
  "ونصه قبل الإلغاء",
  "ونصها قبل التعديل",
  "النص قبل الإلغاء",
  "النص قبل التعديل",
  "النص السابق",
  "نصها قبل التعديل",
  "نصها قبل الإلغاء",
  // Discovered 2026-08-20 (ب-117): a full-article "before" quote introduced by
  // naming which historical version it is, rather than by "قبل التعديل/الإلغاء" —
  // e.g. "النص الأصلي للمادة (الصادر عام 1438هـ):" or "النص الأصلي عند صدور النظام
  // (1423هـ):". Matched by prefix like every other entry here.
  "النص الأصلي",
  // Discovered 2026-08-20 (ب-117): a sub-paragraph deletion, distinct from a
  // whole-article "before" quote — e.g. "نص الفقرة (1) المحذوفة:" or "نص
  // الفقرات الفرعية المحذوفة:". Grammatical number varies (فقرة/فقرات/فقرتين);
  // each form listed explicitly, matching this file's existing convention.
  "نص الفقرة",
  "نص الفقرات",
  "نص الفقرتين",
  // Discovered 2026-08-21 (ب-119): the four entries above were added without
  // their و-conjunction sibling, unlike every older entry in this list (e.g.
  // "نصها قبل التعديل" / "ونصها قبل التعديل" are both listed). A label
  // following a preceding reference sentence routinely takes the "و" form —
  // e.g. "...بموجب المرسوم... **ونص الفقرة (5) قبل هذا التعديل:**" — and
  // classifyLabel() matches by strict prefix, so the bare form never matches
  // it. Confirmed missing this pair specifically emptied نظام القضاء المادة
  // الأولى (two full paragraph histories lost).
  "ونص الفقرة",
  "ونص الفقرات",
  "ونص الفقرتين",
  "والنص الأصلي",
];

// ── Labels whose following content is a citation or change description ──────
// Recognised so they are NOT mistaken for statutory text, and so a block made
// up only of these is "understood but carries no text" rather than unparsed.
export const REFERENCE_LABELS = [
  "عُدّلت هذه المادة بموجب (الأحدث أولاً)",
  "أُضيفت هذه المادة بموجب",
  "عُدّلت هذه المادة بموجب",
  "عُدلت هذه المادة بموجب",
  "عُدّلت بموجب",
  "عُدلت بموجب",
  "أضيفت بموجب",
  "الإلغاء",
  "إلغاء",
  "تعديل",
  "إضافة",
  "معلومات الإضافة",
];

/**
 * Strip tashkeel (Arabic diacritics). Sources are inconsistent about them:
 * "أُضيفت" carries a combining damma while "أضيفت" does not, and comparing the
 * two without normalising silently fails. That single omission accounted for
 * most of the initially-unclassified blocks.
 *
 * Display text is never normalised — this is only for MATCHING.
 */
const TASHKEEL = /[ً-ْٰ]/g;
const stripTashkeel = (s: string): string => s.replace(TASHKEEL, "");

/** Strip emoji/symbols and collapse whitespace so labels compare reliably. */
function normalizeLabel(s: string): string {
  return s
    // Emoji, dingbats, arrows and variation selectors used decoratively.
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{2B00}-\u{2BFF}]/gu, "")
    .replace(/[:：]\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Same as normalizeLabel, plus diacritic folding — for comparisons only. */
const foldForMatch = (s: string): string => stripTashkeel(normalizeLabel(s));

/**
 * An UNBOLDED introducer line, e.g.
 *   نص المادة (3/65) قبل التعديل بقرار وزير العدل رقم (7414) وتاريخ …:
 * The superseded text follows on the next line(s). Requires the trailing colon
 * so a passing mention inside prose is not mistaken for a heading.
 */
export const UNBOLDED_BEFORE_RE =
  /^[ \t>]*((?:[^\n:]{0,120})?(?:قبل\s+التعديل|قبل\s+الإلغاء|النص\s+السابق)(?:[^\n:]{0,120})?):[ \t]*$/m;

/**
 * A sentence that merely RECORDS a change (added/amended/repealed by decree X)
 * rather than quoting the prior wording. Diacritic-folded before testing.
 */
export const REFERENCE_NOTICE_VERBS = ["اضيفت", "عدلت", "الغيت", "حذفت", "اضيف", "عدل", "الغي", "استبدلت", "نقلت"] as const;
const REFERENCE_NOTICE_RE = new RegExp(`^(${REFERENCE_NOTICE_VERBS.join("|")})\\b`);

/**
 * Summary wording that marks the block as holding a previous/historic version.
 * "حاشية"/"حواشي" (footnote/footnotes) and "النص السابق" added 2026-08-21
 * (ب-114 corpus scan): 35 of 62 unrecognised-historical blocks in أنظمة ولوائح
 * used "📜 حاشية المادة"/"📜 حواشي المادة" or a close variant as their summary —
 * real footnote/annotation content, quarantined for want of this one phrase.
 */
export const HISTORIC_SUMMARY_RE =
  /الإصدارات\s+السابقة|التعديلات\s+والإلغاءات|نص\s+تاريخي|قبل\s+الإلغاء|قبل\s+التعديل|النص\s+السابق|حاشي[ةه]|حواشي/;

/**
 * Bilingual courtesy-translation blocks (2026-08-21): a <summary> announcing
 * an English rendering of THIS article, e.g. "🇬🇧 English text — Article One:
 * Definitions". Deliberately a loose phrase match — unlike
 * LIVE_ANNEX_SUMMARY_ALLOWLIST this is gated by a content check (see
 * isPredominantlyLatin below), not relied on alone, so it can generalise
 * beyond a hand-verified list without the false-positive risk that made an
 * allowlist necessary there (council review: Codex + Antigravity).
 */
export const ENGLISH_TEXT_SUMMARY_RE = /english\s*text/i;

/** True when >70% of the letters (Latin or Arabic) in `s` are Latin. */
export function isPredominantlyLatin(s: string): boolean {
  const letters = s.match(/[A-Za-z؀-ۿ]/g);
  if (!letters || letters.length === 0) return false;
  const latin = letters.filter((c) => /[A-Za-z]/.test(c)).length;
  return latin / letters.length > 0.7;
}

/**
 * Labels routinely carry a qualifier the canonical form does not, e.g.
 *   **نص المادة قبل الإلغاء (بصيغتها المعدَّلة عام 1423هـ):**
 * so matching must be by PREFIX, not equality. BEFORE_TEXT_LABELS is ordered
 * longest-first and tested before the reference list, so a specific label always
 * wins over a shorter one it contains.
 */
function classifyLabel(raw: string): "before" | "reference" | "other" {
  const n = foldForMatch(raw);
  // Numbered variants such as "تعديل 1" / "تعديل ٢".
  const base = n.replace(/\s*[\d٠-٩]+\s*$/, "").trim();
  for (const l of BEFORE_TEXT_LABELS) {
    const f = foldForMatch(l);
    if (n.startsWith(f) || base.startsWith(f)) return "before";
  }
  for (const l of REFERENCE_LABELS) {
    const f = foldForMatch(l);
    if (n.startsWith(f) || base.startsWith(f)) return "reference";
  }
  return "other";
}

/**
 * Remove leading `>` quote markers and normalise blank lines. Every level:
 * a `<details>` inside a quoted regulation block writes its text as `> > …`
 * (نظام القضاء, «سابعاً»), and one level left a `>` at the head of the card.
 */
function unquote(s: string): string {
  return s
    .split("\n")
    .map((l) => l.replace(/^\s*(?:>\s?)+/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * The source sometimes states outright that the previous text could not be
 * recovered. That is a real, meaningful absence — recording the apology as if
 * it were statutory text would be a fabrication (rule ق-2).
 */
function isUnavailableMarker(text: string): boolean {
  return /^\s*[*_>\s]*(تعذّر|تعذر|غير متاح|لم يتم العثور|لا يتوفر)/.test(text);
}

function inferKind(label: string): HistoryEntry["kind"] {
  const n = normalizeLabel(label);
  if (n.includes("إلغاء")) return "repealed";
  if (n.includes("تعديل") || n.includes("السابق")) return "amended";
  return "unknown";
}

const DETAILS_RE = /<details[^>]*>([\s\S]*?)<\/details>/g;
const SUMMARY_RE = /<summary>([\s\S]*?)<\/summary>/;
/**
 * A bolded label, optionally preceded by a quote marker and/or an emoji.
 * Upper bound raised from 80 to 300 on 2026-08-20 (ب-117): labels routinely
 * carry a long parenthetical qualifier — e.g. "النص قبل التعديل (نهاية شروط
 * البند "أولاً"؛ لم تكن الفقرة الخاصة بشكل الشركة المساهمة موجودة، وبقية أحكام
 * المادة لم تتغير):" — that exceeded 80 characters and made the whole label
 * invisible to this regex, silently dropping the text that followed it.
 */
const LABEL_RE = /^[ \t]*>?[ \t]*(?:[^\S\n]*\S{1,3}[^\S\n]*)?\*\*([^*\n]{2,300}?)\*\*[ \t]*/gm;

/** An `<!-- AMENDMENT {json} -->` anchor: one line, like parse-laws.ts reads it. */
const AMENDMENT_ANCHOR_RE = /<!--\s*AMENDMENT\s+(.*?)\s*-->/g;

interface AnchorHit {
  offset: number;
  end: number;
  json: Record<string, unknown> | null;
}

function findAmendmentAnchors(articleBody: string): AnchorHit[] {
  const out: AnchorHit[] = [];
  AMENDMENT_ANCHOR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = AMENDMENT_ANCHOR_RE.exec(articleBody)) !== null) {
    let json: Record<string, unknown> | null = null;
    try {
      const parsed = JSON.parse(m[1]);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) json = parsed as Record<string, unknown>;
    } catch {
      json = null;
    }
    out.push({ offset: m.index, end: m.index + m[0].length, json });
  }
  return out;
}

/**
 * A reference line as a card description: «🔄 تعديل: عُدّلت الفقرة (5) بموجب …»
 * → «عُدّلت الفقرة (5) بموجب …» (a bare type word adds nothing to the card's
 * own type); «📝 عُدّلت هذه المادة بموجب: المرسوم …» keeps its label.
 */
const TYPE_ONLY_LABELS = new Set(["تعديل", "إلغاء", "الإلغاء", "إضافة", "معلومات الإضافة"].map(foldForMatch));
function noteOf(label: string, rest: string): string {
  const l = normalizeLabel(label);
  const r = unquote(rest).replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
  const base = foldForMatch(l).replace(/\s*[\d٠-٩]+\s*$/, "").trim();
  if (TYPE_ONLY_LABELS.has(base)) return r; // "" for a bare «🔄 تعديل:» heading
  return r ? `${l}: ${r}` : l;
}

/** What one stretch of a `<details>` block yields. */
interface SegmentResult {
  /** Each before-text with the reference lines that came before it. */
  items: Array<{ entry: HistoryEntry; notes: string[] }>;
  /** Reference lines with no before-text after them. */
  trailingNotes: string[];
}

interface SegmentSinks {
  unparsed: string[];
  liveAnnexes: Array<{ summary: string; content: string }>;
  englishBlocks: Array<{ whole: string; plain: string }>;
}

/**
 * Read one stretch of a `<details>` block: the whole block (no anchor in it),
 * or the part of it before the first anchor, or the part one anchor owns.
 *
 * @param body    the stretch, its `<summary>` already removed
 * @param summary the block's `<summary>` text (for the fallbacks only)
 * @param whole   what to quarantine verbatim when nothing is recognised
 * @param anchored the stretch belongs to an AMENDMENT anchor: a bare notice
 *                («عُدّلت بموجب …») then describes that anchor's card
 */
function readSegment(
  body: string,
  summary: string,
  whole: string,
  articleStatus: string | undefined,
  sinks: SegmentSinks,
  anchored = false,
): SegmentResult {
  const items: SegmentResult["items"] = [];
  let pendingNotes: string[] = [];

  // Collect every bolded label with its offset, then slice the text between
  // consecutive labels. This handles both the inline and block shapes without
  // needing a separate regex per shape.
  const labels: Array<{ raw: string; start: number; end: number; lineEnd: number }> = [];
  LABEL_RE.lastIndex = 0;
  let lm: RegExpExecArray | null;
  while ((lm = LABEL_RE.exec(body)) !== null) {
    const end = lm.index + lm[0].length;
    const nl = body.indexOf("\n", end);
    labels.push({ raw: lm[1], start: lm.index, end, lineEnd: nl === -1 ? body.length : nl });
  }

  // Reference lines («🔄 تعديل: …», «عُدّلت هذه المادة بموجب: …») are the
  // card's description, never its before-text: cut out before any fallback
  // reads the stretch as prose.
  const referenceSpans: Array<[number, number]> = [];

  // In an anchor's stretch, a bolded label this file does not know, standing
  // before the first before-label («**نصها وفق قرار مجلس الوزراء رقم (291) …:**»
  // right under the anchor), still heads real prior text. Before the pairing
  // that text rode inside the previous before-label's slice; cut at the
  // anchor it would be lost, so it is kept as one more text of this card,
  // under its own label. (Older blocks are read exactly as before.)
  const firstBefore = labels.findIndex((l) => classifyLabel(l.raw) === "before");
  let leadOtherTaken = !anchored || firstBefore === -1;

  for (let i = 0; i < labels.length; i++) {
    const kindOfLabel = classifyLabel(labels[i].raw);
    if (kindOfLabel === "other") {
      if (leadOtherTaken || i > firstBefore) continue;
      leadOtherTaken = true;
      let k = i + 1;
      while (k < labels.length && classifyLabel(labels[k].raw) === "other") k++;
      const text = unquote(body.slice(labels[i].end, k < labels.length ? labels[k].start : body.length).replace(/<!--[\s\S]*?-->/g, ""));
      if (text && !isUnavailableMarker(text)) {
        items.push({
          entry: { original_text: text, label: normalizeLabel(labels[i].raw), source_summary: summary, kind: inferKind(labels[i].raw) },
          notes: pendingNotes,
        });
        pendingNotes = [];
      }
      continue;
    }
    if (kindOfLabel === "reference") {
      const note = noteOf(labels[i].raw, body.slice(labels[i].end, labels[i].lineEnd).replace(/<!--[\s\S]*?-->/g, ""));
      if (note) pendingNotes.push(note);
      referenceSpans.push([labels[i].start, labels[i].lineEnd]);
      continue;
    }

    // The next RECOGNISED label ends this one's captured span. An
    // "other"-classified match in between is not a second label — most often
    // it is the superseded text's own bolded opening clause (a common Arabic
    // drafting convention: bolding the chapeau before a numbered list) — so
    // skip past it rather than let it prematurely truncate the capture.
    // Discovered 2026-08-20 (ب-117) via a live run that returned an empty
    // `entries[]` for an article whose full prior text was visibly present.
    let j = i + 1;
    while (j < labels.length && classifyLabel(labels[j].raw) === "other") j++;
    const sliceEnd = j < labels.length ? labels[j].start : body.length;
    const raw = body.slice(labels[i].end, sliceEnd);
    // Drop any HTML comment anchors that sit inside the captured span.
    const text = unquote(raw.replace(/<!--[\s\S]*?-->/g, ""));

    if (!text) continue;
    if (isUnavailableMarker(text)) continue; // absence is information, not text

    items.push({
      entry: {
        original_text: text,
        label: normalizeLabel(labels[i].raw),
        source_summary: summary,
        kind: inferKind(labels[i].raw),
      },
      notes: pendingNotes,
    });
    pendingNotes = [];
  }

  if (items.length > 0) {
    // A reference line after the last text still describes this amendment.
    items[items.length - 1].notes.push(...pendingNotes);
    return { items, trailingNotes: [] };
  }

  // ── Fallbacks, in descending order of explicitness ──────────────────────
  // Reached whenever no "before" label yielded captured text — even if a
  // DIFFERENT label in the same block classified as "reference" (e.g. a bare
  // "🔄 تعديل:" notice). Until 2026-08-21 this was gated on `recognised > 0`
  // (any recognised label at all, "reference" included), which skipped this
  // whole chain — including the HISTORIC_SUMMARY_RE check below — whenever a
  // block mixed a reference notice with an unrecognised "before" quote right
  // next to it (ب-119). Each step below requires a positive signal in the
  // source; none infers text from silence. Since 2026-11-20 the reference
  // lines are cut out first: «عُدّلت بموجب المرسوم …» is the card's
  // description, and it used to come back here as the article's prior text.
  let rest = body;
  for (const [s, e] of [...referenceSpans].reverse()) rest = rest.slice(0, s) + rest.slice(e);
  const plain = unquote(rest.replace(/<!--[\s\S]*?-->/g, ""));
  const notes = pendingNotes;
  const one = (entry: HistoryEntry): SegmentResult => ({ items: [{ entry, notes }], trailingNotes: [] });

  if (!plain) return { items: [], trailingNotes: notes }; // decorative/empty — nothing to record or lose

  // (1) Unbolded introducer line ending in a colon; text follows beneath it.
  const ub = plain.match(UNBOLDED_BEFORE_RE);
  if (ub) {
    const after = plain.slice((ub.index ?? 0) + ub[0].length).trim();
    if (after && !isUnavailableMarker(after)) {
      return one({ original_text: after, label: normalizeLabel(ub[1]), source_summary: summary, kind: inferKind(ub[1]) });
    }
  }

  // (2) A bare notice recording that the article was added/amended/repealed.
  //     Understood, but contains no prior wording: nothing to quarantine. In
  //     an anchor's stretch it is that card's description; in an older block
  //     it made no card before 2026-11-20 and makes none now.
  if (REFERENCE_NOTICE_RE.test(stripTashkeel(plain))) {
    const notice = plain.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
    return { items: [], trailingNotes: anchored ? [...notes, notice] : notes };
  }

  // (3) ب-114: <summary> is on the hand-verified live-annex allowlist — this
  // block is CURRENT reference content (a schedule/requirements-guide
  // section), not history, collapsed into <details> for display only. Only
  // reached once (1) and (2) above have already ruled out any historical
  // phrasing in the body itself — an allowlist hit never overrides real
  // evidence of superseded text (council review: body evidence always wins).
  if (LIVE_ANNEX_SUMMARY_ALLOWLIST.has(summary)) {
    sinks.liveAnnexes.push({ summary, content: plain });
    return { items: [], trailingNotes: notes };
  }

  // (3b) Bilingual courtesy translation: <summary> names it an English
  // rendering AND the body is confirmed >70% Latin — both signals required
  // together (council review), since the phrase alone is too weak and the
  // content check alone could misfire on an incidental Latin quotation.
  // Collected rather than pushed straight to `entries`/`liveAnnexes`: an
  // article with more than one such block is ambiguous (which one is
  // really this article's translation?) and must be quarantined below,
  // never silently resolved by picking the first match.
  if (ENGLISH_TEXT_SUMMARY_RE.test(summary) && isPredominantlyLatin(plain)) {
    sinks.englishBlocks.push({ whole: whole.trim(), plain });
    return { items: [], trailingNotes: notes };
  }

  // (4) The <summary> itself declares the block holds a previous or historic
  //     version, and the body is prose rather than a citation. The document
  //     states what the content is; taking it at its word is reading the
  //     structure, not guessing. Provenance records that the summary — not a
  //     label — is what identified it.
  if (HISTORIC_SUMMARY_RE.test(summary) && !isUnavailableMarker(plain)) {
    return one({ original_text: plain, label: `«${normalizeLabel(summary)}»`, source_summary: summary, kind: inferKind(summary) });
  }

  // (5) 2026-08-21 (تعاميم audit): the article's own anchor already declares
  // it REPEALED, and nothing above recognised this block — no "before"
  // label, no live-annex/English match, no historic-summary keyword. A
  // repealed article's live text is legitimately empty; unlike an active
  // article, unclassified substantive content here is overwhelmingly the
  // article's own former wording kept "لأغراض الأرشفة القانونية" (verified
  // against a real example: التنظيم الأساس للجنة الوطنية للتحول الرقمي,
  // 7/7 articles). Matches this field's own documented contract in
  // ParsedArticle.original_text: "For a REPEALED article this is usually
  // the entire substantive content." Never applied to active/amended
  // articles (council review: Codex + Antigravity — false-positive risk
  // for a genuinely-repealed article is low and strictly less harmful than
  // quarantining real archived text where no reader will ever see it).
  if (articleStatus === "repealed" && !isUnavailableMarker(plain)) {
    return one({
      original_text: plain,
      label: summary ? `«${normalizeLabel(summary)}» (أرشيف إلغاء)` : "نص تاريخي (ملغاة)",
      source_summary: summary,
      kind: "repealed",
    });
  }

  // Nothing matched — preserve verbatim for human review, and count it.
  sinks.unparsed.push(whole.trim());
  return { items: [], trailingNotes: notes };
}

/**
 * Extract every historical text version from an article body, and pair each
 * AMENDMENT anchor with its text (one amendment = one card).
 *
 * PAIRING (2026-11-20, our reply to the owner's file 18, «خامساً» 1): inside a
 * `<details>` block, an anchor owns everything after it up to the next anchor
 * or the end of the block — its before-texts (one card, however many
 * paragraphs) and its reference line («🔄 تعديل: …», the card's description).
 * What comes before the first anchor of a block, and every block with no
 * anchor at all, is read as before: one card per before-text, with no date or
 * decree (the older files). An anchor outside any `<details>`, or in a block
 * that holds a REGULATION anchor, stays a card of its own with no text, as
 * before. The `<summary>` heading is never a card's description.
 *
 * @param articleBody raw body between ARTICLE_START and ARTICLE_END, already
 *                    newline-normalised.
 * @param articleStatus the article's own lifecycle status, when known — used
 *                       only for the repealed-content fallback below.
 */
export function extractArticleHistory(articleBody: string, articleStatus?: string): HistoryResult {
  const entries: HistoryEntry[] = [];
  const records: AmendmentRecord[] = [];
  const unparsed: string[] = [];
  const regulationBlocks: string[] = [];
  const sinks: SegmentSinks = { unparsed, liveAnnexes: [], englishBlocks: [] };

  const anchors = findAmendmentAnchors(articleBody);
  const pairedAnchors = new Set<AnchorHit>();

  /** One card per before-text (no anchor): the older files. */
  const pushLegacy = (seg: SegmentResult, offset: number) => {
    for (const item of seg.items) {
      entries.push(item.entry);
      records.push({ offset, anchor: null, notes: item.notes, texts: [item.entry] });
    }
    // A description with no text and no anchor still says which instrument
    // changed the article: kept as a card of its own, never as a before-text.
    if (seg.trailingNotes.length > 0) records.push({ offset, anchor: null, notes: seg.trailingNotes, texts: [] });
  };

  DETAILS_RE.lastIndex = 0;
  let d: RegExpExecArray | null;

  while ((d = DETAILS_RE.exec(articleBody)) !== null) {
    const whole = d[0];
    const inner = d[1];
    const innerStart = d.index + whole.indexOf(">") + 1;

    // Historic executive-regulation text — real content, but not this article's
    // own history. Kept separately so it neither pollutes the live article text
    // nor is misfiled as a previous version of the article.
    if (/<!--\s*REGULATION\b/.test(inner)) {
      regulationBlocks.push(whole.trim());
      continue;
    }

    const summary = (inner.match(SUMMARY_RE)?.[1] ?? "").trim();
    const inside = anchors.filter((a) => a.offset >= innerStart && a.end <= innerStart + inner.length);

    if (inside.length === 0) {
      // Work on the block minus its <summary> so the summary text is never
      // mistaken for content.
      pushLegacy(readSegment(inner.replace(SUMMARY_RE, ""), summary, whole, articleStatus, sinks), d.index);
      continue;
    }

    // The part before the first anchor: read as an older block.
    const lead = inner.slice(0, inside[0].offset - innerStart);
    pushLegacy(readSegment(lead.replace(SUMMARY_RE, ""), summary, lead, articleStatus, sinks), d.index);

    for (let k = 0; k < inside.length; k++) {
      const a = inside[k];
      pairedAnchors.add(a);
      const stop = k + 1 < inside.length ? inside[k + 1].offset - innerStart : inner.length;
      const span = inner.slice(a.end - innerStart, stop);
      const seg = readSegment(span.replace(SUMMARY_RE, ""), summary, span, articleStatus, sinks, true);
      const texts = seg.items.map((item) => item.entry);
      entries.push(...texts);
      records.push({
        offset: a.offset,
        anchor: a.json,
        ...(a.json ? {} : { anchorUnreadable: true }),
        notes: [...seg.items.flatMap((item) => item.notes), ...seg.trailingNotes],
        texts,
      });
    }
  }

  // An anchor outside any <details> (or inside a regulation block): a card
  // with its date and decree and no text, exactly as before.
  for (const a of anchors) {
    if (pairedAnchors.has(a)) continue;
    records.push({ offset: a.offset, anchor: a.json, ...(a.json ? {} : { anchorUnreadable: true }), notes: [], texts: [] });
  }
  records.sort((x, y) => x.offset - y.offset);

  // Exactly one candidate: accept it. Two or more: which one is genuinely
  // this article's translation is now ambiguous, so quarantine all of them
  // verbatim instead of guessing by picking the first (council review).
  let englishText: string | undefined;
  if (sinks.englishBlocks.length === 1) {
    englishText = sinks.englishBlocks[0].plain;
  } else if (sinks.englishBlocks.length > 1) {
    for (const b of sinks.englishBlocks) unparsed.push(b.whole);
  }

  return { entries, records, unparsed, regulationBlocks, liveAnnexes: sinks.liveAnnexes, englishText };
}

/**
 * Remove every `<details>` block from an article body.
 *
 * Call AFTER extractArticleHistory. parse-precedents.ts has done this since
 * 2026-07; parse-laws.ts never did, which is why superseded text ended up in
 * the live `text` column.
 */
export function stripDetails(s: string): string {
  return s.replace(/<details[^>]*>[\s\S]*?<\/details>/g, "");
}

/**
 * ب-114 (2026-08-21): unwrap the block(s) whose `<summary>` matches
 * LIVE_ANNEX_SUMMARY_ALLOWLIST, replacing the whole `<details>…</details>`
 * with its own content as a heading + body — CURRENT reference material
 * (e.g. the narcotics-schedule tables) that was collapsed into `<details>`
 * for display only, not because it is history. Everything else is left
 * untouched for `stripDetails()` to remove as before. Call BEFORE
 * `stripDetails()` in the cleaning chain so the unwrapped content survives it.
 */
export function unwrapLiveAnnexes(s: string): string {
  return s.replace(/<details[^>]*>([\s\S]*?)<\/details>/g, (whole, inner: string) => {
    const summary = (inner.match(SUMMARY_RE)?.[1] ?? "").trim();
    if (!LIVE_ANNEX_SUMMARY_ALLOWLIST.has(summary)) return whole;
    const content = unquote(inner.replace(SUMMARY_RE, "").replace(/<!--[\s\S]*?-->/g, "")).trim();
    const heading = normalizeLabel(summary);
    return `\n\n#### ${heading}\n\n${content}\n\n`;
  });
}

/**
 * Remove the article's heading LABEL while preserving any statutory text that
 * shares the same line.
 *
 * ⚠️ Why not just delete the heading line:
 * A large part of the corpus writes the article's entire text on the heading
 * line itself, e.g.
 *
 *     ### المادة السادسة والأربعون: لا يجوز حسم أي مبلغ من راتب الموظف …
 *
 * Deleting that line would delete the law. Measured against the delivered
 * corpus, a naive "strip every heading line" empties **6,609** articles.
 *
 * So the label is removed by MATCHING IT EXPLICITLY, driven by the anchor's own
 * `number_text`, and whatever remains on the line is kept as text. If the label
 * cannot be matched, the line is left completely untouched — an unrecognised
 * heading must never cost us the sentence next to it.
 *
 * @param body       article body (newline-normalised, details already removed)
 * @param numberText the anchor's `number_text`, e.g. "السادسة والأربعون"
 */
export function stripArticleHeading(body: string, numberText: string): string {
  const lines = body.split("\n");
  const idx = lines.findIndex((l) => /^\s*#{1,6}\s+/.test(l));
  if (idx === -1) return body;

  let line = lines[idx].replace(/^\s*#{1,6}\s+/, "");

  // Strikethrough wrappers used to mark repealed articles.
  line = line.replace(/~~/g, "");
  // Inline status chips such as `[ملغاة]` / `[محذوفة]`.
  line = line.replace(/`\[[^\]]*\]`/g, "").replace(/\[(ملغاة|محذوفة|مضافة|معدلة)\]/g, "");

  const nt = (numberText || "").trim();
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Try the most specific label form first: "<noun> <number_text>" then the
  // bare number_text. A trailing colon or dash belongs to the label, not the text.
  const nouns = "المادة|الفقرة|البند|القاعدة|الضابط|الفصل|الباب|المبدأ";
  const candidates: RegExp[] = [];
  if (nt) {
    candidates.push(new RegExp(`^\\s*(?:${nouns})\\s+${esc(nt)}\\s*[:：\\-–]?\\s*`));
    candidates.push(new RegExp(`^\\s*${esc(nt)}\\s*[:：\\-–]?\\s*`));
  }
  // ك-05 (2026-08-24): "المادة (4)" — a parenthesized digit (Western or
  // Eastern-Indic) directly after the noun. Unlike the colon-gated fallback
  // below, this needs no colon to be unambiguous: real article text never
  // starts "<noun> (<digits>)" verbatim, so it's safe to strip without the
  // delimiter that the generic fallback requires. Confirmed corpus-wide
  // before writing this: 115 files / ~1,000+ articles carry this heading
  // shape with no trailing colon (e.g. "### المادة (4) `[معدّلة]`", "### المادة
  // (2)", "### المادة (1) (النطاق والهدف)") — the label was leaking verbatim
  // into the seeded article text for all of them under the old candidate set.
  candidates.push(new RegExp(`^\\s*(?:${nouns})\\s*\\([0-9\\u0660-\\u0669]+\\)\\s*`));
  // Fallback: a generic "المادة <arabic ordinal words>:" label, only when it is
  // clearly delimited by a colon — without that delimiter we cannot tell label
  // from text, and we leave the line alone.
  candidates.push(new RegExp(`^\\s*(?:${nouns})\\s+[^:：\\n]{1,60}[:：]\\s*`));

  let stripped: string | null = null;
  for (const re of candidates) {
    if (re.test(line)) {
      stripped = line.replace(re, "");
      break;
    }
  }

  // Label unrecognised → leave the line exactly as it was.
  if (stripped === null) return body;

  lines[idx] = stripped.trim();
  return lines.join("\n");
}
