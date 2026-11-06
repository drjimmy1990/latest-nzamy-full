/**
 * serviceEstimate.ts — the server's price on a client service request (S6-T5,
 * owner q327: contract review «من ٦٠٠» for individuals, «من ٨٠٠» for business).
 *
 * A service request is submitted FREE (payment amount 0 / not_required); its
 * `metadata.originalPrice` is the non-binding estimate the team quotes from
 * (dashboard/admin/service-orders). The browser used to write that figure
 * itself. POST /api/v1/service-requests now overwrites it with the
 * catalogue's price for the requester's REAL audience (profile + resolved
 * businessId) whenever `metadata.service` is a client-service CATALOGUE id:
 * for those ids a company cannot be recorded at the individuals' price, and
 * the browser cannot choose the stored figure. For any other service the
 * browser's figure stays, but it is never marked as the server's: the stamp
 * strips a body-sent `priceAudience` and `quoteSource: "server"`, and the
 * admin queue prints an estimate only when `quoteSource === "server"`
 * (estimateLine.ts) — fix round 1, review I-1/I-2.
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
 * Only the server marks an estimate as its own. A plain object the stamp does
 * not price loses a body-sent `priceAudience` and a `quoteSource` of
 * "server"; any other key (including a browser `quoteSource` such as
 * "backend") stays. Returns the same object when there is nothing to strip.
 */
function withoutServerMarks(metadata: Record<string, unknown>): Record<string, unknown> {
  const forgedAudience = Object.prototype.hasOwnProperty.call(metadata, "priceAudience");
  const forgedSource = metadata.quoteSource === "server";
  if (!forgedAudience && !forgedSource) return metadata;
  const out = { ...metadata };
  delete out.priceAudience;
  if (forgedSource) delete out.quoteSource;
  return out;
}

/**
 * Overwrites `originalPrice`, `priceMode`, `priceAudience` and `quoteSource`
 * ("server") when `metadata` is a plain object that already carries
 * `originalPrice`, whose `service` names a non-variant catalogue id exactly,
 * and the requester's audience is known. `originalPrice` is the resolved
 * basePrice, or 0 when the service requires no payment. `priceAudience` is
 * the audience of the PRICE (a company ordering a service with no business
 * variant gets "individual").
 *
 * `audience` null = unknown (the profile read failed and no business scope
 * resolved, review M1): no stamp, so the queue shows no estimate rather than
 * the individuals' price under an «أفراد» label.
 *
 * Any other plain object is returned without the server's marks (see
 * withoutServerMarks); a non-object is returned as is.
 */
export function stampServiceEstimate(
  metadata: unknown,
  audience: ClientPricingAudience | null,
  catalog: ClientServiceCatalogItem[],
): unknown {
  if (!isPlainObject(metadata)) return metadata;
  const serviceId = metadata.service;
  if (
    audience === null ||
    !carriesServiceEstimate(metadata) ||
    typeof serviceId !== "string" ||
    // Exact, non-variant id only: getClientServiceById skips variants and
    // falls back to «طلب عام», so any other id comes back as another item.
    getClientServiceById(serviceId, catalog).serviceId !== serviceId
  ) {
    return withoutServerMarks(metadata);
  }
  const item = resolveClientService(serviceId, audience, catalog);
  return {
    ...metadata,
    originalPrice: item.requiresPayment ? item.basePrice : 0,
    priceMode: item.priceMode,
    priceAudience: item.priceAudience,
    quoteSource: "server",
  };
}
