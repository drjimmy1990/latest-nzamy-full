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
  };
};

// Coupons are NOT here. A client-side map (VALID_COUPONS) and the
// quoteClientService() that read it used to accept NZAMY50 / NEWCLIENT with no
// minimum and no cap, in the browser. Since P7 (owner answers of 25 Oct 2026,
// pricing doc §13أ) a coupon is checked and applied on the server only:
// src/lib/payments/couponRules.ts + couponServer.ts, inside the checkout order.

export function getClientServiceById(
  serviceId: string | null | undefined,
  catalog: ClientServiceCatalogItem[] = CLIENT_SERVICE_CATALOG,
): ClientServiceCatalogItem {
  return (
    catalog.find((service) => service.serviceId === serviceId) ??
    catalog.find((service) => service.serviceId === "general") ??
    CLIENT_SERVICE_CATALOG.find((service) => service.serviceId === serviceId) ??
    CLIENT_SERVICE_CATALOG.find((service) => service.serviceId === "general")!
  );
}

export function getClientServicesByCategory(
  categoryId: ClientServiceCategoryId,
  catalog: ClientServiceCatalogItem[] = CLIENT_SERVICE_CATALOG,
): ClientServiceCatalogItem[] {
  return catalog.filter((service) => service.categoryId === categoryId && service.enabled !== false);
}

export function getClientServiceCategories(options?: { includeBeta?: boolean }): ClientServiceCategory[] {
  const includeBeta = options?.includeBeta ?? false;
  if (includeBeta) return CLIENT_SERVICE_CATEGORIES;
  return CLIENT_SERVICE_CATEGORIES.filter((category) => category.betaVisibility === "public");
}

export function getVisibleClientServiceCatalog(options?: { includeBeta?: boolean }): ClientServiceCatalogItem[] {
  const includeBeta = options?.includeBeta ?? false;
  if (includeBeta) return CLIENT_SERVICE_CATALOG.filter((service) => service.enabled !== false);
  return CLIENT_SERVICE_CATALOG.filter((service) => service.betaVisibility === "public" && service.enabled !== false);
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
  };
  return labels[service.priceMode];
}

export function mergeAdminPricingCatalogRows(rows: AdminPricingCatalogRow[]): ClientServiceCatalogItem[] {
  const byId = new Map<string, ClientServiceCatalogItem>(
    CLIENT_SERVICE_CATALOG.map((service) => [service.serviceId, { ...service }]),
  );

  for (const row of rows) {
    const existing = byId.get(row.service_id);
    const metadata = row.metadata ?? {};
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

export function getConsultationModeServiceId(mode: string): string {
  if (mode === "in-person") return "in-person";
  if (mode === "text") return "written-opinion";
  return "video-full";
}

export function getLawyerModeFromServiceId(serviceId: string): "video" | "in-person" | "text" | "voice" {
  if (serviceId === "in-person") return "in-person";
  if (serviceId === "written-opinion") return "text";
  return "video";
}
