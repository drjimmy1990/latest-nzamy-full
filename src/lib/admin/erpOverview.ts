/**
 * Bounds for GET /api/v1/admin/erp («مكاتب المحاماة» in the admin console).
 *
 * Live check of 13 Nov, row 49: the route read EVERY firm, EVERY active firm
 * member, EVERY open case and EVERY active subscription on the platform into
 * memory, then joined them in JavaScript. It now reads one page of firms (the
 * newest ERP_FIRMS_MAX) and only the members, cases and subscriptions that
 * belong to those firms, in id chunks small enough for a request URL.
 *
 * The firm count in the summary stays exact (a head count); the other totals
 * cover the firms listed, and `truncated` says when that is not all of them,
 * so the console never presents a partial sum as the platform's total.
 */

export const ERP_FIRMS_MAX = 500;

/** 100 uuids ≈ 3.7 KB of query string — well inside any proxy's URL limit. */
export const ERP_IN_CHUNK = 100;

/** `ids` without duplicates or empties, split into chunks of `size`. */
export function idChunks(ids: readonly (string | null | undefined)[], size: number = ERP_IN_CHUNK): string[][] {
  if (!Number.isInteger(size) || size < 1) throw new RangeError("chunk size must be a positive integer");
  const unique = [...new Set(ids.filter((id): id is string => typeof id === "string" && id !== ""))];
  const out: string[][] = [];
  for (let i = 0; i < unique.length; i += size) out.push(unique.slice(i, i + size));
  return out;
}

/** The summary note when only part of the firms is listed, or null. */
export function erpTruncationNoteAr(listed: number, total: number): string | null {
  if (!(total > listed)) return null;
  return `تعرض هذه الأرقام أحدث ${listed.toLocaleString("ar-SA")} مكتب من أصل ${total.toLocaleString("ar-SA")}.`;
}
