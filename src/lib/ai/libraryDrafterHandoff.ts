/**
 * libraryDrafterHandoff.ts — Q485 / P1-13 «أرسل إلى الصائغ»: a library text
 * (an answer of the library researcher, or a law article) handed to the legal
 * drafter (/ai/draft) and placed in its notes field («ملاحظات ومرئيات», step 1),
 * which the drafter's run sends as `notes`.
 *
 * Same contract as transcriptHandoff.ts (and its pure build/parse are reused):
 * sessionStorage only (this tab, gone when it closes), one key, removed on
 * EVERY read, ignored after 30 minutes, cut at 100,000 characters with the cut
 * reported. A separate key and `?from=library` so a transcript (which goes to
 * «الوقائع») and a library text never land in each other's field.
 *
 * Nothing is submitted: the drafter only prefills the field and says so.
 * No `@/` imports (node --test loads it directly).
 */
import {
  buildTranscriptHandoff,
  parseTranscriptHandoff,
  type HandoffStorage,
  type TranscriptHandoff,
  type WriteHandoffResult,
} from "./transcriptHandoff.ts";

export const LIBRARY_HANDOFF_KEY = "nzamy.libraryDrafterHandoff";
export const LIBRARY_FROM_PARAM = "library";
export const DRAFTER_LIBRARY_URL = `/ai/draft?from=${LIBRARY_FROM_PARAM}`;

/** Saves the text, replacing any earlier one. */
export function writeLibraryHandoff(
  storage: HandoffStorage | null | undefined,
  text: string | null | undefined,
  sourceLabel: string | null | undefined,
  now: number = Date.now(),
): WriteHandoffResult {
  const handoff = buildTranscriptHandoff(text, sourceLabel, now);
  if (!handoff) return { ok: false, reason: "empty" };
  if (!storage) return { ok: false, reason: "storage" };
  try {
    storage.setItem(LIBRARY_HANDOFF_KEY, JSON.stringify(handoff));
    return { ok: true, truncated: handoff.truncated };
  } catch {
    return { ok: false, reason: "storage" };
  }
}

/** Removes any library handoff without reading it (the drafter opened some other way). */
export function discardLibraryHandoff(storage: HandoffStorage | null | undefined): void {
  try {
    storage?.removeItem(LIBRARY_HANDOFF_KEY);
  } catch {
    // A value we cannot remove could not be read either.
  }
}

/** Reads the handoff and removes it, whatever it holds. */
export function consumeLibraryHandoff(
  storage: HandoffStorage | null | undefined,
  now: number = Date.now(),
): TranscriptHandoff | null {
  if (!storage) return null;
  let raw: string | null = null;
  try {
    raw = storage.getItem(LIBRARY_HANDOFF_KEY);
  } catch {
    raw = null;
  }
  discardLibraryHandoff(storage);
  return parseTranscriptHandoff(raw, now);
}

/** The notes field after the handoff: appended under what is already there, never replacing it. */
export function notesWithLibraryText(current: string, handoff: Pick<TranscriptHandoff, "text" | "sourceLabel">): string {
  const block = handoff.sourceLabel ? `من ${handoff.sourceLabel}:\n${handoff.text}` : handoff.text;
  return current.trim() ? `${current.trim()}\n\n${block}` : block;
}
