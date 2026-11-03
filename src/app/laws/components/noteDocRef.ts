/**
 * noteDocRef.ts — which document a «ملاحظاتي وتحديداتي» row belongs to, its
 * Arabic title and its type badge (owner note ٠٣ §٢.٢).
 * ─────────────────────────────────────────────────────────
 * WHERE THE BUG CAME FROM. A note row stores only the reader's page key
 * (public.law_article_notes.page_id for a signed-in reader, the
 * `sticky_note_text_<key>` localStorage keys for a guest). The four readers
 * build that key as:
 *
 *   laws        `<law slug>`                       laws/[slug]/page.tsx
 *   orders      `order-<decree uuid>`              laws/orders/[slug]/page.tsx
 *   precedents  `precedent-principles-<collection>` precedents/[slug]/page.tsx
 *   books       `feqh-<book id>-<block id>`        book/[slug]/page.tsx
 *
 * The widget turned the key itself into a name (dashes → spaces, so «real-
 * estate-ownership-law» became «...te ownership law» once truncated) and
 * looked for `precedents-` / `judgment-` — a prefix no reader writes — so
 * every judicial note was badged «الأنظمة واللوائح» and linked to /laws/….
 *
 * THE FIX. parseNotePageId reads all four keys (and the older `precedents-`,
 * `judgment-`, `orders-`, `book-` keys a browser may still hold); the titles
 * come from the library in ONE batched call (POST /api/library/folders/titles,
 * ≤ 100 ids per type); humaniseSlug is only the fallback for a document the
 * library no longer has, or while that call fails. Pure: noteDocRef.test.ts.
 */

import { resolveSavedItemHref } from "./smartFolderApiMapper.ts";

export type NoteDocKind = "law" | "precedent" | "order" | "book";

export interface NoteDocRef {
  pageId: string;
  kind: NoteDocKind;
  /** The document id (decoded once): law slug, decree uuid, collection id; for a book, the best guess. */
  id: string;
  /** Books only: every way to split `<book id>-<block id>`, longest book id first. */
  bookCandidates?: string[];
  /** An old `judgment-` key: its page was /precedents/judgment/<id>. */
  legacyJudgment?: boolean;
}

/** The owner's four badge names (note ٠٣ §٢.٢), in the grouped view's order. */
export const NOTE_TYPE_BADGES: Record<NoteDocKind, string> = {
  law: "الأنظمة واللوائح",
  precedent: "المبادئ والسوابق القضائية",
  book: "الكتب والمراجع",
  order: "الأوامر والتعاميم",
};
export const NOTE_KIND_ORDER: readonly NoteDocKind[] = ["law", "precedent", "book", "order"];

export function noteTypeBadge(kind: NoteDocKind): string {
  return NOTE_TYPE_BADGES[kind];
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

const MAX_BOOK_CANDIDATES = 12;

/** `<book id>-<block id>` → every prefix that ends before a «-», longest first (the block id may be empty). */
export function bookIdCandidates(rest: string): string[] {
  const trimmed = rest.replace(/-+$/, "");
  const out: string[] = [];
  if (trimmed) out.push(trimmed);
  for (let i = trimmed.length - 1; i > 0 && out.length < MAX_BOOK_CANDIDATES; i--) {
    if (trimmed[i] === "-") {
      const prefix = trimmed.slice(0, i).trim();
      if (prefix && !out.includes(prefix)) out.push(prefix);
    }
  }
  return out;
}

export function parseNotePageId(rawPageId: string): NoteDocRef {
  const pageId = String(rawPageId ?? "");
  const take = (prefix: string) => safeDecode(pageId.slice(prefix.length));
  if (pageId.startsWith("precedent-principles-")) return { pageId, kind: "precedent", id: take("precedent-principles-") };
  if (pageId.startsWith("precedents-")) return { pageId, kind: "precedent", id: take("precedents-") };
  if (pageId.startsWith("judgment-")) return { pageId, kind: "precedent", id: take("judgment-"), legacyJudgment: true };
  if (pageId.startsWith("order-")) return { pageId, kind: "order", id: take("order-") };
  if (pageId.startsWith("orders-")) return { pageId, kind: "order", id: take("orders-") };
  if (pageId.startsWith("feqh-")) {
    const candidates = bookIdCandidates(take("feqh-"));
    // With no title lookup, the shortest split is the likeliest book id: block
    // ids are appended to it, never prepended.
    return { pageId, kind: "book", id: candidates[candidates.length - 1] ?? "", bookCandidates: candidates };
  }
  if (pageId.startsWith("book-")) return { pageId, kind: "book", id: take("book-") };
  return { pageId, kind: "law", id: safeDecode(pageId) };
}

/** Old literal slugs whose names were hard-coded here before the title lookup (kept for guests' old keys). */
const KNOWN_NAMES: Record<string, string> = {
  "companies-law": "نظام الشركات",
  "labor-law": "نظام العمل",
  "labor-law-qadha": "نظام العمل",
  "civil-procedure": "نظام المرافعات الشرعية",
  "sharia-pleading-law-qadha-edition": "نظام المرافعات الشرعية ولائحته التنفيذية",
  "criminal-procedure": "نظام الإجراءات الجزائية",
  "criminal-procedure-law": "نظام الإجراءات الجزائية",
  "commercial-court": "نظام المحاكم التجارية",
  "commercial-courts-law": "نظام المحاكم التجارية ولوائحه التنفيذية",
  "civil-transactions": "نظام المعاملات المدنية",
  "civil-transactions-law": "نظام المعاملات المدنية",
  "evidence-law": "نظام الإثبات",
  "evidence-law-qadha-edition": "نظام الإثبات",
};

/** A readable name from an id alone: known names, then dashes/underscores → spaces. */
export function humaniseSlug(id: string): string {
  const decoded = safeDecode(id);
  if (KNOWN_NAMES[decoded]) return KNOWN_NAMES[decoded];
  return decoded
    .replace(/(_وزارة_العدل|-وزارة_العدل)$/g, "")
    .replace(/(-منقحة)$/g, " (منقحة)")
    .replace(/---/g, "\u0000")
    .replace(/[-_]+/g, " ")
    .replace(/\u0000/g, " - ")
    .replace(/\s+/g, " ")
    .trim();
}

const ARABIC = /[؀-ۿ]/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TitleMaps {
  laws?: Record<string, string>;
  orders?: Record<string, string>;
  precedents?: Record<string, string>;
  books?: Record<string, string>;
}

const MAP_KEY: Record<NoteDocKind, keyof TitleMaps> = {
  law: "laws",
  order: "orders",
  precedent: "precedents",
  book: "books",
};

/** For a book: the longest candidate the library knows; else ref.id. */
export function resolvedDocId(ref: NoteDocRef, titles: TitleMaps | null): string {
  if (ref.kind !== "book" || !ref.bookCandidates) return ref.id;
  const books = titles?.books ?? {};
  return ref.bookCandidates.find(c => books[c]) ?? ref.id;
}

/**
 * The name a row shows:
 *   1. the library's Arabic title, when the lookup returned one;
 *   2. while the lookup is still running: a known name or an Arabic id, else
 *      a neutral «جارٍ جلب العنوان…» — never a half-English slug;
 *   3. after it ran (or failed): the humanised id; an order's bare uuid
 *      becomes «تعميم أو قرار» rather than 36 hex characters.
 */
export function noteDisplayTitle(ref: NoteDocRef, titles: TitleMaps | null, lookupSettled: boolean): string {
  const id = resolvedDocId(ref, titles);
  const found = titles?.[MAP_KEY[ref.kind]]?.[id];
  if (found) return found;
  const decoded = safeDecode(id);
  if (KNOWN_NAMES[decoded]) return KNOWN_NAMES[decoded];
  if (ARABIC.test(decoded)) return humaniseSlug(decoded);
  if (!lookupSettled) return "جارٍ جلب العنوان…";
  if (ref.kind === "order" && UUID.test(decoded)) return "أمر أو تعميم";
  return humaniseSlug(decoded) || noteTypeBadge(ref.kind);
}

/** The reader page a row opens. */
export function noteDocHref(ref: NoteDocRef, titles: TitleMaps | null): string {
  if (ref.legacyJudgment) return `/precedents/judgment/${encodeURIComponent(ref.id)}`;
  return resolveSavedItemHref({ slug: resolvedDocId(ref, titles), type: ref.kind });
}

export const TITLE_LOOKUP_MAX_PER_KIND = 100;

/** The one POST /api/library/folders/titles body for many rows; null when there is nothing to ask. */
export function buildTitleLookup(refs: readonly NoteDocRef[]): Record<keyof TitleMaps, string[]> | null {
  const sets: Record<keyof TitleMaps, Set<string>> = { laws: new Set(), orders: new Set(), precedents: new Set(), books: new Set() };
  for (const ref of refs) {
    const key = MAP_KEY[ref.kind];
    if (ref.kind === "book" && ref.bookCandidates) {
      for (const c of ref.bookCandidates) sets.books.add(c);
    } else if (ref.kind === "order") {
      if (UUID.test(ref.id)) sets.orders.add(ref.id);
    } else if (ref.id) {
      sets[key].add(ref.id);
    }
  }
  const out = {
    laws: Array.from(sets.laws).slice(0, TITLE_LOOKUP_MAX_PER_KIND),
    orders: Array.from(sets.orders).slice(0, TITLE_LOOKUP_MAX_PER_KIND),
    precedents: Array.from(sets.precedents).slice(0, TITLE_LOOKUP_MAX_PER_KIND),
    books: Array.from(sets.books).slice(0, TITLE_LOOKUP_MAX_PER_KIND),
  };
  return out.laws.length + out.orders.length + out.precedents.length + out.books.length > 0 ? out : null;
}

/** One batched title call; resolves to null on any failure (the rows keep their fallback names). */
export async function fetchLibraryTitles(
  body: Record<keyof TitleMaps, string[]>,
  fetchImpl: typeof fetch = fetch,
): Promise<TitleMaps | null> {
  try {
    const res = await fetchImpl("/api/library/folders/titles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json && typeof json === "object" && json.titles && typeof json.titles === "object" ? (json.titles as TitleMaps) : null;
  } catch {
    return null;
  }
}
