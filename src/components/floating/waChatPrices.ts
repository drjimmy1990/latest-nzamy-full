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

export interface WaPrice {
  /** «٢٥٠ ر.س», «يبدأ من ٨٠٠ ر.س», «مجانا», «مشمول في الباقة», … — formatClientServicePrice. */
  text: string;
  /** The catalogue's note (e.g. a free daily question), or null. */
  note: string | null;
  /** The catalogue says this service is paid: the chat offers the payment-method step. */
  requiresPayment: boolean;
}

const UNSET: WaPrice = { text: "يتم التحديد", note: null, requiresPayment: false };

/** The price line for a catalogue service id, or «يتم التحديد» for none. */
export function waPrice(catalog: ClientServiceCatalogItem[], serviceId: string | null): WaPrice {
  if (!serviceId) return UNSET;
  const service = getClientServiceById(serviceId, catalog);
  if (service.serviceId !== serviceId) return UNSET;
  return {
    text: formatClientServicePrice(service),
    note: service.priceNote ?? null,
    requiresPayment: service.requiresPayment === true,
  };
}
