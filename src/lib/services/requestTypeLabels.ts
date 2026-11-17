/**
 * requestTypeLabels.ts — Arabic labels for `service_requests.type`.
 *
 * Every value the `service_requests_type_check` CHECK constraint allows
 * (supabase/migrations/20260814_service_orders_types.sql). Moved here from
 * dashboard/lawyer/cases/[id]/page.tsx (a page file may not export it) so the
 * lawyer dashboard's «أحدث القضايا» table — which printed the raw `service`
 * (owner package 13 Nov, N06-20) — reads the same words. Same words the client
 * sees for the same type in dashboard/client/requests/page.tsx's TYPE_CFG.
 *
 * Pure, relative imports only: node --test loads it.
 */
export const REQUEST_TYPE_LABELS_AR: Readonly<Record<string, string>> = {
  service: "خدمة",
  consultation: "استشارة",
  business_case: "قضية",
  ngo_volunteer: "متطوع",
  ai_draft: "صياغة مذكرة",
  ai_contracts: "عقود",
  ai_wargaming: "محاكاة",
  ai_legal_opinion: "رأي قانوني",
};

/**
 * The Arabic label of a request type, or null for a type with none (a value
 * added to the database before this build ships). Null, not the raw value:
 * callers show nothing rather than an English machine word.
 */
export function requestTypeLabelAr(type: string | null | undefined): string | null {
  if (!type) return null;
  return Object.prototype.hasOwnProperty.call(REQUEST_TYPE_LABELS_AR, type) ? REQUEST_TYPE_LABELS_AR[type] : null;
}
