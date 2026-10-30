/**
 * saveToFolder — owner note ٠٤ (last bullet, 2026-10-30): every /laws result
 * card (law, judicial collection, order, fiqh book) has a «حفظ في مجلد»
 * button that opens the shared FolderSelectionModal for that document.
 *
 * These builders turn a card's row into the modal's `currentDoc`. A row with
 * no id gives null — the card then shows no button rather than saving a
 * document the folder cannot open again.
 *
 * Pure: `node --test src/app/laws/saveToFolder.test.ts`.
 */

export type SaveDocType = "law" | "precedent" | "order" | "book";

/** FolderSelectionModal's `currentDoc` (src/components/laws/FolderSelectionModal.tsx). */
export interface SaveToFolderDoc {
  slug: string;
  title: string;
  titleEn: string;
  catId: string;
  type: SaveDocType;
}

function text(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

function build(type: SaveDocType, slug: unknown, title: unknown, titleEn: unknown, catId: unknown): SaveToFolderDoc | null {
  const s = text(slug);
  const t = text(title);
  if (!s || !t) return null;
  return { slug: s, title: t, titleEn: text(titleEn) || t, catId: text(catId), type };
}

/** A law card (catalogue or search; a search card's slug is the law's). */
export function lawSaveDoc(sys: { slug?: unknown; title?: unknown; titleEn?: unknown; cat?: unknown } | null | undefined): SaveToFolderDoc | null {
  return sys ? build("law", sys.slug, sys.title, sys.titleEn, sys.cat) : null;
}

/** A judicial collection (catalogue card, search card or a grouped principle card). */
export function collectionSaveDoc(col: { id?: unknown; slug?: unknown; title?: unknown } | null | undefined): SaveToFolderDoc | null {
  return col ? build("precedent", text(col.slug) || text(col.id), col.title, "", "") : null;
}

/** An order / circular. */
export function orderSaveDoc(o: { id?: unknown; title?: unknown; cat?: unknown } | null | undefined): SaveToFolderDoc | null {
  return o ? build("order", o.id, o.title, "", o.cat) : null;
}

/** A fiqh book (a search card's slug is the book's). */
export function bookSaveDoc(book: { slug?: unknown; title?: unknown; bookTitle?: unknown } | null | undefined): SaveToFolderDoc | null {
  return book ? build("book", book.slug, text(book.bookTitle) || text(book.title), "", "") : null;
}
