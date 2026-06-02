import {
  CLIENT_SERVICE_CATALOG,
  CLIENT_SERVICE_CATEGORIES,
  type ClientServiceCatalogItem,
  type ClientServiceCategory,
  type ClientServiceCategoryId,
  type ClientServicePriceMode,
} from "@/constants/clientServiceCatalog";

export type PricingCatalogSource = "admin-seed" | "backend";

export type ClientServiceQuoteInput = {
  couponCode?: string;
  useWallet?: boolean;
  walletBalance?: number;
  source?: PricingCatalogSource;
};

export type ClientServiceQuote = {
  serviceId: string;
  originalPrice: number;
  discount: number;
  walletUsed: number;
  finalTotal: number;
  couponApplied: boolean;
  couponError: string | null;
  source: PricingCatalogSource;
};

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

const VALID_COUPONS: Record<string, number> = {
  NZAMY50: 50,
  NEWCLIENT: 75,
};

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

export function quoteClientService(
  serviceId: string,
  input: ClientServiceQuoteInput = {},
  catalog: ClientServiceCatalogItem[] = CLIENT_SERVICE_CATALOG,
): ClientServiceQuote {
  const service = getClientServiceById(serviceId, catalog);
  const originalPrice = service.requiresPayment ? service.basePrice : 0;
  const couponCode = input.couponCode?.trim().toUpperCase() ?? "";
  const walletBalance = Math.max(0, input.walletBalance ?? 0);
  let couponApplied = false;
  let couponError: string | null = null;
  let discount = 0;

  if (couponCode) {
    const couponValue = VALID_COUPONS[couponCode];
    if (couponValue) {
      couponApplied = true;
      discount = Math.min(couponValue, originalPrice);
    } else {
      couponError = "كود الخصم غير صالح أو منتهي.";
    }
  }

  const walletUsed = input.useWallet
    ? Math.min(walletBalance, Math.max(0, originalPrice - discount))
    : 0;

  return {
    serviceId: service.serviceId,
    originalPrice,
    discount,
    walletUsed,
    finalTotal: Math.max(0, originalPrice - discount - walletUsed),
    couponApplied,
    couponError,
    source: input.source ?? "admin-seed",
  };
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
