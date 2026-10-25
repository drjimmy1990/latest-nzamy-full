/**
 * cardPrice.ts — what a /pricing card shows for a cycle, and which cycles the
 * toggle offers (pricing doc §2 rules 1 and 4).
 *
 *   - A card whose id is in the price book reads its price from the book
 *     (bookEntry + offeredSar), never from src/constants/pricing — the
 *     constants carry no price for those ids. So a page cannot show a price
 *     checkout does not charge.
 *   - Other cards (biz-*, providers, the firm library…) keep their display
 *     strings until their phase moves them into the book (P6).
 *   - The toggle offers the cycles the audience may buy (§2 rule 1:
 *     professionals quarterly / half / yearly; individuals monthly too) that at
 *     least one card on screen actually prices. A card the book does not sell
 *     in the chosen cycle is not shown; one-payment items (top-ups, library
 *     passes) show in every cycle.
 *
 * Pure: relative imports only, so `node --test` loads it (cardPrice.test.ts).
 */
import {
  INDIVIDUAL_CYCLES,
  PROFESSIONAL_CYCLES,
  bookEntry,
  formatSarAmount,
  isOnSale,
  offeredBillings,
  offeredSar,
  type Cycle,
} from "./priceBook.ts";
import type { AudienceTab } from "../../constants/pricing/pricing.types.ts";

/** The card fields this module reads (a subset of Plan in pricing.types.ts). */
export interface CardPriceFields {
  id: string;
  priceMonthly?: string;
  priceYearly?: string;
  periodMonthly: string;
  periodYearly: string;
  periodQuarterly?: string;
  periodSemiannual?: string;
}

const DEFAULT_PERIOD: Readonly<Record<"ar" | "en", Readonly<Record<"quarterly" | "semiannual", string>>>> = {
  ar: { quarterly: "ر.س / ٣ أشهر", semiannual: "ر.س / ٦ أشهر" },
  en: { quarterly: "SAR / 3 months", semiannual: "SAR / 6 months" },
};

function periodFor(card: CardPriceFields, cycle: Cycle, lang: "ar" | "en"): string {
  if (cycle === "monthly") return card.periodMonthly;
  if (cycle === "yearly") return card.periodYearly;
  if (cycle === "quarterly") return card.periodQuarterly ?? DEFAULT_PERIOD[lang].quarterly;
  return card.periodSemiannual ?? DEFAULT_PERIOD[lang].semiannual;
}

/** True when the card's id is a price-book entry (its price comes from the book). */
export function isBookCard(card: Pick<CardPriceFields, "id">): boolean {
  return bookEntry(card.id) !== undefined;
}

/**
 * The price and period a card shows in `cycle`, or null when the card is not
 * shown in that cycle (a book item not sold in it, or a retired one).
 */
export function cardPrice(card: CardPriceFields, cycle: Cycle, lang: "ar" | "en"): { price: string; period: string } | null {
  const entry = bookEntry(card.id);
  if (entry) {
    if (!isOnSale(entry)) return null;
    const once = offeredSar(entry, "once");
    if (once !== null) return { price: formatSarAmount(once, lang), period: card.periodMonthly };
    const sar = offeredSar(entry, cycle);
    return sar === null ? null : { price: formatSarAmount(sar, lang), period: periodFor(card, cycle, lang) };
  }
  // Not in the book: the card's own display strings, as before the toggle grew.
  const yearly = cycle === "yearly";
  const price = yearly ? card.priceYearly : card.priceMonthly;
  if (price === undefined) return null;
  return { price, period: yearly ? card.periodYearly : card.periodMonthly };
}

/** The cycles an audience may be offered (§2 rule 1). */
export function audienceCycles(audience: AudienceTab): readonly Cycle[] {
  return audience === "individuals" ? INDIVIDUAL_CYCLES : PROFESSIONAL_CYCLES;
}

/**
 * The toggle's cycles: the audience's allowed cycles that at least one book
 * card on screen sells (one-payment items do not count — they show in every
 * cycle). Empty when no card is cycle-priced by the book: the toggle is then
 * hidden and the cards show their own display strings.
 */
export function offeredCycles(audience: AudienceTab, cards: readonly Pick<CardPriceFields, "id">[]): Cycle[] {
  const priced = new Set<string>();
  for (const card of cards) {
    const entry = bookEntry(card.id);
    if (entry) for (const b of offeredBillings(entry)) priced.add(b);
  }
  return audienceCycles(audience).filter((c) => priced.has(c));
}

/**
 * The cycle the cards are drawn in: the picked one while it is offered,
 * otherwise the first offered (the audience changed, or the picked cycle has
 * no card), otherwise yearly — the cycle every legacy professional card is
 * written in (their monthly and yearly strings are the same yearly price).
 */
export function displayCycle(offered: readonly Cycle[], picked: Cycle): Cycle {
  if (offered.includes(picked)) return picked;
  return offered[0] ?? "yearly";
}
