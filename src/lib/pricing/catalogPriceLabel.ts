/**
 * catalogPriceLabel.ts — a client service's price as the client service
 * catalogue states it, for screens that name a price outside the catalogue's
 * own pages (Wave 1 task 6, items D and E).
 *
 * The one source is CLIENT_SERVICE_CATALOG, merged with admin_pricing_catalog
 * by GET /api/client-pricing (the DB row wins). A screen passes whichever of
 * the two it has. No number is typed anywhere else.
 *
 * Returns null when the catalogue has no such row, the row has no positive
 * price, or its mode states no amount: the caller then shows its own
 * "set after review" words, never another service's price
 * (getClientServiceById falls back to «طلب عام»).
 *
 * Pure: relative imports only, so `node --test` loads it.
 */
import type { ClientServiceCatalogItem } from "../../constants/clientServiceCatalog.ts";
import { formatClientServicePrice, getClientServiceById } from "../pricingRepository.ts";
import { resolveClientService } from "./clientPricingAudience.ts";

function priceLabelOf(service: ClientServiceCatalogItem, lang: "ar" | "en"): string | null {
  if (!(service.basePrice > 0)) return null;
  if (service.priceMode !== "fixed" && service.priceMode !== "starting_from") return null;
  if (lang === "ar") return formatClientServicePrice(service);
  const amount = `${service.basePrice.toLocaleString("en-US")} SAR`;
  return service.priceMode === "fixed" ? amount : `From ${amount}`;
}

export function catalogPriceLabel(
  serviceId: string,
  catalog: ClientServiceCatalogItem[],
  lang: "ar" | "en",
): string | null {
  const service = getClientServiceById(serviceId, catalog);
  if (service.serviceId !== serviceId) return null;
  return priceLabelOf(service, lang);
}

/**
 * S6 (q327): a PUBLIC page's price for a service that has a business variant
 * — every visitor sees both, since a guest has no audience:
 * «يبدأ من ٦٠٠ ر.س للأفراد · يبدأ من ٨٠٠ ر.س للأعمال». A service with no
 * enabled corporate variant, or one at the same price, reads exactly as
 * catalogPriceLabel. Null under the same rules as catalogPriceLabel.
 */
export function dualAudiencePriceLabel(
  serviceId: string,
  catalog: ClientServiceCatalogItem[],
  lang: "ar" | "en",
): string | null {
  const individual = catalogPriceLabel(serviceId, catalog, lang);
  if (individual === null) return null;
  const corporate = resolveClientService(serviceId, "corporate", catalog);
  if (corporate.priceAudience !== "corporate") return individual;
  const business = priceLabelOf(corporate, lang);
  if (business === null || business === individual) return individual;
  return lang === "ar"
    ? `${individual} للأفراد · ${business} للأعمال`
    : `${individual} (individuals) · ${business} (business)`;
}
