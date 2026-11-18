/**
 * openRequestsView.ts — what a verified lawyer sees for one open request
 * (owner decision ١٠): the case type, the city and one summary line. Never
 * the client's name, title or description — marketplace_open_requests
 * (20261124_30) does not even return them.
 *
 * The summary is re-checked here (isSafePublicSummary) before it is shown: the
 * database CHECK already refuses a digit, an e-mail or a URL, and this is the
 * second lock. A request created before 20261124_30 has no city and no summary
 * and shows its type only.
 *
 * Pure: relative imports only, `node --test` runs it.
 */

import { saudiCityLabelAr } from "../../constants/saudiCities.ts";
import { isSafePublicSummary } from "./requestPublicSummary.ts";
import { requestTypeLabelAr } from "./requestTypeLabels.ts";
import { openRequestCategoryLabelAr } from "./openRequestCategory.ts";

export interface OpenRequestRow {
  id?: unknown;
  type?: unknown;
  receiver?: unknown;
  city?: unknown;
  public_summary?: unknown;
  status?: unknown;
  created_at?: unknown;
  /** Owner ٢٣ (20261127_70): the type staff published it under. */
  category?: unknown;
}

export interface OpenRequestItem {
  id: string;
  /**
   * Arabic type label: the published type (استشارة / قضية / صياغة, owner ٢٣)
   * when there is one, else the row type («خدمة» …), «طلب» for an unknown one.
   */
  typeLabel: string;
  /** Arabic city label, or null (an older request, or a slug this build does not know). */
  cityLabel: string | null;
  /** The scrubbed one-line summary, or null. */
  summary: string | null;
  createdAt: string | null;
}

export function toOpenRequestItem(row: OpenRequestRow): OpenRequestItem | null {
  if (!row || typeof row.id !== "string" || row.id.length === 0) return null;
  const summary = typeof row.public_summary === "string" && isSafePublicSummary(row.public_summary) ? row.public_summary : null;
  return {
    id: row.id,
    typeLabel:
      openRequestCategoryLabelAr(row.category) ??
      requestTypeLabelAr(typeof row.type === "string" ? row.type : null) ??
      "طلب",
    cityLabel: saudiCityLabelAr(typeof row.city === "string" ? row.city : null),
    summary,
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
  };
}

export function toOpenRequestItems(rows: unknown): OpenRequestItem[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => toOpenRequestItem(r as OpenRequestRow)).filter((x): x is OpenRequestItem => x !== null);
}
