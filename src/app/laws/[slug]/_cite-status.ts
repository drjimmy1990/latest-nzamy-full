/**
 * _cite-status.ts — the status pill of a citation chip's popover and of the
 * «الإحالات المرتبطة» bar (owner TODO N02-15): 🟢 سارية / 🟡 معدّلة / 🔴 ملغاة.
 *
 * Only an explicit status earns a pill. `status_undeclared`, an unknown token
 * or no status at all gets NO pill — never «سارية» (the law page's own rule: a
 * missing status is never evidence the article is active; owner ٢٥٩: nothing
 * is shown for an unrecorded status). A LAW's status has its own vocabulary
 * (law-status.ts, eight values): `lawStatusPill` reads it through
 * lawStatusPresentation, so a law pill always says what the law badge says.
 *
 * Also the number → article index the chips resolve against, built from the
 * reader's own articles: law articles only (a regulation or annex article «٥»
 * is not «المادة (٥)» of the law), never a page marker.
 *
 * Pure: `node --test` runs _cite-status.test.ts.
 */

import { parseArabicArticleNumber } from "../../../lib/library/articleMentions.ts";
import { isPageLocator } from "../../../lib/library/pageLocator.ts";
import { lawStatusPresentation } from "../law-status.ts";

export type PillTone = "active" | "amended" | "repealed" | "unknown";

export interface StatusPill {
  tone: PillTone;
  emoji: string;
  labelAr: string;
  labelEn: string;
}

const PILLS: Record<Exclude<PillTone, "unknown">, StatusPill> = {
  active: { tone: "active", emoji: "🟢", labelAr: "سارية", labelEn: "In force" },
  amended: { tone: "amended", emoji: "🟡", labelAr: "معدّلة", labelEn: "Amended" },
  repealed: { tone: "repealed", emoji: "🔴", labelAr: "ملغاة", labelEn: "Repealed" },
};

/** An ARTICLE's status as a pill; null when the source records none (no pill shown). */
export function statusPill(status: string | null | undefined): StatusPill | null {
  const s = String(status ?? "").trim();
  if (s === "active") return PILLS.active;
  if (s === "amended") return PILLS.amended;
  if (s === "repealed") return PILLS.repealed;
  return null;
}

/** A LAW's status as a pill, worded as the law's own badge; null when none is recorded. */
export function lawStatusPill(status: string | null | undefined): StatusPill | null {
  const p = lawStatusPresentation(status);
  if (!p) return null;
  if (p.tone === "effective") return { tone: "active", emoji: "🟢", labelAr: p.labelAr, labelEn: p.labelEn };
  if (p.tone === "repealed") return { tone: "repealed", emoji: "🔴", labelAr: p.labelAr, labelEn: p.labelEn };
  if (p.tone === "caution") return { tone: "amended", emoji: "🟡", labelAr: p.labelAr, labelEn: p.labelEn };
  return { tone: "unknown", emoji: "⚪", labelAr: p.labelAr, labelEn: p.labelEn };
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
