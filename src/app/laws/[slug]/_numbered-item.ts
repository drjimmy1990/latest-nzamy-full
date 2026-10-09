/**
 * _numbered-item.ts — a printed list number «N.» is part of the legal text.
 *
 * موجز-29-أ (2026-10-08): the reader's markdown parser matched «N.» list
 * items and then DROPPED the number (`replace(/^\d+\.\s+/, "")`), so 80,608
 * printed item numbers in 1,958 files never reached the reader. It also missed
 * the escaped form «N\.» (written so CommonMark does not renumber the list),
 * which then rendered as a paragraph with a visible backslash.
 *
 * This keeps the number exactly as printed (ASCII or Arabic-Indic digits),
 * drops only the markdown escape, and leaves every other line untouched.
 */
export interface NumberedItem {
  /** The digits exactly as printed, without the dot. */
  number: string;
  text: string;
}

export type NumberedItemMatch = NumberedItem;

const NUMBERED_ITEM_RE = /^([0-9]+|[٠-٩]+)\\?\.\s+/;

export function splitNumberedItem(trimmedLine: string): NumberedItem | null {
  const m = NUMBERED_ITEM_RE.exec(trimmedLine);
  if (!m) return null;
  return { number: m[1], text: trimmedLine.slice(m[0].length) };
}
