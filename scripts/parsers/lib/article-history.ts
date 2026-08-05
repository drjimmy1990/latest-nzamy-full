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

export interface HistoryResult {
  entries: HistoryEntry[];
  /**
   * Verbatim `<details>` blocks that could not be classified. Must be preserved
   * (a human reviews them later) and counted, never silently discarded.
   */
  unparsed: string[];
  /** Historic executive-regulation blocks — real content, but not article history. */
  regulationBlocks: string[];
}

// ── Labels whose following content IS the superseded statutory text ──────────
// Ordered longest-first so a specific label wins over a shorter prefix of it.
const BEFORE_TEXT_LABELS = [
  "النص قبل الإلغاء (نص صفحة هيئة الخبراء)",
  "نص صفحة هيئة الخبراء (قبل آخر تعديل)",
  "نص المادة قبل الإلغاء",
  "ونص المادة قبل التعديل",
  "ونصها الأصلي قبل التعديل",
  "النص قبل التعديلين",
  "ونصها قبل الإلغاء",
  "ونصها قبل التعديل",
  "النص قبل الإلغاء",
  "النص قبل التعديل",
  "النص السابق",
  "نصها قبل التعديل",
  "نصها قبل الإلغاء",
];

// ── Labels whose following content is a citation or change description ──────
// Recognised so they are NOT mistaken for statutory text, and so a block made
// up only of these is "understood but carries no text" rather than unparsed.
const REFERENCE_LABELS = [
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
const UNBOLDED_BEFORE_RE =
  /^[ \t>]*((?:[^\n:]{0,120})?(?:قبل\s+التعديل|قبل\s+الإلغاء|النص\s+السابق)(?:[^\n:]{0,120})?):[ \t]*$/m;

/**
 * A sentence that merely RECORDS a change (added/amended/repealed by decree X)
 * rather than quoting the prior wording. Diacritic-folded before testing.
 */
const REFERENCE_NOTICE_RE =
  /^(اضيفت|عدلت|الغيت|حذفت|اضيف|عدل|الغي|استبدلت|نقلت)\b/;

/** Summary wording that marks the block as holding a previous/historic version. */
const HISTORIC_SUMMARY_RE = /الإصدارات\s+السابقة|التعديلات\s+والإلغاءات|نص\s+تاريخي|قبل\s+الإلغاء|قبل\s+التعديل/;

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

/** Remove leading `>` quote markers and normalise blank lines. */
function unquote(s: string): string {
  return s
    .split("\n")
    .map((l) => l.replace(/^\s*>\s?/, ""))
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
/** A bolded label, optionally preceded by a quote marker and/or an emoji. */
const LABEL_RE = /^[ \t]*>?[ \t]*(?:[^\S\n]*\S{1,3}[^\S\n]*)?\*\*([^*\n]{2,80}?)\*\*[ \t]*/gm;

/**
 * Extract every historical text version from an article body.
 *
 * @param articleBody raw body between ARTICLE_START and ARTICLE_END, already
 *                    newline-normalised.
 */
export function extractArticleHistory(articleBody: string): HistoryResult {
  const entries: HistoryEntry[] = [];
  const unparsed: string[] = [];
  const regulationBlocks: string[] = [];

  DETAILS_RE.lastIndex = 0;
  let d: RegExpExecArray | null;

  while ((d = DETAILS_RE.exec(articleBody)) !== null) {
    const whole = d[0];
    const inner = d[1];

    // Historic executive-regulation text — real content, but not this article's
    // own history. Kept separately so it neither pollutes the live article text
    // nor is misfiled as a previous version of the article.
    if (/<!--\s*REGULATION\b/.test(inner)) {
      regulationBlocks.push(whole.trim());
      continue;
    }

    const summary = (inner.match(SUMMARY_RE)?.[1] ?? "").trim();
    // Work on the block minus its <summary> so the summary text is never
    // mistaken for content.
    const body = inner.replace(SUMMARY_RE, "");

    // Collect every bolded label with its offset, then slice the text between
    // consecutive labels. This handles both the inline and block shapes without
    // needing a separate regex per shape.
    const labels: Array<{ raw: string; start: number; end: number }> = [];
    LABEL_RE.lastIndex = 0;
    let lm: RegExpExecArray | null;
    while ((lm = LABEL_RE.exec(body)) !== null) {
      labels.push({ raw: lm[1], start: lm.index, end: lm.index + lm[0].length });
    }

    let recognised = 0;
    let capturedFromLabel = false;

    for (let i = 0; i < labels.length; i++) {
      const kindOfLabel = classifyLabel(labels[i].raw);
      if (kindOfLabel === "other") continue;
      recognised++;
      if (kindOfLabel !== "before") continue;

      const sliceEnd = i + 1 < labels.length ? labels[i + 1].start : body.length;
      const raw = body.slice(labels[i].end, sliceEnd);
      // Drop any HTML comment anchors that sit inside the captured span.
      const text = unquote(raw.replace(/<!--[\s\S]*?-->/g, ""));

      if (!text) continue;
      if (isUnavailableMarker(text)) continue; // absence is information, not text

      capturedFromLabel = true;
      entries.push({
        original_text: text,
        label: normalizeLabel(labels[i].raw),
        source_summary: summary,
        kind: inferKind(labels[i].raw),
      });
    }

    if (capturedFromLabel || recognised > 0) continue;

    // ── Fallbacks, in descending order of explicitness ──────────────────────
    // Reached only when the block carries no recognised BOLDED label. Each step
    // requires a positive signal in the source; none infers text from silence.
    const plain = unquote(body.replace(/<!--[\s\S]*?-->/g, ""));

    if (!plain) continue; // decorative/empty block — nothing to record or lose

    // (1) Unbolded introducer line ending in a colon; text follows beneath it.
    const ub = plain.match(UNBOLDED_BEFORE_RE);
    if (ub) {
      const after = plain.slice((ub.index ?? 0) + ub[0].length).trim();
      if (after && !isUnavailableMarker(after)) {
        entries.push({
          original_text: after,
          label: normalizeLabel(ub[1]),
          source_summary: summary,
          kind: inferKind(ub[1]),
        });
        continue;
      }
    }

    // (2) A bare notice recording that the article was added/amended/repealed.
    //     Understood, but contains no prior wording — nothing to quarantine.
    if (REFERENCE_NOTICE_RE.test(stripTashkeel(plain))) continue;

    // (3) The <summary> itself declares the block holds a previous or historic
    //     version, and the body is prose rather than a citation. The document
    //     states what the content is; taking it at its word is reading the
    //     structure, not guessing. Provenance records that the summary — not a
    //     label — is what identified it.
    if (HISTORIC_SUMMARY_RE.test(summary) && !isUnavailableMarker(plain)) {
      entries.push({
        original_text: plain,
        label: `«${normalizeLabel(summary)}»`,
        source_summary: summary,
        kind: inferKind(summary),
      });
      continue;
    }

    // Nothing matched — preserve verbatim for human review, and count it.
    unparsed.push(whole.trim());
  }

  return { entries, unparsed, regulationBlocks };
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
