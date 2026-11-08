/**
 * BUG-01 (owner package 6-Nov): a wide net for internal-note text in library
 * bodies — wider than what stripArticleAuditNotes removes, on purpose. The
 * stripper only takes what is certainly a note (it runs on statutory text);
 * this flags everything that MIGHT be one, so a person can read it and the
 * owner can clean his export. Used by scripts/scan-library-audit-notes.ts
 * and the tests; never by a route.
 */
import { stripArticleAuditNotes } from "./lawPreambleBlocks.ts";

export interface SuspectNotePattern {
  name: string;
  re: RegExp;
}

/** Each pattern has /g and /u; tested on the text with tashkeel and tatweel removed. */
export const SUSPECT_NOTE_PATTERNS: readonly SuspectNotePattern[] = [
  { name: "issue-log ref «فNNNN»", re: /(?<![\p{L}\p{N}])[بو]?ف[0-9]{3,5}(?![0-9])/gu },
  { name: "«سجل المشاكل»", re: /سجل\s+المشاكل/gu },
  { name: "dated note label", re: /(?:تصحيح|ملاحظة|تنبيه|تحقق|محسوم|محدث|مصحح|استرجاع|متابعة)[^\n]{0,40}?20[0-9]{2}-[0-9]{1,2}-[0-9]{1,2}/gu },
  { name: "audit round «جولة تدقيق» / «تدقيق منهجي»", re: /جولة\s+تدقيق|تدقيق\s+منهجي/gu },
  { name: "«نفس نمط الخلل» / «فجوة تزامن» / «فجوة … محسومة»", re: /نفس\s+نمط\s+الخلل|فجوة\s+(?:ال)?تزامن|فجوة(?:\s+[^\s:*]+){0,4}?\s+محسومة/gu },
  { name: "«تنبيه توثيقي» / «لا هلوسة»", re: /تنبيه\s+توثيقي|لا\s+هلوسة/gu },
  { name: "stored-text talk «النص المخزن»", re: /(?:النص\s+)?المخزن\s+سابقا|كان\s+مخزنا/gu },
  { name: "internal field / task", re: /(?<![A-Za-z_])(?:review_reason|editorial_notes\w*|needs_human_review|status_note|number_correction_note|task_[0-9a-f]{6,})(?![A-Za-z_])/gu },
  { name: "internal id «LAW-nn-nnnn» / «ق1028-»", re: /(?<![A-Za-z])LAW-[0-9]{2}-[0-9]{4}|(?<![\p{L}])ق1028-[0-9]+/gu },
  { name: "tool name", re: /(?<![A-Za-z])(?:WebSearch|PyMuPDF|qanoniah|AMENDMENT_QUEUE|GetViewerImage|regapis|OCR|DOM)(?![A-Za-z])/gu },
  { name: "Gregorian ISO date", re: /(?<![0-9])20[0-9]{2}-[0-9]{2}-[0-9]{2}(?![0-9])/gu },
];

export interface SuspectNoteHit {
  pattern: string;
  match: string;
  /** Up to 60 characters either side, line breaks shown as ⏎. */
  context: string;
}

const MARKS = /[ً-ٰٟـ]/g;

/** Every suspect string in `text`, in pattern order. */
export function scanSuspectNotes(text: unknown): SuspectNoteHit[] {
  const folded = (typeof text === "string" ? text : "").replace(MARKS, "");
  const hits: SuspectNoteHit[] = [];
  for (const { name, re } of SUSPECT_NOTE_PATTERNS) {
    for (const m of folded.matchAll(re)) {
      const at = m.index ?? 0;
      hits.push({
        pattern: name,
        match: m[0],
        context: folded.slice(Math.max(0, at - 60), at + m[0].length + 60).replace(/\r?\n/g, "⏎"),
      });
    }
  }
  return hits;
}

/** What the wide net still finds once the reader's stripper has run. */
export function residualSuspectNotes(text: unknown): SuspectNoteHit[] {
  return scanSuspectNotes(stripArticleAuditNotes(text));
}
