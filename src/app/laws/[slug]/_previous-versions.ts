/**
 * «الإصدارات السابقة» — which previous-version cards the reader shows.
 *
 * Owner package 10-06 (gap analysis §4): an amended article's history listed
 * cards with an empty body — an amendment row with no summary and no text
 * still drew a frame, and for a non-subscriber (amending instrument and date
 * withheld, T28-22) the card held only the lock line. A card is shown only
 * when it has something to read:
 *   • a summary or a version text, or
 *   • the amending instrument or its date (when they are not withheld).
 * Fields are trimmed; a whitespace-only field is empty.
 *
 * Pure, no imports: `node --test` loads it (_previous-versions.test.ts).
 */

export interface AmendmentLike {
  date?: string | null;
  source?: string | null;
  sourceLocked?: boolean;
  summary?: string | null;
  fullText?: string | null;
}

export interface PreviousVersionCard {
  /** The amending instrument; '' when unknown or withheld. */
  source: string;
  /** Its date; '' when unknown or withheld. */
  date: string;
  summary: string;
  fullText: string;
  /** The instrument and date exist but are withheld from this viewer. */
  sourceLocked: boolean;
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** The cards worth showing, in the API's order. Never throws. */
export function visibleAmendments(list: ReadonlyArray<AmendmentLike> | null | undefined): PreviousVersionCard[] {
  if (!Array.isArray(list)) return [];
  const cards: PreviousVersionCard[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const sourceLocked = entry.sourceLocked === true;
    const card: PreviousVersionCard = {
      source: sourceLocked ? "" : clean(entry.source),
      date: sourceLocked ? "" : clean(entry.date),
      summary: clean(entry.summary),
      fullText: clean(entry.fullText),
      sourceLocked,
    };
    const hasBody = card.summary !== "" || card.fullText !== "";
    const hasInstrument = card.source !== "" || card.date !== "";
    if (hasBody || hasInstrument) cards.push(card);
  }
  return cards;
}
