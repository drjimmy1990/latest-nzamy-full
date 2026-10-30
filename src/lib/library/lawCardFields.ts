/**
 * lawCardFields — which rows of a law's identity card are always shown and
 * which wait behind «المزيد» (owner answer ٢٦١: five fields always, the rest
 * behind one button).
 *
 * THE LIST is LAW_CARD_PRIMARY_FIELDS below. Owner ٢٩٧ (answered 2026-10-26,
 * option أ): النوع، آخر تعديل، تاريخ الإصدار، الحالة، الجهة المصدرة — «آخر
 * تعديل» BEFORE «تاريخ الإصدار» since owner note ٠١ item ١ (2026-10-30).
 * The official links are SUBSCRIBERS' since owner ٣١٨ (28-Oct, reversing
 * ٢٩٧'s public link): the route sends `officialLink` / `officialLinks` to a
 * subscriber only. Changing the five is a change to that one array (drop,
 * add or reorder an entry). A guest's card keeps only the النوع / الحالة /
 * الجهة المصدرة rows (GUEST_CARD_KEYS, lawSummaryVisibility.ts), plus the one
 * public date «آخر تحديث تشريعي» (٣١٨, legislativeEvent.ts).
 *
 * Each field names the card keys it reads, matched EXACTLY (after trimming):
 * «تاريخ النشر» is a publication date and never fills «تاريخ الإصدار». The
 * keys are the ones measured on last_owner «أنظمة ولوائح» (2026-10-25, 1,560
 * cards): the main table and the «➕ المزيد» table are pooled, because the
 * files put «تاريخ الإصدار» (883 of 1,051) and «الجهة المصدرة» (854 of 1,497)
 * mostly in the ➕ table.
 *
 * الحالة comes from the database (library.laws.status through
 * lawStatusPresentation), the same value as the catalogue and the repealed
 * banner, and only when one is recorded (owner ٢٥٩). The file's own
 * «حالة التشريع» row then goes behind «المزيد» — unless it says exactly the
 * same as the badge, when it is not repeated. With no recorded status the
 * file's row is the status field, if the card has one; else there is none.
 *
 * Values are never invented: a field the card does not have is absent
 * (except تاريخ الإصدار, which falls back to library.laws.issue_date_hijri
 * when the caller passes it — the subscriber-only database value).
 *
 * Pure: `node --test` loads it directly.
 */

import type { LawCardField, LawMetadataCard } from "./lawPreambleBlocks.ts";

export type LawCardFieldId = "type" | "issueDate" | "lastAmendment" | "status" | "issuer";

export interface LawCardFieldSpec {
  id: LawCardFieldId;
  /** The label the sidebar prints when the value does not come from a card row. */
  label: string;
  /** Card keys that fill the field, in order of preference (exact match). */
  keys: readonly string[];
}

/**
 * Owner ٢٦١ / ٢٩٧ (أ): the fields always shown, in display order — «آخر
 * تعديل» first, «تاريخ الإصدار» right under it (owner note ٠١ item ١).
 */
export const LAW_CARD_PRIMARY_FIELDS: readonly LawCardFieldSpec[] = [
  { id: "type", label: "النوع", keys: ["نوع التشريع", "نوع الوثيقة", "نوع المستند"] },
  {
    id: "lastAmendment",
    label: "آخر تعديل",
    keys: ["آخر تعديل", "أداة آخر تعديل", "أداة إصدار آخر تعديل", "آخر تحديث", "أداة آخر تحديث", "أداة إصدار آخر تحديث"],
  },
  { id: "issueDate", label: "تاريخ الإصدار", keys: ["تاريخ الإصدار", "تاريخ الإصدار (هجري)", "تاريخ الإصدار (ميلادي)"] },
  { id: "status", label: "الحالة", keys: ["حالة التشريع"] },
  { id: "issuer", label: "الجهة المصدرة", keys: ["الجهة المصدرة", "الجهة الإدارية المصدرة"] },
];

/** The values the sidebar already treats as "nothing to show". */
const EMPTY_VALUES = new Set(["لا يوجد", "غير متوفر", "غير محدد", "لا يتوفر", "غير متوفرة", "غير مبينة"]);

export function isShownCardValue(value: string | null | undefined): boolean {
  const v = (value ?? "").trim();
  return v !== "" && !EMPTY_VALUES.has(v);
}

export interface LawStatusBadge {
  labelAr: string;
  labelEn: string;
  tone: string;
}

export type LawCardPrimaryField =
  | { id: LawCardFieldId; source: "card"; key: string; value: string }
  | { id: "status"; source: "db"; key: string; value: string; badge: LawStatusBadge }
  | { id: "issueDate" | "lastAmendment"; source: "db"; key: string; value: string };

export interface LawCardLayout {
  /** The always-shown fields, in LAW_CARD_PRIMARY_FIELDS order; absent ones left out. */
  primary: LawCardPrimaryField[];
  /** Every other card row, file order (main table, then the ➕ table): behind «المزيد». */
  more: LawCardField[];
  /**
   * `more` split in two (owner note ٠١ item ٥): the rows about the base law,
   * and the rows whose KEY says they are about a merged regulation / a
   * secondary instrument (REGULATION_ROW_KEY). Ambiguous keys («قرار مجلس
   * الوزراء», «تاريخ النشر») stay with the law — never guessed across.
   */
  moreLaw: LawCardField[];
  moreRegulation: LawCardField[];
}

export interface LawCardLayoutInput {
  /** lawStatusPresentation(law.law_status): null when no status is recorded. */
  status?: LawStatusBadge | null;
  /** library.laws.issue_date_hijri as the law route sent it ('' when withheld). */
  issueDate?: string | null;
  /**
   * Owner note ٠١ item ٢: the latest legislative event of the whole file
   * (library.laws.latest_update, subscribers only — the route's
   * `latestUpdate`, e.g. «1448/01/08هـ (صدور اللائحة التنفيذية — قرار 43)»).
   * Fills «آخر تعديل» when the card has no such row or its row only says
   * there was none («لا توجد تعديلات لاحقة»). '' / null for a guest.
   */
  latestUpdate?: string | null;
  /** The category badge the card shows (section name): an «التصنيف» row saying the same is not repeated. */
  category?: string | null;
  /** The field list; LAW_CARD_PRIMARY_FIELDS unless a test passes another. */
  fields?: readonly LawCardFieldSpec[];
}

/** A «آخر تعديل» value that only says there was none. */
const NO_AMENDMENT = /^(?:لا\s+(?:توجد|يوجد)\s+(?:أي\s+)?تعديلات?(?:\s+لاحقة)?|لم\s+[يت]?عدل|لم\s+يطرأ\s+(?:عليه\s+)?(?:أي\s+)?تعديل|بدون\s+تعديل)\.?$/u;
const ARABIC_MARKS = /[ً-ٰٟـ]/g;

export function saysNoAmendment(value: string): boolean {
  return NO_AMENDMENT.test(value.replace(ARABIC_MARKS, "").replace(/\s+/g, " ").trim());
}

/** A card key about a merged regulation / secondary instrument (owner note ٠١ item ٥). */
export const REGULATION_ROW_KEY = /لائح|لوائح|التشريعات\s+الفرعية|التشريع\s+الفرعي|الأدوات\s+المدمجة/u;

/** «القسم العقاري والبناء» and «العقاري والبناء» are the same category. */
function categoryKey(v: string): string {
  return v.replace(ARABIC_MARKS, "").replace(/^\s*(?:ال)?قسم\s+/u, "").replace(/\s+/g, " ").trim();
}

const rowId = (f: LawCardField) => `${f.key.trim()}\u0000${f.value.replace(/\s+/g, " ").trim()}`;

export function lawCardLayout(card: LawMetadataCard, input: LawCardLayoutInput = {}): LawCardLayout {
  const fields = input.fields ?? LAW_CARD_PRIMARY_FIELDS;
  // Owner note ٠١ item ٤: a row the main table and the ➕ table both carry
  // (same key, same value — «تاريخ النشر» twice) is shown once; and an
  // «التصنيف» row saying what the category badge already says is not repeated.
  const seen = new Set<string>();
  const category = input.category ? categoryKey(input.category) : "";
  const rows = [...card.main, ...card.more].filter((f) => {
    if (!isShownCardValue(f.value)) return false;
    const id = rowId(f);
    if (seen.has(id)) return false;
    seen.add(id);
    return !(category && f.key.trim() === "التصنيف" && categoryKey(f.value) === category);
  });
  const used = new Set<LawCardField>();
  const take = (keys: readonly string[]): LawCardField | undefined => {
    for (const key of keys) {
      const row = rows.find((f) => !used.has(f) && f.key.trim() === key);
      if (row) {
        used.add(row);
        return row;
      }
    }
    return undefined;
  };

  const primary: LawCardPrimaryField[] = [];
  for (const spec of fields) {
    if (spec.id === "status" && input.status) {
      const badge = input.status;
      primary.push({ id: "status", source: "db", key: spec.label, value: badge.labelAr, badge });
      // The file's own status row: not repeated when it says the same thing.
      for (const key of spec.keys) {
        for (const f of rows) {
          if (!used.has(f) && f.key.trim() === key && f.value.trim() === badge.labelAr) used.add(f);
        }
      }
      continue;
    }
    const row = take(spec.keys);
    if (spec.id === "lastAmendment" && isShownCardValue(input.latestUpdate) && (!row || saysNoAmendment(row.value))) {
      // Owner note ٠١ item ٢: the merged file's latest event, not «لا توجد تعديلات لاحقة».
      primary.push({ id: "lastAmendment", source: "db", key: spec.label, value: String(input.latestUpdate).trim() });
    } else if (row) {
      primary.push({ id: spec.id, source: "card", key: row.key, value: row.value });
    } else if (spec.id === "issueDate" && isShownCardValue(input.issueDate)) {
      primary.push({ id: "issueDate", source: "db", key: spec.label, value: String(input.issueDate).trim() });
    }
  }
  const more = rows.filter((f) => !used.has(f));
  return {
    primary,
    more,
    moreLaw: more.filter((f) => !REGULATION_ROW_KEY.test(f.key)),
    moreRegulation: more.filter((f) => REGULATION_ROW_KEY.test(f.key)),
  };
}

// ── Official sources: Arabic names, never a raw host (owner note ٠١ item ٣) ──

export interface OfficialSourceLink {
  /** «هيئة الخبراء», «جريدة أم القرى», «بوابة وزارة العدل», or the card's own Arabic link text. */
  label: string;
  url: string;
}

/** A stored link only when it is an absolute http(s) URL. */
export function httpLink(value: unknown): string {
  const s = typeof value === "string" ? value.trim() : "";
  if (!/^https?:\/\/\S+$/i.test(s)) return "";
  try {
    return /^https?:$/.test(new URL(s).protocol) ? s : "";
  } catch {
    return "";
  }
}

/**
 * The Arabic name of an official source, from its host — what the reader
 * prints instead of «laws.boe.gov.sa» (note ١٢ item ٧: «laws.moj.gov.sa ظهر خاماً»).
 */
export function officialSourceName(url: string): string {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "موقع الجهة المختصة";
  }
  if (host === "boe.gov.sa" || host.endsWith(".boe.gov.sa")) return "هيئة الخبراء";
  if (host === "uqn.gov.sa" || host.endsWith(".uqn.gov.sa")) return "جريدة أم القرى";
  if (host === "moj.gov.sa" || host.endsWith(".moj.gov.sa")) return "بوابة وزارة العدل";
  return "موقع الجهة المختصة";
}

/** A link's text that is a host or a URL, not a name. */
function looksLikeHost(text: string): boolean {
  return /https?:|www\.|^[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/\S*)?$/i.test(text.trim()) || !/\p{L}/u.test(text);
}

const MD_LINK = /\[([^\]]*)\]\(\s*(https?:\/\/[^\s)]+)\s*\)/gi;
const BARE_URL = /https?:\/\/[^\s)\]»"'<>]+/gi;

/** The http(s) links inside one card value, each with an Arabic label. */
export function linksInCardValue(value: string): OfficialSourceLink[] {
  const out: OfficialSourceLink[] = [];
  const rest = value.replace(MD_LINK, (_all, text: string, url: string) => {
    const u = httpLink(url);
    if (u) out.push({ label: !text.trim() || looksLikeHost(text) ? officialSourceName(u) : text.trim(), url: u });
    return " ";
  });
  for (const m of rest.matchAll(BARE_URL)) {
    const u = httpLink(m[0].replace(/[.,،;؛]+$/, ""));
    if (u) out.push({ label: officialSourceName(u), url: u });
  }
  return out;
}

/** True when a card value is only link(s) — nothing else to read once the links are shown elsewhere. */
export function isLinkOnlyValue(value: string): boolean {
  if (!linksInCardValue(value).length) return false;
  const left = value.replace(MD_LINK, " ").replace(BARE_URL, " ").replace(/[\s·•|،,;؛\-–—/]+/g, "");
  return left === "";
}

function sameUrl(a: string, b: string): boolean {
  const norm = (u: string) => u.trim().replace(/\/+$/, "").replace(/^http:/i, "https:").toLowerCase();
  return norm(a) === norm(b);
}

/**
 * Every official source the subscriber's card can link to, once each (by
 * URL), in order: the route's links (boe_source_url, official_source_url,
 * the gazette's), then the links inside the card rows. Owner note ٠١ item ٣:
 * all of them, at the top, clickable, by name — not one host behind «المزيد».
 */
export function collectOfficialLinks(
  serverLinks: readonly OfficialSourceLink[],
  rows: readonly LawCardField[],
): OfficialSourceLink[] {
  const out: OfficialSourceLink[] = [];
  const add = (l: OfficialSourceLink) => {
    if (!l.url || out.some((o) => sameUrl(o.url, l.url))) return;
    out.push(l);
  };
  serverLinks.forEach(add);
  for (const r of rows) linksInCardValue(r.value).forEach(add);
  return out;
}

// ── Article counts per container (owner note ٠١ item ٦, note ١٢ item ٧) ──────

export interface ArticleTally {
  total: number;
  amended: number;
  repealed: number;
}

export interface LawArticleCounts {
  /** The base law's own articles (not a standalone «لائحة» / «ملحق» article). */
  law: ArticleTally;
  /** One entry per merged regulation (its `ref` as stored, notes stripped), in first-seen order. */
  regulations: Array<ArticleTally & { name: string }>;
  /** Standalone «ملحق» articles (annexes / tables). */
  annexes: number;
}

/** The article row fields lawArticleCounts reads (route: library.articles + embedded article_regulations). */
export interface CountableArticle {
  status?: unknown;
  instrument?: unknown;
  article_regulations?: unknown;
}

const tallyOf = (status: unknown, t: ArticleTally) => {
  t.total++;
  const s = typeof status === "string" ? status.trim() : "";
  if (s === "amended") t.amended++;
  else if (s === "repealed") t.repealed++;
};

/**
 * Counted live from the articles the law route loads — every article,
 * locked ones included (a count is not paid text; the browser cannot count
 * what the paywall withheld). A regulation article is an article_regulations
 * row that is not a dual-linked duplicate (is_secondary_display), grouped by
 * its `ref`; a standalone article whose `instrument` is «لائحة» counts under
 * «لائحة مستقلة», one whose `instrument` is «ملحق» is an annex. `cleanName`
 * strips pipeline notes from a ref (note ١٢ item ٧). Refs that differ only
 * in singular / plural stay apart (data-dependent: the library agent's fix).
 */
export function lawArticleCounts(
  articles: readonly CountableArticle[],
  cleanName: (ref: string) => string = (r) => r.trim(),
): LawArticleCounts {
  const law: ArticleTally = { total: 0, amended: 0, repealed: 0 };
  const regs = new Map<string, ArticleTally & { name: string }>();
  let annexes = 0;
  const reg = (name: string) => {
    let t = regs.get(name);
    if (!t) regs.set(name, (t = { name, total: 0, amended: 0, repealed: 0 }));
    return t;
  };
  for (const a of articles) {
    const instrument = typeof a.instrument === "string" ? a.instrument.trim() : "";
    if (instrument === "ملحق") annexes++;
    else if (instrument === "لائحة") tallyOf(a.status, reg("لائحة مستقلة"));
    else tallyOf(a.status, law);
    const rows = Array.isArray(a.article_regulations) ? (a.article_regulations as Array<Record<string, unknown>>) : [];
    for (const r of rows) {
      if (!r || r.is_secondary_display === true) continue;
      const name = cleanName(String(r.ref ?? "")) || "اللائحة التنفيذية";
      tallyOf(r.status, reg(name));
    }
  }
  return { law, regulations: [...regs.values()], annexes };
}

/** «245 · 12 معدّلة · 3 ملغاة» under «عدد المواد الكلي» (note ١٢ item ٧; zero parts left out). */
export function articleTallyLabel(t: ArticleTally): string {
  const parts = [String(t.total)];
  if (t.amended) parts.push(`${t.amended} معدّلة`);
  if (t.repealed) parts.push(`${t.repealed} ملغاة`);
  return parts.join(" · ");
}
