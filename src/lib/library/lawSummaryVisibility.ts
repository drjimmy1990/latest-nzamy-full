/**
 * Who sees a law's موجز and identity card (N2.1 / N2.2).
 *
 * Owner question ٢٦٠ is open: «الموجز والبطاقة للعموم أم للمشتركين؟». Until he
 * answers, both follow today's preamble rule (T28-22): SUBSCRIBERS only —
 * hasFullLibraryAccess (a Pro+ tier, an active library grant, or an admin),
 * never the per-law whitelist, which opens a law's text, not its preamble.
 *
 * ٢٦٠ is a one-line change: set LAW_SUMMARY_AUDIENCE to "everyone". Nothing
 * else moves — library.laws.summary_brief stays column-locked for the anon
 * key, because /api/library/init reads the laws list with the service role.
 * The card carries T28-22 fields (the issuing decree, dates, official links),
 * so a non-subscriber's card in the "everyone" branch drops those rows
 * (cardForViewer below) and the preamble itself stays locked as today.
 *
 * Pure: `node --test` loads it directly.
 */

import { extractLawPreambleBlocks, isHollowPreamble, type LawMetadataCard, type LawCardField } from "./lawPreambleBlocks.ts";

export type LawSummaryAudience = "subscribers" | "everyone";

/** THE flag for owner question ٢٦٠. */
export const LAW_SUMMARY_AUDIENCE: LawSummaryAudience = "subscribers";

/** May this viewer see the موجز and the card? `isSubscriber` = hasFullLibraryAccess. */
export function lawSummaryVisible(isSubscriber: boolean, audience: LawSummaryAudience = LAW_SUMMARY_AUDIENCE): boolean {
  return audience === "everyone" || isSubscriber === true;
}

/**
 * Card rows that are T28-22 official metadata: an issuing or amending
 * instrument, an issue / publication date, an official link or the gazette.
 */
const OFFICIAL_META_KEY = /أداة|قرار|مرسوم|أمر|تاريخ|نشر|المصدر الرسمي|^المصدر$|رابط|وثيقة|PDF|جريدة|أم القرى/i;
/** A value that cites an instrument by number («… بقرار وزير العدل رقم (512)»). */
const CITES_INSTRUMENT = /رقم\s*\(|م\s*\/\s*\d/;

function publicField(f: LawCardField): boolean {
  return !OFFICIAL_META_KEY.test(f.key) && !CITES_INSTRUMENT.test(f.value);
}

/** The card as this viewer may see it: whole for a subscriber, without T28-22 rows otherwise. */
export function cardForViewer(card: LawMetadataCard | null, isSubscriber: boolean): LawMetadataCard | null {
  if (!card) return null;
  if (isSubscriber) return card;
  const main = card.main.filter(publicField);
  const more = card.more.filter(publicField);
  return main.length || more.length ? { main, more } : null;
}

export interface LawReaderExtras {
  /** The preamble to display: the moved blocks removed when they are shown. */
  preamble: string;
  /** Present only when the viewer may see it. */
  summary?: string;
  summaryLabel?: string;
  metadata_card?: LawMetadataCard;
}

/**
 * The law route's موجز / card fields for one viewer, from the law part of
 * library.laws.preamble. Keys are OMITTED (not empty) when the viewer may not
 * see them; then the preamble keeps the blocks, so nothing is lost for a
 * reader who does see the preamble.
 */
export function lawReaderExtras(
  lawPreamble: string,
  isSubscriber: boolean,
  audience: LawSummaryAudience = LAW_SUMMARY_AUDIENCE,
): LawReaderExtras {
  if (!lawSummaryVisible(isSubscriber, audience)) return { preamble: lawPreamble };
  const blocks = extractLawPreambleBlocks(lawPreamble);
  // With the card and the موجز gone, what is left is often only the law's H1
  // and an empty ديباجة toggle: no box rather than one that opens on the title.
  const lifted = !!blocks.summary || !!blocks.metadataCard;
  const out: LawReaderExtras = { preamble: lifted && isHollowPreamble(blocks.rest) ? "" : blocks.rest };
  if (blocks.summary) {
    out.summary = blocks.summary;
    out.summaryLabel = blocks.summaryLabel;
  }
  const card = cardForViewer(blocks.metadataCard, isSubscriber);
  if (card) out.metadata_card = card;
  return out;
}
