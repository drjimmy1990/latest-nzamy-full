/**
 * regulationNameOf — the name of the regulation an article_regulations.ref
 * belongs to.
 *
 * The owner's loader stores one ref per regulation ARTICLE, not one name per
 * regulation. Prod (2026-11-08, after 20261107_10) shows three shapes:
 *   «المادة الأولى من اللائحة التنفيذية لنظام المدفوعات وخدماتها»
 *   «المادة (1) من اللائحة التنفيذية» / «اللائحة التنظيمية لحماية الأغذية…»
 *   «الأولى», «الثامنة والعشرون بعد المائة», «ستة بعد المائتين» (law-agriculture)
 * The leading «المادة … من» is dropped, and a ref that names no regulation
 * (a bare ordinal) gives "" — it is an article label, not a regulation name.
 *
 * Pure, no imports: the reader (client) and the init route both use it.
 */

/** «المادة <anything without " من "> من » at the start. */
const ARTICLE_PREFIX = /^المادة\s+(?:(?!\sمن\s).)+?\s+من\s+/;

/** A word that marks a regulation-type instrument. */
const REGULATION_WORD = /(?:^|\s)(?:ال)?(?:لائحة|لوائح|قواعد|ضوابط|نظام|تعليمات|إجراءات|قرار|دليل|معايير|اشتراطات|تنظيم)/;

export function regulationNameOf(ref: unknown): string {
  if (typeof ref !== "string") return "";
  const name = ref.replace(/\s+/g, " ").trim().replace(ARTICLE_PREFIX, "").trim();
  return REGULATION_WORD.test(name) ? name : "";
}

/** The first regulation name in a reader's merged ref («ref1, ref2, …»); "" when none. */
export function regulationNameFromRefs(refs: unknown): string {
  if (typeof refs !== "string") return "";
  return refs.split(", ").map(regulationNameOf).find(Boolean) ?? "";
}
