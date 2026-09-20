import { normalizeSearch } from '../../../../utils/normalizeArabic.ts';

/** A hard UTF-16 length cap, including omission markers, for search previews. */
export function truncateWithHighlight(
  text: string | null,
  terms: string[],
  maxLength: number,
): string {
  if (!text || !Number.isSafeInteger(maxLength) || maxLength <= 0) return '';
  if (text.length <= maxLength) return text;

  const firstTerm = terms.length > 0 ? normalizeSearch(terms[0]) : '';
  const normalized = normalizeSearch(text);
  const normalizedIndex = firstTerm ? normalized.indexOf(firstTerm) : -1;
  // normalizeSearch trims the ends; account for leading whitespace before
  // using its match offset in the unmodified source string.
  const leadingWhitespace = text.length - text.trimStart().length;
  const matchIndex = normalizedIndex < 0 ? -1 : normalizedIndex + leadingWhitespace;

  // Reserve one character for each possible omission marker. In particular,
  // a user-supplied term longer than the preview must not expand the preview.
  const bodyLimit = Math.max(1, maxLength - 2);
  const preferredStart = matchIndex < 0
    ? 0
    : Math.max(0, matchIndex - Math.floor(bodyLimit / 3));
  const start = Math.min(preferredStart, Math.max(0, text.length - bodyLimit));
  const end = Math.min(text.length, start + bodyLimit);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return `${prefix}${text.slice(start, end)}${suffix}`.slice(0, maxLength);
}
