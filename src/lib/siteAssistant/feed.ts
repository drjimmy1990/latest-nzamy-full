/**
 * feed.ts — the read-only facts «مساعد نظامي» answers from (O20 / A21, batch
 * l11-misc). It never invents a number: every price comes from the price book
 * (src/lib/pricing/priceBook.ts) — the same book /pricing, checkout and the
 * FAQ read — through its own helpers (isOnSale, offeredBillings, offeredSar,
 * activeLaunchPrice). An item that is retired or «قريباً» is never listed.
 *
 * The live parts (is online payment on, the founder campaign, this user's
 * offers) are read on the server by feedServer.ts and passed in.
 *
 * Pure (relative imports only), so node --test loads it.
 */
import {
  PRICE_BOOK,
  activeLaunchPrice,
  bookEntry,
  isOnSale,
  offeredBillings,
  offeredSar,
  topupPointsText,
  type Billing,
  type BookEntry,
} from "../pricing/priceBook.ts";

/** The plan cards /pricing shows with a book price, per audience (pricing.individuals / lawyers / firms). */
export const ASSISTANT_PLAN_IDS = Object.freeze({
  individuals: Object.freeze(["ind-ai"]),
  lawyers: Object.freeze(["lawyer-pro"]),
  firms: Object.freeze(["firm-basic", "firm-enterprise"]),
} as const);

export const ASSISTANT_LIBRARY_IDS = Object.freeze(["lib-q1", "lib-q2", "lib-annual"] as const);
export const FOUNDER_PLAN_BOOK_ID = "lawyer-founder-2026";

export interface PriceLine {
  readonly id: string;
  readonly labelAr: string;
  readonly billing: Billing;
  /** SAR before VAT, the listed price. */
  readonly sar: number;
  /** A launch price running today (charged instead of `sar`), with its last day. */
  readonly launch: { readonly sar: number; readonly endsOn: string } | null;
}

export interface TopupLine {
  readonly id: string;
  readonly sar: number;
  readonly pointsText: string;
  readonly months: number;
}

export interface PriceFeed {
  readonly individuals: readonly PriceLine[];
  readonly lawyers: readonly PriceLine[];
  readonly firms: readonly PriceLine[];
  readonly library: readonly PriceLine[];
  /** Top-ups an individual may buy / a professional may buy (the 50-point pack is in both). */
  readonly topupsIndividual: readonly TopupLine[];
  readonly topupsProfessional: readonly TopupLine[];
  /** The founder membership's book price (shown only while its campaign is live). */
  readonly founderSar: number | null;
}

function linesFor(ids: readonly string[], now: Date): PriceLine[] {
  const out: PriceLine[] = [];
  for (const id of ids) {
    const entry = bookEntry(id);
    if (!entry || !isOnSale(entry)) continue;
    for (const billing of offeredBillings(entry)) {
      const sar = offeredSar(entry, billing);
      if (sar === null) continue;
      const lp = activeLaunchPrice(entry, billing, now);
      out.push({ id, labelAr: entry.labelAr, billing, sar, launch: lp ? { sar: lp.sar, endsOn: lp.endsOn } : null });
    }
  }
  return out;
}

function topupLine(entry: BookEntry): TopupLine | null {
  const sar = offeredSar(entry, "once");
  if (sar === null) return null;
  return { id: entry.id, sar, pointsText: topupPointsText(entry, "ar"), months: entry.pointsValidityMonths ?? 0 };
}

function topupsFor(buyer: string): TopupLine[] {
  const out: TopupLine[] = [];
  for (const entry of Object.values(PRICE_BOOK)) {
    if (entry.kind !== "topup" || !isOnSale(entry)) continue;
    if (entry.buyers !== "any" && !entry.buyers.includes(buyer)) continue;
    const line = topupLine(entry);
    if (line) out.push(line);
  }
  return out.sort((a, b) => a.sar - b.sar);
}

/** The price part of the feed on `now` (launch prices are dated). */
export function buildPriceFeed(now: Date): PriceFeed {
  const founder = bookEntry(FOUNDER_PLAN_BOOK_ID);
  return Object.freeze({
    individuals: linesFor(ASSISTANT_PLAN_IDS.individuals, now),
    lawyers: linesFor(ASSISTANT_PLAN_IDS.lawyers, now),
    firms: linesFor(ASSISTANT_PLAN_IDS.firms, now),
    library: linesFor(ASSISTANT_LIBRARY_IDS, now),
    topupsIndividual: topupsFor("individual"),
    topupsProfessional: topupsFor("lawyer"),
    founderSar: founder && isOnSale(founder) ? offeredSar(founder, "once") : null,
  });
}

/** One open offer, as the offers system hands it to this user. */
export interface OfferLine {
  readonly title: string;
  readonly href: string;
  readonly endsLineAr: string | null;
  readonly seatsLineAr: string | null;
}

/** The founder campaign while it is live (seats and end from the campaign itself). */
export interface FounderLine {
  readonly seatsLeft: number | null;
  /** ISO of the first instant the campaign is over. */
  readonly endsAtExclusive: string | null;
}

export interface AssistantFeed {
  readonly prices: PriceFeed;
  /** Online payment can take a checkout for this viewer (live gateway); false = sale paused. */
  readonly saleOpen: boolean;
  /** null = not signed in (offers are per account); [] = signed in, none open. */
  readonly offers: readonly OfferLine[] | null;
  /** null = the founder campaign is not live (or could not be read). */
  readonly founder: FounderLine | null;
}
