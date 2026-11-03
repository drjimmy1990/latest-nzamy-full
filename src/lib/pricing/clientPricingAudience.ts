/**
 * clientPricingAudience.ts — which audience a client-service price is for,
 * and the price of a service for that audience (S6, owner q327: a specialist
 * lawyer's contract review is «من ٦٠٠» for individuals, «من ٨٠٠» for business).
 *
 * admin_pricing_catalog keys rows by service_id (its primary key), so a
 * business price lives in its own VARIANT row/item: `variantOf` names the base
 * service and `audience` is "corporate" (migration 20261103_20,
 * `contract-review-business`). resolveClientService is the ONE place a
 * variant's price is applied; the future B3 service checkout must call it.
 *
 * Namespace rule (preflight R19): the ids here are HUMAN-service ids of
 * CLIENT_SERVICE_CATALOG / admin_pricing_catalog. Never resolve an AI tool id
 * (AI_TOOLS / ai_runs.tool — e.g. the AI tool `contract-review`, paid in
 * points) through this module, and never resolve these ids as AI tools.
 *
 * Pure, relative `.ts` imports only (node --test).
 */
import type { ClientPricingAudience, ClientServiceCatalogItem } from "../../constants/clientServiceCatalog.ts";
import { getClientServiceById } from "../pricingRepository.ts";

export type { ClientPricingAudience };

/**
 * The business price applies to a company account (`corporate`) and to any
 * request filed in a company's name (a resolved businessId). `micro` accounts
 * cannot reach the client intake (routeAccess.ts) and are left out on purpose.
 */
export function clientPricingAudience(input: {
  userType: string | null | undefined;
  hasBusinessScope: boolean;
}): ClientPricingAudience {
  return input.userType === "corporate" || input.hasBusinessScope ? "corporate" : "individual";
}

/**
 * The audience the SERVER prices a request for (POST /api/v1/service-requests).
 * A resolved business scope (businessId from active membership) is corporate
 * whatever the profile says. Otherwise the profile decides — and when its read
 * FAILED the audience is unknown (null): the caller must not stamp a price,
 * since "individual" would label a company's request «أفراد» (review M1).
 */
export function requestPricingAudience(input: {
  userType: string | null | undefined;
  profileReadFailed: boolean;
  hasBusinessScope: boolean;
}): ClientPricingAudience | null {
  if (input.hasBusinessScope) return "corporate";
  if (input.profileReadFailed) return null;
  return clientPricingAudience({ userType: input.userType, hasBusinessScope: false });
}

/**
 * The service `serviceId` as the given audience pays for it.
 *  - corporate, with an enabled variant (`variantOf === serviceId`,
 *    `audience === "corporate"`): the BASE item (its id, route, label,
 *    request type…) carrying the variant's basePrice, priceMode, priceNote and
 *    requiresPayment; priceAudience "corporate".
 *  - otherwise: getClientServiceById (with its «طلب عام» fallback);
 *    priceAudience "individual".
 */
export function resolveClientService(
  serviceId: string,
  audience: ClientPricingAudience,
  catalog: ClientServiceCatalogItem[],
): ClientServiceCatalogItem & { priceAudience: ClientPricingAudience } {
  const base = getClientServiceById(serviceId, catalog);
  if (audience === "corporate") {
    const variant = catalog.find(
      (s) => s.variantOf === serviceId && s.audience === "corporate" && s.enabled !== false,
    );
    if (variant && base.serviceId === serviceId) {
      return {
        ...base,
        basePrice: variant.basePrice,
        priceMode: variant.priceMode,
        priceNote: variant.priceNote,
        requiresPayment: variant.requiresPayment,
        priceAudience: "corporate",
      };
    }
  }
  return { ...base, priceAudience: "individual" };
}
