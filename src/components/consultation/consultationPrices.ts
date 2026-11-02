/**
 * consultationPrices.ts — the price each /book/consultation type shows (Wave 1
 * task 6, item D).
 *
 * The page used to print «٢٩٩ ر.س» for a voice or video call and «٥٩٩ ر.س»
 * in person, while the client service catalogue says 500 and 700. A booking
 * charges nothing: useConsultationForm writes payment { amount: 0, status:
 * "not_required" } and the team quotes afterwards; the price string travels
 * into the request only as the non-binding estimate (intake.estimatedPrice).
 * So the one source to show is the catalogue the rest of the client side
 * reads — CLIENT_SERVICE_CATALOG merged with admin_pricing_catalog by GET
 * /api/client-pricing (useClientPricingCatalog) — through the same mapping
 * the consultation wizard and the WhatsApp chat use
 * (getConsultationModeServiceId: voice and video → video-full, in-person →
 * in-person). No number is typed here.
 *
 * The AI type has no price (q327, owner package of 1 Nov 2026): «يُحدَّد بعد
 * المراجعة».
 *
 * Pure: relative imports only, so `node --test` loads it.
 */
import type { ClientServiceCatalogItem } from "../../constants/clientServiceCatalog.ts";
import {
  formatClientServicePrice,
  getClientServiceById,
  getConsultationModeServiceId,
} from "../../lib/pricingRepository.ts";
import type { ConsultationType, TypeDef } from "./constants.ts";

export const PRICE_AFTER_REVIEW = { ar: "يُحدَّد بعد المراجعة", en: "Set after review" } as const;

/** The catalogue service a booking type is priced by, or null for the AI type. */
export function consultationServiceId(type: ConsultationType): string | null {
  if (type === "ai") return null;
  return getConsultationModeServiceId(type);
}

/** «٥٠٠ ر.س» / "500 SAR" from the catalogue, or «يُحدَّد بعد المراجعة». */
export function consultationTypePrice(
  type: ConsultationType,
  catalog: ClientServiceCatalogItem[],
  lang: "ar" | "en",
): string {
  const id = consultationServiceId(type);
  if (!id) return PRICE_AFTER_REVIEW[lang];
  const service = getClientServiceById(id, catalog);
  // getClientServiceById falls back to «طلب عام»; never show its price here.
  if (service.serviceId !== id || !(service.basePrice > 0)) return PRICE_AFTER_REVIEW[lang];
  if (lang === "ar") {
    return service.priceMode === "fixed" || service.priceMode === "starting_from"
      ? formatClientServicePrice(service)
      : PRICE_AFTER_REVIEW.ar;
  }
  const amount = `${service.basePrice.toLocaleString("en-US")} SAR`;
  if (service.priceMode === "fixed") return amount;
  if (service.priceMode === "starting_from") return `From ${amount}`;
  return PRICE_AFTER_REVIEW.en;
}

/** The type cards with the catalogue's price in place of whatever they carried. */
export function withCatalogPrices(types: TypeDef[], catalog: ClientServiceCatalogItem[], lang: "ar" | "en"): TypeDef[] {
  return types.map((t) => ({ ...t, price: consultationTypePrice(t.id, catalog, lang) }));
}
