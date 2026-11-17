/**
 * _cite-status.ts — the status pill of a citation chip's popover and of the
 * «الإحالات المرتبطة» bar (owner TODO N02-15): 🟢 سارية / 🟡 معدّلة / 🔴 ملغاة.
 *
 * Only an explicit status earns a colour. `status_undeclared`, an unknown
 * token or no status at all is NOT shown as in force (the law page's own rule:
 * a missing status is never evidence the article is active) — it gets the
 * neutral «الحالة غير محددة».
 *
 * Also the number → article index the chips resolve against, built from the
 * reader's own articles: law articles only (a regulation or annex article «٥»
 * is not «المادة (٥)» of the law), never a page marker.
 *
 * Pure: `node --test` runs _cite-status.test.ts.
 */

import { parseArabicArticleNumber } from "../../../lib/library/articleMentions.ts";
import { isPageLocator } from "../../../lib/library/pageLocator.ts";

export type PillTone = "active" | "amended" | "repealed" | "unknown";

export interface StatusPill {
  tone: PillTone;
  emoji: string;
  labelAr: string;
  labelEn: string;
}

const PILLS: Record<PillTone, StatusPill> = {
  active: { tone: "active", emoji: "🟢", labelAr: "سارية", labelEn: "In force" },
  amended: { tone: "amended", emoji: "🟡", labelAr: "معدّلة", labelEn: "Amended" },
  repealed: { tone: "repealed", emoji: "🔴", labelAr: "ملغاة", labelEn: "Repealed" },
  unknown: { tone: "unknown", emoji: "⚪", labelAr: "الحالة غير محددة", labelEn: "Status not stated" },
};

/** An article's (or a law's) status as a pill. */
export function statusPill(status: string | null | undefined): StatusPill {
  const s = String(status ?? "").trim().toLowerCase();
  if (s === "active") return PILLS.active;
  if (s === "amended") return PILLS.amended;
  if (s === "repealed") return PILLS.repealed;
  return PILLS.unknown;
}

/** Tailwind classes per tone (fixed strings). */
export function pillClass(tone: PillTone, isDark: boolean): string {
  switch (tone) {
    case "active":
      return isDark ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/25" : "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "amended":
      return isDark ? "bg-amber-500/15 text-amber-300 border-amber-500/25" : "bg-amber-50 text-amber-700 border-amber-300";
    case "repealed":
      return isDark ? "bg-red-500/15 text-red-300 border-red-500/25" : "bg-red-50 text-red-600 border-red-200";
    default:
      return isDark ? "bg-zinc-700/40 text-zinc-300 border-zinc-600/40" : "bg-slate-100 text-slate-700 border-slate-300";
  }
}

export interface IndexableArticle {
  id: string;
  number?: number | string | null;
  numberText?: string | null;
  num?: string;
  instrument?: string;
}

/** The article's own number: `number` when it is one, else its written locator. */
export function articleNumberOf(a: IndexableArticle): number | null {
  if (isPageLocator(a.numberText) || isPageLocator(a.num)) return null;
  const raw = typeof a.number === "string" ? a.number.trim() : a.number;
  const n = Number(raw);
  if (raw !== "" && raw != null && Number.isInteger(n) && n > 0) return n;
  return parseArabicArticleNumber(a.numberText ?? null);
}

/** number → the law's article, first one wins; regulation and annex articles left out. */
export function articlesByNumber<T extends IndexableArticle>(articles: readonly T[]): Map<number, T> {
  const out = new Map<number, T>();
  for (const a of articles) {
    if (a.instrument === "لائحة" || a.instrument === "ملحق") continue;
    const n = articleNumberOf(a);
    if (n != null && !out.has(n)) out.set(n, a);
  }
  return out;
}
