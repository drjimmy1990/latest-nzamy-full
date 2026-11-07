import {
  CLIENT_SERVICE_CATALOG,
  CLIENT_SERVICE_CATEGORIES,
  type ClientServiceCatalogItem,
  type ClientServiceCategory,
  type ClientServiceCategoryId,
  type ClientServicePriceMode,
  // Relative + explicit .ts, not the `@/` alias: this module is now covered by
  // unit tests, and the `node --test` runner strips types without resolving
  // tsconfig paths — an aliased VALUE import (the two catalog constants above
  // are values) is unresolvable there. Same convention as
  // src/lib/services/intakeGuard.ts. `allowImportingTsExtensions` is on, so
  // the bundler is unaffected.
} from "../constants/clientServiceCatalog.ts";

export type PricingCatalogSource = "admin-seed" | "backend";

export type AdminPricingCatalogRow = {
  service_id: string;
  /** 'individual' | 'corporate' (S6); any other value keeps the code item's. */
  audience?: string;
  category_id: ClientServiceCategoryId;
  label_ar: string;
  base_price: number | string;
  price_mode: ClientServicePriceMode;
  receiver_type: ClientServiceCatalogItem["receiverType"];
  beta_visibility: ClientServiceCatalogItem["betaVisibility"];
  requires_payment: boolean;
  enabled?: boolean;
  metadata?: {
    description?: string;
    route?: string;
    icon?: string;
    requestType?: ClientServiceCatalogItem["requestType"];
    priceNote?: string;
    includedByPlan?: ClientServiceCatalogItem["includedByPlan"];
    tag?: string;
    aiPowered?: boolean;
    humanService?: boolean;
    /** S6: this row is an audience variant of that service id (never a card). */
    variantOf?: string;
    /** Owner ٤٣٣: the lawyer's price band for a consultation (display only). */
    lawyerPriceRange?: ClientServiceCatalogItem["lawyerPriceRange"];
    /**
     * S6: true only when an admin hid the row on purpose (adminHiddenPatch).
     * The server loader fetches a disabled row only with this flag.
     */
    adminHidden?: boolean;
  };
};

/**
 * S6 contract for the admin enable/disable toggle (S6-T7 must use it): the
 * columns a PATCH writes. Disabling writes enabled = false AND
 * metadata.adminHidden = true — without the flag the server loader
 * (src/lib/pricing/clientPricingServer.ts) never fetches the row, so the
 * toggle would hide nothing. Enabling writes enabled = true and REMOVES the
 * flag. Every other metadata key is kept. Pure; the caller writes the result.
 */
export function adminHiddenPatch(
  enabled: boolean,
  metadata: Record<string, unknown> | null | undefined,
): { enabled: boolean; metadata: Record<string, unknown> } {
  const next: Record<string, unknown> = { ...(metadata ?? {}) };
  if (enabled) delete next.adminHidden;
  else next.adminHidden = true;
  return { enabled, metadata: next };
}

// Coupons are NOT here. A client-side map (VALID_COUPONS) and the
// quoteClientService() that read it used to accept NZAMY50 / NEWCLIENT with no
// minimum and no cap, in the browser. Since P7 (owner answers of 25 Oct 2026,
// pricing doc §13أ) a coupon is checked and applied on the server only:
// src/lib/payments/couponRules.ts + couponServer.ts, inside the checkout order.

// S6: an audience variant (`variantOf` set, e.g. contract-review-business) is
// never a card and never a lookup result — it only lends its price to its
// base item through resolveClientService (src/lib/pricing/clientPricingAudience.ts).
// Each helper below skips it, so a variant id resolves like an unknown id.
// Fix round 1 (M3): a "corporate" item is never a card either — with or
// without a variantOf — since the loader now fetches corporate rows and a
// company-only row must not be listed (or priced) for everyone.
const isCard = (service: ClientServiceCatalogItem) => !service.variantOf && service.audience !== "corporate";

export function getClientServiceById(
  serviceId: string | null | undefined,
  catalog: ClientServiceCatalogItem[] = CLIENT_SERVICE_CATALOG,
): ClientServiceCatalogItem {
  return (
    catalog.find((service) => isCard(service) && service.serviceId === serviceId) ??
    catalog.find((service) => isCard(service) && service.serviceId === "general") ??
    CLIENT_SERVICE_CATALOG.find((service) => isCard(service) && service.serviceId === serviceId) ??
    CLIENT_SERVICE_CATALOG.find((service) => isCard(service) && service.serviceId === "general")!
  );
}

export function getClientServicesByCategory(
  categoryId: ClientServiceCategoryId,
  catalog: ClientServiceCatalogItem[] = CLIENT_SERVICE_CATALOG,
): ClientServiceCatalogItem[] {
  return catalog.filter((service) => isCard(service) && service.categoryId === categoryId && service.enabled !== false);
}

export function getClientServiceCategories(options?: { includeBeta?: boolean }): ClientServiceCategory[] {
  const includeBeta = options?.includeBeta ?? false;
  if (includeBeta) return CLIENT_SERVICE_CATEGORIES;
  return CLIENT_SERVICE_CATEGORIES.filter((category) => category.betaVisibility === "public");
}

export function getVisibleClientServiceCatalog(options?: { includeBeta?: boolean }): ClientServiceCatalogItem[] {
  const includeBeta = options?.includeBeta ?? false;
  if (includeBeta) return CLIENT_SERVICE_CATALOG.filter((service) => isCard(service) && service.enabled !== false);
  return CLIENT_SERVICE_CATALOG.filter(
    (service) => isCard(service) && service.betaVisibility === "public" && service.enabled !== false,
  );
}

export function formatClientServicePrice(service: Pick<ClientServiceCatalogItem, "basePrice" | "priceMode">): string {
  const amount = service.basePrice.toLocaleString("ar-SA");
  const labels: Record<ClientServicePriceMode, string> = {
    free: "مجانا",
    included: "مشمول في الباقة",
    fixed: `${amount} ر.س`,
    starting_from: `يبدأ من ${amount} ر.س`,
    custom: "حسب التقييم",
    per_page: `يبدأ من ${amount} ر.س`,
    // Paid in points by the tool; the count is in the row's priceNote.
    points: "بالنقاط",
  };
  // Fix round 1 (M3): a price_mode this build does not know (a DB row written
  // ahead of a deploy — price_mode has no CHECK) reads as an honest stand-in,
  // never a blank price.
  return labels[service.priceMode] ?? "يُحدَّد بعد المراجعة";
}

export function mergeAdminPricingCatalogRows(rows: AdminPricingCatalogRow[]): ClientServiceCatalogItem[] {
  const byId = new Map<string, ClientServiceCatalogItem>(
    CLIENT_SERVICE_CATALOG.map((service) => [service.serviceId, { ...service }]),
  );

  for (const row of rows) {
    const existing = byId.get(row.service_id);
    const metadata = row.metadata ?? {};
    // Fix round 1 (M3): a corporate row with no variant link never replaces
    // an individuals' code entry of the same id (that would hide the
    // individuals' card); the code entry stays.
    if (
      row.audience === "corporate" &&
      !(metadata.variantOf ?? existing?.variantOf) &&
      existing &&
      existing.audience !== "corporate"
    ) {
      continue;
    }
    const next: ClientServiceCatalogItem = {
      serviceId: row.service_id,
      categoryId: row.category_id,
      label: row.label_ar,
      description: metadata.description ?? existing?.description ?? row.label_ar,
      basePrice: Number(row.base_price) || 0,
      priceMode: row.price_mode,
      priceNote: metadata.priceNote ?? existing?.priceNote,
      route: metadata.route ?? existing?.route ?? `/dashboard/client/requests/new?type=${row.service_id}`,
      icon: metadata.icon ?? existing?.icon ?? "ShieldStar",
      receiverType: row.receiver_type,
      requestType: metadata.requestType ?? existing?.requestType ?? "service",
      betaVisibility: row.beta_visibility,
      requiresPayment: row.requires_payment,
      enabled: row.enabled,
      includedByPlan: metadata.includedByPlan ?? existing?.includedByPlan,
      tag: metadata.tag ?? existing?.tag,
      aiPowered: metadata.aiPowered ?? existing?.aiPowered,
      humanService: metadata.humanService ?? existing?.humanService,
      lawyerPriceRange: validPriceRange(metadata.lawyerPriceRange) ?? existing?.lawyerPriceRange,
      // S6: a row's audience and variantOf travel with it. A row that drops
      // either keeps the code item's, so a variant never turns into a card.
      audience:
        row.audience === "corporate" || row.audience === "individual" ? row.audience : existing?.audience,
      variantOf: metadata.variantOf ?? existing?.variantOf,
    };
    byId.set(row.service_id, next);
  }

  return Array.from(byId.values());
}

export async function fetchClientPricingCatalog(): Promise<{
  catalog: ClientServiceCatalogItem[];
  source: PricingCatalogSource;
}> {
  const response = await fetch("/api/client-pricing", { cache: "no-store" });
  if (!response.ok) throw new Error(`Pricing API failed: ${response.status}`);
  return response.json() as Promise<{ catalog: ClientServiceCatalogItem[]; source: PricingCatalogSource }>;
}

/**
 * The catalogue entry a consultation mode is priced by. Owner ٤٣٣ (3 Nov
 * 2026): voice has its own `voice-call` (20 min) and video is `video-short`
 * (30 min); the 60-minute `video-full` is retired and never chosen here.
 */
export function getConsultationModeServiceId(mode: string): string {
  if (mode === "in-person") return "in-person";
  if (mode === "text") return "written-opinion";
  if (mode === "voice") return "voice-call";
  return "video-short";
}

export function getLawyerModeFromServiceId(serviceId: string): "video" | "in-person" | "text" | "voice" {
  if (serviceId === "in-person") return "in-person";
  if (serviceId === "written-opinion") return "text";
  if (serviceId === "voice-call") return "voice";
  return "video";
}

/** A row's metadata.lawyerPriceRange, or null when it is not two numbers with 0 ≤ min ≤ max. */
function validPriceRange(value: unknown): { min: number; max: number } | null {
  if (!value || typeof value !== "object") return null;
  const { min, max } = value as { min?: unknown; max?: unknown };
  const lo = Number(min);
  const hi = Number(max);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo < 0 || lo > hi) return null;
  return { min: lo, max: hi };
}
