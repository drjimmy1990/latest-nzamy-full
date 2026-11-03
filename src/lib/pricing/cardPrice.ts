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
 *   - A launch price (owner ٣٠٣) is shown only from the SERVER's answer
 *     (GET /api/v1/pricing/launch, read after mount): the listed price struck
 *     through and the launch price beside it. The browser's clock decides
 *     nothing, and a server-rendered card never carries a launch price, so a
 *     cached page cannot show one after the campaign ends.
 *   - Backlog UX14: next to the button, what the buyer pays with VAT and for
 *     which cycle — the same arithmetic as checkout's quote.
 *
 * Pure: relative imports only, so `node --test` loads it (cardPrice.test.ts).
 */
import {
  BILLING_LABEL_AR,
  BILLING_LABEL_EN,
  INDIVIDUAL_CYCLES,
  PROFESSIONAL_CYCLES,
  bookEntry,
  formatSarAmount,
  isOnSale,
  offeredBillings,
  offeredSar,
  type Billing,
  type Cycle,
} from "./priceBook.ts";
import { VAT_PERCENT } from "../payments/catalog.ts";
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

// ── launch prices (owner ٣٠٣) and the VAT total (UX14) ─────────────────────

/** GET /api/v1/pricing/launch's `prices`: `id:billing` → the running launch price. */
export type LaunchPriceMap = Readonly<Record<string, { readonly sar: number; readonly listSar: number }>>;

/** The billing a card is bought in from the toggle's cycle: one payment for top-ups and passes. */
function cardBilling(id: string, cycle: Cycle): Billing | null {
  const entry = bookEntry(id);
  if (!entry || !isOnSale(entry)) return null;
  if (offeredSar(entry, "once") !== null) return "once";
  return offeredSar(entry, cycle) !== null ? cycle : null;
}

/** The server's launch price for (id, billing) when it still matches the book's listed price. */
function launchSarFor(id: string, billing: Billing, launch: LaunchPriceMap | null): { sar: number; listSar: number } | null {
  if (!launch) return null;
  const key = `${id}:${billing}`;
  const lp = Object.hasOwn(launch, key) ? launch[key] : undefined;
  const listSar = offeredSar(bookEntry(id)!, billing);
  if (!lp || listSar === null || lp.listSar !== listSar) return null;
  if (!Number.isSafeInteger(lp.sar) || lp.sar <= 0 || lp.sar >= listSar) return null;
  return { sar: lp.sar, listSar };
}

/**
 * The struck-through original and the launch price a card shows in `cycle`,
 * or null. Only a book card, only from the server's map, and only when the
 * map's listed price is the book's own (a stale answer from before a price
 * change shows nothing rather than a wrong pair).
 */
export function cardLaunch(
  card: Pick<CardPriceFields, "id">,
  cycle: Cycle,
  launch: LaunchPriceMap | null,
  lang: "ar" | "en",
): { price: string; original: string } | null {
  const billing = cardBilling(card.id, cycle);
  const lp = billing ? launchSarFor(card.id, billing, launch) : null;
  return lp ? { price: formatSarAmount(lp.sar, lang), original: formatSarAmount(lp.listSar, lang) } : null;
}

/** 28635 halalas → «٢٨٦٫٣٥» / "286.35"; whole riyals drop the fraction. */
function halalasText(h: number, lang: "ar" | "en"): string {
  const sar = formatSarAmount(Math.floor(h / 100), lang);
  const rest = h % 100;
  if (rest === 0) return sar;
  const frac = String(rest).padStart(2, "0");
  return lang === "en" ? `${sar}.${frac}` : `${sar}٫${frac.replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)])}`;
}

/**
 * UX14: «الإجمالي شامل الضريبة ٢٨٦٫٣٥ ر.س · سنوي» for a book card in
 * `cycle` — the net (the launch price when the server's map names one) plus
 * 15 % VAT rounded to the halala, as catalog.quote charges it. null for a
 * card the book does not price (sales quotes, display-only cards).
 */
export function cardTotalWithVat(
  card: Pick<CardPriceFields, "id">,
  cycle: Cycle,
  launch: LaunchPriceMap | null,
  lang: "ar" | "en",
): string | null {
  const billing = cardBilling(card.id, cycle);
  if (!billing) return null;
  const netSar = launchSarFor(card.id, billing, launch)?.sar ?? offeredSar(bookEntry(card.id)!, billing)!;
  const net = netSar * 100;
  const total = net + Math.round((net * VAT_PERCENT) / 100);
  return lang === "en"
    ? `Total incl. VAT: SAR ${halalasText(total, "en")} · ${BILLING_LABEL_EN[billing]}`
    : `الإجمالي شامل الضريبة ${halalasText(total, "ar")} ر.س · ${BILLING_LABEL_AR[billing]}`;
}
