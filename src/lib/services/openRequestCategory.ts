/**
 * openRequestCategory.ts — owner ٢٣ (18 Nov 2026): the three types a staff
 * member publishes a triaged client request under, so it reaches the lawyers'
 * «الطلبات المفتوحة» list (public.marketplace_open_requests, 20261127_70):
 * استشارة، قضية، صياغة. The database CHECK holds the same three.
 *
 * `suggestOpenRequestCategory` pre-selects the admin's choice from the
 * catalogue category the client ordered from (metadata.categoryId); staff
 * always confirm it — nothing is published without a click.
 *
 * Pure, relative imports only: `node --test` loads it.
 */

export const OPEN_REQUEST_CATEGORIES = ["consultation", "case", "drafting"] as const;
export type OpenRequestCategory = typeof OPEN_REQUEST_CATEGORIES[number];

export const OPEN_REQUEST_CATEGORY_LABEL_AR: Readonly<Record<OpenRequestCategory, string>> = {
  consultation: "استشارة",
  case: "قضية",
  drafting: "صياغة",
};

export function isOpenRequestCategory(v: unknown): v is OpenRequestCategory {
  return typeof v === "string" && (OPEN_REQUEST_CATEGORIES as readonly string[]).includes(v);
}

/** The Arabic label of a published type, or null. */
export function openRequestCategoryLabelAr(v: unknown): string | null {
  return isOpenRequestCategory(v) ? OPEN_REQUEST_CATEGORY_LABEL_AR[v] : null;
}

/** clientServiceCatalog categoryId → the open-request type it most likely is. */
const CATALOG_CATEGORY_TO_OPEN: Readonly<Record<string, OpenRequestCategory>> = {
  consultation: "consultation",
  contracts: "drafting",
  "legal-filing": "drafting",
  "case-study": "case",
  arbitration: "case",
};

/** The type to pre-select for a request, or null (staff choose). */
export function suggestOpenRequestCategory(order: { type?: unknown; metadata?: unknown }): OpenRequestCategory | null {
  if (order.type === "consultation") return "consultation";
  const m = order.metadata && typeof order.metadata === "object" ? (order.metadata as Record<string, unknown>) : {};
  const cat = typeof m.categoryId === "string" ? m.categoryId : null;
  return cat && Object.prototype.hasOwnProperty.call(CATALOG_CATEGORY_TO_OPEN, cat) ? CATALOG_CATEGORY_TO_OPEN[cat] : null;
}

/**
 * Why a request may not be published now, or null when it may. Mirrors the
 * function's filter: unassigned, still waiting (pending / pending_assignment),
 * not a test account's.
 */
export function openRequestPublishBlock(order: {
  status?: unknown;
  assigned_to?: unknown;
}, requester: { isTestAccount: boolean }): string | null {
  if (order.status !== "pending_assignment" && order.status !== "pending") {
    return "لا يُنشر إلا طلب ما زال بانتظار الاستلام.";
  }
  if (order.assigned_to) return "الطلب موجّه لعضو من الفريق — ألغِ التوجيه قبل نشره للمحامين.";
  if (requester.isTestAccount) return "طلب من حساب تجريبي — لا يُنشر للمحامين.";
  return null;
}
