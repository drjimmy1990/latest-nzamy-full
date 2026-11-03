/**
 * serviceEstimate.ts — the server's price on a client service request (S6-T5,
 * owner q327: contract review «من ٦٠٠» for individuals, «من ٨٠٠» for business).
 *
 * A service request is submitted FREE (payment amount 0 / not_required); its
 * `metadata.originalPrice` is the non-binding estimate the team quotes from
 * (dashboard/admin/service-orders). The browser used to write that figure
 * itself. POST /api/v1/service-requests now overwrites it with the
 * catalogue's price for the requester's REAL audience (profile + resolved
 * businessId), so a company cannot be recorded at the individuals' price and
 * no client can store a price of its own choosing.
 *
 * THE PRICE INTERFACE FOR CHECKOUT: the future B3 service checkout must price
 * a service request through resolveClientService (clientPricingAudience.ts) —
 * the same call this stamp makes — never from metadata the browser sent.
 *
 * Namespace (preflight R19): `metadata.service` is resolved ONLY as a
 * CLIENT_SERVICE_CATALOG id, exactly (no «طلب عام» fallback, never a
 * variant). AI order keys and AI tool ids never match, so they pass through.
 *
 * Pure, relative `.ts` imports only (node --test).
 */
import type { ClientPricingAudience, ClientServiceCatalogItem } from "../../constants/clientServiceCatalog.ts";
import { getClientServiceById } from "../pricingRepository.ts";
import { resolveClientService } from "./clientPricingAudience.ts";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** True when the stamp could act: a plain object that already carries `originalPrice`. */
export function carriesServiceEstimate(metadata: unknown): metadata is Record<string, unknown> {
  return isPlainObject(metadata) && Object.prototype.hasOwnProperty.call(metadata, "originalPrice");
}

/**
 * Overwrites `originalPrice`, `priceMode`, `priceAudience` and `quoteSource`
 * ("server") when `metadata` is a plain object that already carries
 * `originalPrice` and whose `service` names a non-variant catalogue id
 * exactly. `originalPrice` is the resolved basePrice, or 0 when the service
 * requires no payment. `priceAudience` is the audience of the PRICE (a
 * company ordering a service with no business variant gets "individual").
 * Every other input is returned unchanged.
 */
export function stampServiceEstimate(
  metadata: unknown,
  audience: ClientPricingAudience,
  catalog: ClientServiceCatalogItem[],
): unknown {
  if (!carriesServiceEstimate(metadata)) return metadata;
  const serviceId = metadata.service;
  if (typeof serviceId !== "string") return metadata;
  // Exact, non-variant id only: getClientServiceById skips variants and falls
  // back to «طلب عام», so any other id comes back as a different item.
  if (getClientServiceById(serviceId, catalog).serviceId !== serviceId) return metadata;
  const item = resolveClientService(serviceId, audience, catalog);
  return {
    ...metadata,
    originalPrice: item.requiresPayment ? item.basePrice : 0,
    priceMode: item.priceMode,
    priceAudience: item.priceAudience,
    quoteSource: "server",
  };
}
