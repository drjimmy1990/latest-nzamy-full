/**
 * instantBox — the /laws instant search box (owner note ١٢-٢, 2026-10-30):
 *
 *   • each suggestion carries a type badge [نظام | لائحة | مبدأ | فقه | أمر];
 *   • a law shows its DISTINCTIVE name core (2–3 words) — and never the same
 *     core for two different laws: «نظام المرافعات الشرعية» and «نظام
 *     المرافعات أمام ديوان المظالم» stay two names;
 *   • a click OPENS the document (the reader, with ?q=) instead of copying
 *     the suggestion into the box;
 *   • the snippet is what the server sent for this viewer: a locked
 *     principle carries none (autocomplete/route.ts).
 *
 * Pure: `node --test src/app/laws/instantBox.test.ts`.
 */

import { withSearchQuery } from "../../lib/search/multiColorSearch.ts";

export type InstantBadge = "نظام" | "لائحة" | "مبدأ" | "فقه" | "أمر";

/** One /api/library/autocomplete topMatches row (facets.ts TopMatch). */
export interface InstantMatchLike {
  title?: unknown;
  section?: unknown;
  slug?: unknown;
  snippet?: unknown;
  kind?: unknown;
  href?: unknown;
  locked?: unknown;
  lawType?: unknown;
}

export interface InstantItem {
  /** The full title (tooltip, accessible name). */
  label: string;
  /** What the row shows in bold: a law's name core, else the title. */
  core: string;
  badge: InstantBadge;
  /** The section tab a click lands on when there is no document link. */
  type: "laws" | "precedents" | "orders" | "feqh";
  /** The document, with ?q=; "" → the click falls back to running the search. */
  href: string;
  snippet: string;
  locked: boolean;
  id: string;
}

function text(v: unknown): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
}

/** Hamza / ta-marbuta / alif-maqsura / tatweel / diacritics folded, for comparing names. */
function fold(s: string): string {
  return s
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي");
}

/** Generic heads a law title starts with; the name core is what follows. */
const GENERIC_HEAD = /^(?:ال)?(?:نظام|لائحة|اللائحة|قواعد|ضوابط|تنظيم|مرسوم|قرار|أمر)(?:\s+(?:التنفيذية|التنفيذيه)(?:\s+ل(?:نظام)?)?)?\s+/;

function words(title: string): string[] {
  return title.split(" ").filter(Boolean);
}

/** The words of a title after its generic head («نظام», «اللائحة التنفيذية لنظام» …). */
function tail(title: string): string[] {
  const t = text(title);
  const m = GENERIC_HEAD.exec(t);
  const rest = m ? t.slice(m[0].length) : t;
  const w = words(rest);
  return w.length > 0 ? w : words(t);
}

/**
 * A law's distinctive name core: 2–3 words after the generic head
 * («المرافعات الشرعية»), lengthened word by word while another title in
 * `others` shares the same core — two different laws never show one name. A
 * title that has no more words than the core is returned whole.
 */
export function lawNameCore(title: unknown, others: readonly unknown[] = []): string {
  const full = text(title);
  if (!full) return "";
  const mine = tail(full);
  const rivals = others
    .map((o) => text(o))
    .filter((o) => o && fold(o) !== fold(full))
    .map((o) => tail(o).map(fold));
  let n = Math.min(mine.length, mine.length >= 3 && mine[1].length <= 3 ? 3 : 2);
  const clash = (k: number) => {
    const key = mine.slice(0, k).map(fold).join(" ");
    return rivals.some((r) => r.slice(0, k).join(" ") === key);
  };
  while (n < mine.length && clash(n)) n += 1;
  if (n < mine.length) return mine.slice(0, n).join(" ");
  // The whole tail: still shared (a law and «اللائحة التنفيذية لـ» it) → the full title.
  return clash(mine.length) ? full : mine.join(" ");
}

/** The badge for a suggestion. A law whose type or title says regulation → «لائحة». */
export function instantBadge(m: InstantMatchLike): InstantBadge {
  const section = text(m.section);
  if (section === "feqh") return "فقه";
  if (section === "orders") return "أمر";
  if (section === "precedents") return "مبدأ";
  const lawType = text(m.lawType).toLowerCase();
  if (lawType === "regulation" || lawType === "لائحة" || /^(?:ال)?لائحة|^(?:ال)?قواعد|^(?:ال)?ضوابط/.test(text(m.title))) return "لائحة";
  return "نظام";
}

/** The document a suggestion opens, with the search as ?q=; "" when the row names none. */
export function instantHref(m: InstantMatchLike, query: string): string {
  const own = text(m.href);
  const slug = text(m.slug);
  const section = text(m.section);
  let href = own;
  if (!href && slug) {
    if (section === "laws") href = `/laws/${encodeURIComponent(slug)}`;
    else if (section === "orders") href = `/laws/orders/${encodeURIComponent(slug)}`;
    else if (section === "feqh") href = `/book/${encodeURIComponent(slug)}`;
    else if (section === "precedents" && text(m.kind) === "collection") href = `/precedents/${encodeURIComponent(slug)}`;
  }
  if (!href.startsWith("/")) return "";
  const q = text(query);
  return q.length >= 2 ? withSearchQuery(href, q) : href;
}

/** The rows of the instant box, from the API's topMatches. */
export function instantBoxItems(matches: readonly InstantMatchLike[], query: string): InstantItem[] {
  const list = Array.isArray(matches) ? matches.filter((m) => m && typeof m === "object") : [];
  const lawTitles = list.filter((m) => text(m.section) === "laws").map((m) => text(m.title));
  return list
    .map((m): InstantItem | null => {
      const label = text(m.title);
      if (!label) return null;
      const section = text(m.section);
      const type = section === "laws" || section === "orders" || section === "feqh" ? section : "precedents";
      const locked = m.locked === true;
      return {
        label,
        core: type === "laws" ? lawNameCore(label, lawTitles) : label,
        badge: instantBadge(m),
        type,
        href: instantHref(m, query),
        snippet: locked ? "" : text(m.snippet),
        locked,
        id: text(m.slug),
      };
    })
    .filter((x): x is InstantItem => x !== null);
}
