/**
 * libraryMetadata — what a library document may say about itself in <head>,
 * in JSON-LD and in the sitemaps (owner note ١٤, phase 1; answers ٣١٨ / ٣١٩).
 * ─────────────────────────────────────────────────────────────────────────────
 * Everything here is PUBLIC output: a search engine, a link preview and every
 * visitor read it. So it is built as a guest sees the document, never as the
 * person who requested the page:
 *   - the description is the public موجز through summaryForViewer(…, false)
 *     (٣١٩: decree numbers and issue dates stripped on the server), then with
 *     every link and bare domain removed (٣١٨: official links are
 *     subscribers' — never in <head>, JSON-LD or SSR), then cut to ~160
 *     characters. A text that still leaks after that falls back to a generic
 *     line: shorter, never leaked;
 *   - the only date is the visitor's «آخر تحديث تشريعي»
 *     (latestLegislativeEvent(...).iso) — as JSON-LD `dateModified` and as a
 *     law's sitemap lastModified. Never datePublished, legislationDate,
 *     legislationIdentifier or legislationPassedBy: those are exactly the
 *     locked decree and date fields;
 *   - no sameAs, no official URL, no FAQPage (owner note ١٤ §٣: FAQPage is
 *     banned from the library), no city lists (GEO is legislationJurisdiction
 *     "SA" only);
 *   - the schema.org @type comes from the document's kind, never from data.
 *
 * Pure: `node --test` loads it directly (relative .ts imports only).
 */

import { latestLegislativeEvent, summaryForViewer, summaryLeaksOfficialRefs, stripOfficialRefsFromSummary } from "./legislativeEvent.ts";
import { apiSlug } from "../../utils/apiSlug.ts";

export const SITE_URL = "https://nezamy.sa";
/** The brand appended ONCE to a library document's <title>. */
export const LIBRARY_TITLE_BRAND = "نظامي";
/** The cut for a meta description, in characters. */
export const DESCRIPTION_MAX = 160;

export type LibraryDocKind = "law" | "order" | "collection" | "book";

/** The reader route of each kind (the path segment before the id). */
const KIND_BASE: Record<LibraryDocKind, string> = {
  law: "/laws",
  order: "/laws/orders",
  collection: "/precedents",
  book: "/book",
};

/** A document's path, its id encoded exactly once (apiSlug: decode, then encode). */
export function libraryDocPath(kind: LibraryDocKind, id: string): string {
  return `${KIND_BASE[kind]}/${apiSlug(id)}`;
}

export function libraryDocUrl(kind: LibraryDocKind, id: string): string {
  return `${SITE_URL}${libraryDocPath(kind, id)}`;
}

/** A route param as the database stores it: decoded once, safely. */
export function decodeRouteSlug(raw: string | string[] | undefined | null): string {
  if (raw === undefined || raw === null) return "";
  const s = Array.isArray(raw) ? raw.join("/") : raw;
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/* ── Text cleaning ───────────────────────────────────────────────────────── */

const BIDI = /[‎‏؜‪-‮⁦-⁩]/g;

/** A link or a bare domain: what may never reach <head>, JSON-LD or the shell. */
const LINK_OR_DOMAIN = /https?:\/\/|www\.|(?<![\p{L}\p{N}@])[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:sa|com|net|org|gov|edu|int|info|io)(?![a-z0-9])/iu;

/** `text` without links: a markdown link reads as its text, a bare URL or domain goes. */
export function removeLinks(text: string): string {
  return String(text ?? "")
    .replace(BIDI, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<\s*(?:https?:\/\/|www\.)[^>]*>/gi, "")
    .replace(/(?:https?:\/\/|www\.)[^\s)\]»"'،]*/gi, "")
    .replace(/(?<![\p{L}\p{N}@])[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:sa|com|net|org|gov|edu|int|info|io)(?![a-z0-9])(?:\/[^\s)\]»"'،]*)?/giu, "")
    .replace(/\(\s*\)/g, "");
}

/** Markdown / HTML to one plain line. */
export function plainText(text: string): string {
  return String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/^[ \t]*#{1,6}[ \t]*/gm, "")
    .replace(/^[ \t]*>[ \t]?/gm, "")
    .replace(/^[ \t]*[-*•+][ \t]+/gm, "")
    .replace(/^[ \t]*:?-{3,}:?[ \t]*$/gm, "")
    .replace(/\*+|__|`+/g, "")
    .replace(/\|/g, " ")
    .replace(/[ \t]*\n+[ \t]*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Cut at a word boundary to at most `max` characters, with «…» when cut. */
export function cutAtWord(text: string, max: number = DESCRIPTION_MAX): string {
  const s = text.trim();
  if (s.length <= max) return s;
  let cut = s.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  if (space > max * 0.6) cut = cut.slice(0, space);
  return `${cut.replace(/[\s،؛:,;.\-–—(«]+$/u, "")}…`;
}

/** A trailing brand («- نظامي | Nezamy», «| نظامي», «— Nezamy»), however often it repeats. */
const BRAND_SUFFIX = /(?:\s*[|\-–—:]\s*(?:منصة\s+)?(?:نظامي|Nezamy)(?=\s*(?:[|\-–—:]|$)))+\s*$/iu;

export function stripBrandSuffix(title: string): string {
  return String(title ?? "").replace(BRAND_SUFFIX, "").trim();
}

/** True when public text still carries a decree number, a date or a link. */
export function publicTextLeaks(text: string): boolean {
  return summaryLeaksOfficialRefs(text) || LINK_OR_DOMAIN.test(text.replace(BIDI, ""));
}

/** The موجز as a guest may read it (٣١٩ + ٣١٨), one plain line, uncut. */
export function guestPlainText(raw: string | null | undefined): string {
  // Links first: a URL's digits must not be read as a date by the stripper.
  const stripped = summaryForViewer(removeLinks(String(raw ?? "")), false);
  // A heading is the block's label («## 📝 موجز النظام»), not its text.
  const body = stripped.replace(/^[ \t]*#{1,6}[^\n]*$/gm, "").replace(/<summary>[\s\S]*?<\/summary>/gi, "");
  return plainText(removeLinks(body)).replace(/[\p{Extended_Pictographic}️]/gu, "").replace(/\s{2,}/g, " ").trim();
}

const GENERIC_DESCRIPTION: Record<LibraryDocKind, string> = {
  law: "نص النظام في مكتبة نظامي: الأبواب والمواد وآخر تحديث تشريعي.",
  order: "نص الأمر أو القرار أو التعميم في مكتبة نظامي.",
  collection: "مجموعة أحكام ومبادئ قضائية سعودية في مكتبة نظامي.",
  book: "كتاب فقهي في مكتبة نظامي.",
};

/**
 * A meta description for a document: the first candidate that is non-empty
 * once cleaned (guestPlainText), cut to DESCRIPTION_MAX — or the kind's
 * generic line. A cleaned text that still leaks is skipped, never shipped.
 */
export function publicDescription(kind: LibraryDocKind, ...candidates: Array<string | null | undefined>): string {
  for (const raw of candidates) {
    const text = cutAtWord(guestPlainText(raw));
    if (text.length >= 12 && !publicTextLeaks(text)) return text;
  }
  return GENERIC_DESCRIPTION[kind];
}

/** decrees_circulars.type → the instrument as a visitor reads it. */
export const ORDER_TYPE_LABEL: Record<string, string> = {
  royal: "مرسوم ملكي",
  cabinet: "قرار مجلس الوزراء",
  circular: "تعميم",
};

const KIND_FALLBACK_TITLE: Record<LibraryDocKind, string> = {
  law: "نظام",
  order: "أمر أو قرار",
  collection: "مجموعة أحكام قضائية",
  book: "كتاب فقهي",
};

export interface PublicTitleInput {
  title: string | null | undefined;
  /** A law's library.laws.type / a decree's decrees_circulars.type. */
  type?: string | null;
  /** An order's موجز, for the subject when the title was only its number and date. */
  summary?: string | null;
}

/**
 * The document's name as it may appear in <title>, JSON-LD `name` and the
 * shell: no link, no trailing brand; for a law or an order also no decree
 * number or date (٣١٩) — a decree's title is often only «المرسوم الملكي رقم
 * م/44 وتاريخ 1446/02/08هـ», so what is left («المرسوم الملكي») takes its
 * subject from the موجز: «المرسوم الملكي — إنشاء الهيئة العليا لأندية الفروسية».
 * A collection's or a book's title keeps its year («… لعام ١٤٤٣هـ» is the
 * volume's identity, not a decree date).
 */
export function publicDocumentTitle(kind: LibraryDocKind, input: PublicTitleInput): string {
  // The brand goes before plainText, which turns a table's «|» into a space.
  const base = stripBrandSuffix(plainText(removeLinks(stripBrandSuffix(String(input.title ?? "")))));
  if (kind === "collection" || kind === "book") {
    return base || KIND_FALLBACK_TITLE[kind];
  }
  let title = stripBrandSuffix(plainText(stripOfficialRefsFromSummary(base)))
    .replace(/(?:\s+(?:رقم|بالرقم|وتاريخ|بتاريخ|تاريخ|الصادر|الصادرة))+\s*$/u, "")
    .replace(/[\s،؛:,;\-–—]+$/u, "")
    .trim();
  const typeLabel = kind === "order" ? ORDER_TYPE_LABEL[String(input.type ?? "")] ?? "" : "";
  if (kind === "order" && (title !== base || !title)) {
    const subject = cutAtWord(guestPlainText(input.summary), 70);
    const head = title || typeLabel || KIND_FALLBACK_TITLE.order;
    if (subject && !publicTextLeaks(subject) && subject !== head) title = `${head} — ${subject}`;
    else title = head;
  }
  if (!title || publicTextLeaks(title)) {
    return typeLabel || (kind === "law" && input.type && !publicTextLeaks(String(input.type)) ? String(input.type) : KIND_FALLBACK_TITLE[kind]);
  }
  return title;
}

/** «<name> | نظامي» — the brand appended once, whatever the source title carried. */
export function libraryPageTitle(name: string): string {
  const clean = stripBrandSuffix(name) || "مكتبة نظامي";
  return `${clean} | ${LIBRARY_TITLE_BRAND}`;
}

/* ── JSON-LD ─────────────────────────────────────────────────────────────── */

export interface LibraryDocSeo {
  kind: LibraryDocKind;
  /** The database id / slug, decoded. */
  id: string;
  /** publicDocumentTitle(...) — already clean. */
  name: string;
  /** publicDescription(...) — already clean. */
  description: string;
  /** The visitor's «آخر تحديث تشريعي» as YYYY-MM-DD, or null (laws only). */
  dateModified: string | null;
  /** A law's own kind («نظام», «لائحة تنفيذية») or an order's instrument label. */
  legislationType?: string | null;
  /** A book's author. */
  author?: string | null;
  /** A collection's ruling count. */
  collectionSize?: number | null;
}

const SECTION_CRUMB: Record<LibraryDocKind, { name: string; path: string }> = {
  law: { name: "مكتبة الأنظمة", path: "/laws" },
  order: { name: "مكتبة الأنظمة", path: "/laws" },
  collection: { name: "السوابق القضائية", path: "/precedents" },
  book: { name: "مكتبة الأنظمة", path: "/laws" },
};

/** The ISO day of a law's latest legislative event (٣١٧ / ٣١٨), or null. */
export function lawDateModified(row: { latest_update?: unknown; issue_date_hijri?: unknown }): string | null {
  const iso = latestLegislativeEvent(row)?.iso ?? null;
  return iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

/**
 * The page's JSON-LD: the document (Legislation / Collection / Book) and its
 * BreadcrumbList, in one @graph. Only the fields listed here can appear.
 */
export function buildLibraryJsonLd(doc: LibraryDocSeo): Record<string, unknown> {
  const url = libraryDocUrl(doc.kind, doc.id);
  const name = publicTextLeaks(doc.name) && (doc.kind === "law" || doc.kind === "order") ? KIND_FALLBACK_TITLE[doc.kind] : doc.name;
  const description = doc.description && !publicTextLeaks(doc.description) ? doc.description : "";
  const main: Record<string, unknown> = { "@id": `${url}#document`, name, url, inLanguage: "ar" };
  if (description) main.description = description;

  if (doc.kind === "law" || doc.kind === "order") {
    main["@type"] = "Legislation";
    main.legislationJurisdiction = "SA";
    const type = String(doc.legislationType ?? "").trim();
    if (type && !publicTextLeaks(type)) main.legislationType = type;
    // ٣١٨: the one date a visitor sees. Never datePublished / legislationDate.
    if (doc.kind === "law" && doc.dateModified && /^\d{4}-\d{2}-\d{2}$/.test(doc.dateModified)) {
      main.dateModified = doc.dateModified;
    }
  } else if (doc.kind === "collection") {
    main["@type"] = "Collection";
    if (typeof doc.collectionSize === "number" && doc.collectionSize > 0) main.collectionSize = doc.collectionSize;
  } else {
    main["@type"] = "Book";
    const author = plainText(removeLinks(String(doc.author ?? "")));
    if (author && !LINK_OR_DOMAIN.test(author)) main.author = { "@type": "Person", name: author };
  }

  const section = SECTION_CRUMB[doc.kind];
  const breadcrumb = {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "الرئيسية", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: section.name, item: `${SITE_URL}${section.path}` },
      { "@type": "ListItem", position: 3, name, item: url },
    ],
  };
  return { "@context": "https://schema.org", "@graph": [main, breadcrumb] };
}

/**
 * JSON for a <script type="application/ld+json">: `<`, `>` and `&` escaped so
 * no value can close the script («</script>»), and U+2028 / U+2029 too.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(new RegExp(String.fromCharCode(0x2028), "g"), "\\u2028")
    .replace(new RegExp(String.fromCharCode(0x2029), "g"), "\\u2029");
}

/* ── Sitemaps ────────────────────────────────────────────────────────────── */

/**
 * The library's segmented sitemaps — DOCUMENTS only (never the 13k articles,
 * never /precedents/judgment, a «قريباً» screen). Served by
 * src/app/library-sitemaps/sitemap.ts at /library-sitemaps/sitemap/<id>.xml
 * and listed in robots.txt (Next emits no sitemap index).
 */
export const LIBRARY_SITEMAP_IDS = ["laws", "orders", "collections", "books"] as const;
export type LibrarySitemapId = (typeof LIBRARY_SITEMAP_IDS)[number];

export const SITEMAP_KIND: Record<LibrarySitemapId, LibraryDocKind> = {
  laws: "law",
  orders: "order",
  collections: "collection",
  books: "book",
};

export function librarySitemapUrls(): string[] {
  return LIBRARY_SITEMAP_IDS.map((id) => `${SITE_URL}/library-sitemaps/sitemap/${id}.xml`);
}

export interface LibrarySitemapEntry {
  url: string;
  lastModified?: string;
  changeFrequency: "monthly";
  priority: number;
}

const SITEMAP_PRIORITY: Record<LibraryDocKind, number> = { law: 0.7, order: 0.6, collection: 0.6, book: 0.5 };

/** One sitemap row: the URL encoded once, lastModified only from a real ISO day. */
export function librarySitemapEntry(kind: LibraryDocKind, id: string, lastModified?: string | null): LibrarySitemapEntry | null {
  const clean = String(id ?? "").trim();
  if (!clean) return null;
  const entry: LibrarySitemapEntry = { url: libraryDocUrl(kind, clean), changeFrequency: "monthly", priority: SITEMAP_PRIORITY[kind] };
  if (lastModified && /^\d{4}-\d{2}-\d{2}$/.test(lastModified)) entry.lastModified = lastModified;
  return entry;
}
