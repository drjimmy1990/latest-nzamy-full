/**
 * orderMetaLabels — how a decree's number (`ref`) and date read on /laws and
 * /laws/orders/[id] when they may be blank. Owner ٤٢٤ (2026-11-07, confirming
 * ٣٨٠): a non-subscriber receives '' for both (and for the official link) —
 * /api/library/decrees/[id], /api/library/init and /api/library/search mask
 * them with maskDecreeOfficialFields. «—» is the old placeholder for a value
 * the source never had; it is treated as blank too.
 *
 * Pure, no imports: `node --test src/app/laws/orderMetaLabels.test.ts`.
 */

function text(v: unknown): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
}

/** True when a decree's number or date has something to show. */
export function orderMetaShown(value: unknown): boolean {
  const t = text(value);
  return t !== "" && t !== "—";
}

/** The reader's header line: «ref • date», either one alone, or "" (no stray «•»). */
export function orderHeaderLine(ref: unknown, date: unknown): string {
  return [ref, date].filter(orderMetaShown).map(text).join(" • ");
}

/**
 * The prefix of a copied page: «الصفحة N من <نوع> رقم (<ref>) ونصه:», and
 * without «رقم (…)» when the number is blank — never «رقم ()».
 */
export function orderCopyPrefix(pageNumber: number, docTypeLabel: string, ref: unknown, isRTL: boolean): string {
  const shown = orderMetaShown(ref) ? text(ref) : "";
  if (isRTL) return shown ? `الصفحة ${pageNumber} من ${docTypeLabel} رقم (${shown}) ونصه:` : `الصفحة ${pageNumber} من ${docTypeLabel} ونصه:`;
  return shown ? `Page ${pageNumber} of ${docTypeLabel} Ref (${shown}), text:` : `Page ${pageNumber} of ${docTypeLabel}, text:`;
}
