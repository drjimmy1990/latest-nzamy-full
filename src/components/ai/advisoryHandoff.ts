import { getClientServiceById, formatClientServicePrice } from "../../lib/pricingRepository.ts";
import type { ClientServiceCatalogItem } from "../../constants/clientServiceCatalog.ts";

/**
 * Owner item ١٨ / س٣ — «توصيفها كقوالب استرشادية + زر مراجعة واعتماد المحامي».
 *
 * The three tools he named (`/ai/consult`, `/ai/contract-drafter`,
 * `/ai/analyze`) produce their output from prepared templates and local
 * heuristics behind a typing animation. Presenting that as a finished legal
 * product is the fabrication this whole pass exists to remove; his ruling is
 * to relabel it as a guidance template and put the human path one click away.
 *
 * The destination is resolved from the per-service catalogue rather than
 * hardcoded here. That catalogue owns the route, the Arabic label and the
 * price of every human service. Its truth is the admin_pricing_catalog table
 * (merged over CLIENT_SERVICE_CATALOG by /api/client-pricing — P1 design
 * note §1), so the caller passes the fetched catalogue
 * (useClientPricingCatalog): resolving from the code constant alone would make
 * an admin edit of the table silently do nothing here.
 */
export interface AdvisoryHandoff {
  /** Where «طلب التدقيق والاعتماد من محامي المكتب» goes. */
  href: string;
  /** The human service being bought, in the catalog's own words. */
  serviceLabel: string;
  /** Its price, formatted by the catalog's own formatter. */
  priceLabel: string;
}

export function resolveAdvisoryHandoff(serviceId: string, catalog?: ClientServiceCatalogItem[]): AdvisoryHandoff {
  const service = getClientServiceById(serviceId, catalog);
  return {
    // Every human service in the catalog carries a route; `general` (the
    // catalog's own fallback, returned when the id is unknown) does too, so
    // this can never produce a dead link.
    href: service.route,
    serviceLabel: service.label,
    priceLabel: formatClientServicePrice(service),
  };
}
