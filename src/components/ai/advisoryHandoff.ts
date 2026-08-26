import { getClientServiceById, formatClientServicePrice } from "../../lib/pricingRepository.ts";

/**
 * Owner item ١٨ / س٣ — «توصيفها كقوالب استرشادية + زر مراجعة واعتماد المحامي».
 *
 * The three tools he named (`/ai/consult`, `/ai/contract-drafter`,
 * `/ai/analyze`) produce their output from prepared templates and local
 * heuristics behind a typing animation. Presenting that as a finished legal
 * product is the fabrication this whole pass exists to remove; his ruling is
 * to relabel it as a guidance template and put the human path one click away.
 *
 * The destination is resolved from CLIENT_SERVICE_CATALOG rather than
 * hardcoded here. That catalog already owns the route, the Arabic label and
 * the price of every human service, and the admin pricing screen can change
 * them — a second copy of «٢٥٠ ر.س» in a component would go stale the first
 * time it did.
 */
export interface AdvisoryHandoff {
  /** Where «طلب التدقيق والاعتماد من محامي المكتب» goes. */
  href: string;
  /** The human service being bought, in the catalog's own words. */
  serviceLabel: string;
  /** Its price, formatted by the catalog's own formatter. */
  priceLabel: string;
}

export function resolveAdvisoryHandoff(serviceId: string): AdvisoryHandoff {
  const service = getClientServiceById(serviceId);
  return {
    // Every human service in the catalog carries a route; `general` (the
    // catalog's own fallback, returned when the id is unknown) does too, so
    // this can never produce a dead link.
    href: service.route,
    serviceLabel: service.label,
    priceLabel: formatClientServicePrice(service),
  };
}
