/**
 * waChatPrices.ts — what the floating WhatsApp chat says about price (owner
 * answers of 25 Oct 2026, P7; pricing doc §13ب.1). It used to hard-code
 * 50 / 700 / 150 / 499 in StepPayment.tsx and StepConsult.tsx — numbers no
 * page or checkout charged. Now every price line comes from the same source
 * as the pages:
 *   - per-service prices: the client service catalogue merged with
 *     admin_pricing_catalog (GET /api/client-pricing →
 *     mergeAdminPricingCatalogRows; useClientPricingCatalog in the component),
 *     which is the truth for per-service prices
 *     (docs/plans/2026-10-26-P1-price-book-design.md §1);
 *   - plans and top-ups: the price book (src/lib/pricing/priceBook.ts). The
 *     chat names no plan or top-up price today; if it ever does, it reads
 *     bookPriceText, never a literal.
 * Whether the chat asks for a payment method follows the catalogue's
 * `requiresPayment`, not the wording of the price line. The VAT sentence is
 * the platform's one notice (vatNotice.ts).
 *
 * «مشمول في الباقة» (price mode `included`) is true only for a subscriber
 * whose plan includes the service. The chat is shown to guests and to every
 * client and does not know the viewer's plan, so it never says it to them
 * (P7 review, finding 6): an included service shows its catalogue price for
 * a viewer without the plan — the same formatClientServicePrice of the
 * entry's basePrice — or «يُحدَّد بعد المراجعة» when the catalogue has no
 * price for it. A caller that KNOWS the viewer's plan includes it passes
 * `viewerIncluded: true`. No number is typed here.
 *
 * waChatPrices.test.ts fails on any digit followed by «ر.س» in the two step
 * components, so a literal price cannot come back.
 *
 * Pure: relative imports only, so `node --test` loads it.
 */

import type { ClientServiceCatalogItem } from "../../constants/clientServiceCatalog.ts";
import {
  formatClientServicePrice,
  getClientServiceById,
  getConsultationModeServiceId,
} from "../../lib/pricingRepository.ts";
import { VAT_NOTICE } from "../../lib/pricing/vatNotice.ts";

/** The platform's VAT sentence (§13ب.2). */
export const WA_VAT_NOTICE_AR: string = VAT_NOTICE.exclusive.ar;

/** The catalogue service a consultation choice in the chat orders. */
export function consultServiceId(provider: string | undefined, modality: string | undefined): string | null {
  if (provider === "ai") return "ai-consult";
  if (provider === "lawyer") return getConsultationModeServiceId(modality === "person" ? "in-person" : (modality ?? "video"));
  return null;
}

/** The catalogue service a contract choice in the chat orders. */
export function contractServiceId(contractService: string | undefined): string | null {
  if (contractService === "ai-review") return "contract-analyze";
  if (contractService === "lawyer-review") return "contract-review";
  return null;
}

/** The service the chat's selections add up to (a consultation choice first), or null. */
export function waServiceId(selections: Record<string, string>): string | null {
  return consultServiceId(selections.provider, selections.modality) ?? contractServiceId(selections.contractService);
}

/** An included service with no catalogue price, for a viewer without the plan. */
export const WA_PRICE_AFTER_REVIEW_AR = "يُحدَّد بعد المراجعة";

export interface WaPrice {
  /** «٢٥٠ ر.س», «يبدأ من ٨٠٠ ر.س», «مجانا», «مشمول في الباقة» (subscribers only), … — formatClientServicePrice. */
  text: string;
  /** The catalogue's note (e.g. a free daily question), or null. */
  note: string | null;
  /** The catalogue says this service is paid: the chat offers the payment-method step. */
  requiresPayment: boolean;
  /** The line names an amount (the VAT sentence goes with it). */
  showsAmount: boolean;
}

const UNSET: WaPrice = { text: "يتم التحديد", note: null, requiresPayment: false, showsAmount: false };

const AMOUNT_MODES = new Set(["fixed", "starting_from", "per_page"]);

/**
 * The price line for a catalogue service id, or «يتم التحديد» for none. An
 * `included` service reads «مشمول في الباقة» only with `viewerIncluded`;
 * otherwise its catalogue price as a fixed amount, or «يُحدَّد بعد المراجعة».
 */
export function waPrice(
  catalog: ClientServiceCatalogItem[],
  serviceId: string | null,
  opts: { viewerIncluded?: boolean } = {},
): WaPrice {
  if (!serviceId) return UNSET;
  const service = getClientServiceById(serviceId, catalog);
  if (service.serviceId !== serviceId) return UNSET;
  const base = {
    note: service.priceNote ?? null,
    requiresPayment: service.requiresPayment === true,
  };
  if (service.priceMode === "included" && opts.viewerIncluded !== true) {
    const priced = Number.isFinite(service.basePrice) && service.basePrice > 0;
    return {
      ...base,
      text: priced ? formatClientServicePrice({ basePrice: service.basePrice, priceMode: "fixed" }) : WA_PRICE_AFTER_REVIEW_AR,
      showsAmount: priced,
    };
  }
  return { ...base, text: formatClientServicePrice(service), showsAmount: AMOUNT_MODES.has(service.priceMode) };
}
