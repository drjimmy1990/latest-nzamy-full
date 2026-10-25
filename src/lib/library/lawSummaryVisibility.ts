/**
 * Who sees a law's موجز and identity card (N2.1 / N2.2).
 *
 * Owner answer ٢٦٠ (أ), 2026-10-25: the موجز and the card's public fields are
 * for EVERYONE — guests included. LAW_SUMMARY_AUDIENCE = "everyone".
 *
 * What stays as it was (nothing else opens):
 *   - the article text and its paywall (hasFullAccess / effectiveFreeLimit
 *     ١٨٤ in the law route, the server-only article tables of 20260929_01);
 *   - the ديباجة itself: the law route still sends `preamble: ''` to a
 *     non-subscriber (T28-22, its decree text);
 *   - the T28-22 rows of the card — the issuing / amending instrument, the
 *     issue and publication dates, the official links and the gazette — are
 *     subscribers' (cardForViewer below drops them for anyone else; the
 *     sidebar shows one «للمشتركين» row in their place).
 *
 * library.laws.summary_brief stays column-locked for the anon key: the
 * catalogue (/api/library/init) and the law route read it, and the preamble
 * it is cut from, with the service role and send only these fields.
 *
 * Pure: `node --test` loads it directly.
 */

import { extractLawPreambleBlocks, isHollowPreamble, type LawMetadataCard, type LawCardField } from "./lawPreambleBlocks.ts";

export type LawSummaryAudience = "subscribers" | "everyone";

/** THE flag for owner question ٢٦٠ — answered (أ): everyone. */
export const LAW_SUMMARY_AUDIENCE: LawSummaryAudience = "everyone";

/** May this viewer see the موجز and the card? `isSubscriber` = hasFullLibraryAccess. */
export function lawSummaryVisible(isSubscriber: boolean, audience: LawSummaryAudience = LAW_SUMMARY_AUDIENCE): boolean {
  return audience === "everyone" || isSubscriber === true;
}

/**
 * Card rows that are T28-22 official metadata: an issuing or amending
 * instrument, an issue / publication date, an official link or the gazette.
 */
const OFFICIAL_META_KEY = /أداة|قرار|مرسوم|أمر|تاريخ|نشر|المصدر الرسمي|^المصدر$|رابط|وثيقة|PDF|جريدة|أم القرى|آخر تعديل|آخر تحديث|الموقع الرسمي/i;

const D = "[0-9٠-٩۰-۹]";
const HIJRI_YEAR = "(?:1[34]|١[٣٤]|۱[۳۴])" + D + "{2}";
/**
 * A value that cites an instrument or dates one, whatever its key (owner ٢٦٠
 * opened the card to guests, 2026-10-26; measured on last_owner: 171 of
 * 1,583 guest cards still carried one under keys like «اللوائح المدمجة»,
 * «يحل محل», «السند النظامي»):
 *   - an instrument number: «رقم (512)», «رقم 575», «رقم ١٤١», «م/51»;
 *   - a full Hijri date, year first or day first: «1442/9/22هـ», «19/4/1446هـ»;
 *   - a link (the official pages are T28-26 subscribers' rows).
 * A bare year («لعام 1446هـ», part of many law names) is not a date here.
 */
const CITES_INSTRUMENT = new RegExp(
  [
    `رقم\\s*\\(?\\s*${D}`,
    `م\\s*\\/\\s*${D}`,
    `${HIJRI_YEAR}\\s*[\\/\\-]\\s*${D}{1,2}`,
    `${D}{1,2}\\s*[\\/\\-]\\s*${D}{1,2}\\s*[\\/\\-]\\s*${HIJRI_YEAR}`,
    // «قرار 212/1440هـ», «بالقرار 2568/1440»: a number over its year.
    `${D}+\\s*\\/\\s*${HIJRI_YEAR}`,
    // «قرار 15169651», «المرسوم 51»: an instrument word, then its number.
    `(?:قرار|مرسوم|أمر)\\S*\\s+\\(?${D}`,
    // «قرار مجلس إدارة الهيئة، صفر 1446هـ»: an instrument and its month.
    `(?:قرار|مرسوم|أمر)[^\\n]{0,60}(?:محرم|صفر|ربيع|جمادى|رجب|شعبان|رمضان|شوال|ذو القعدة|ذي القعدة|ذو الحجة|ذي الحجة)\\S*\\s+(?:\\S+\\s+)?${HIJRI_YEAR}`,
    "https?:\\/\\/",
  ].join("|"),
  "i",
);

/**
 * The document's kind is not official metadata, though «نوع الوثيقة» contains
 * «وثيقة»: 231 cards of last_owner (2026-10-25) name the type that way, and a
 * guest's card lost its type with it (owner ٢٦١: النوع is always shown).
 */
const TYPE_KEYS = new Set(["نوع التشريع", "نوع الوثيقة", "نوع المستند"]);

function publicField(f: LawCardField): boolean {
  if (CITES_INSTRUMENT.test(f.value)) return false;
  return TYPE_KEYS.has(f.key.trim()) || !OFFICIAL_META_KEY.test(f.key);
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
