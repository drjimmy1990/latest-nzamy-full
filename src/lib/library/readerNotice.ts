/**
 * q390 (S1 Task 4): the honest notice a precedents or book reader shows when
 * the server has no text for it. There is no bundled fallback any more, so a
 * missing collection is either «قريباً» (a legacy catalogue slug), not found,
 * text still being added, or a load error — never protected text from JS.
 *
 * Pure, so the client readers and node:test can both load it.
 */
import { legacyTarget } from "./legacyLibrarySlugs.ts";

export type ReaderNotice = {
  kind: "not_found" | "coming_soon" | "text_pending" | "load_error";
  titleAr: string;
  bodyAr: string;
};

interface NoticeCopy {
  kind: "collection" | "book";
  loadErrorTitle: string;
  loadErrorBody: string;
  comingSoonBody: string;
  notFoundTitle: string;
  notFoundBody: string;
  textPendingTitle: string;
  textPendingBody: string;
}

const COLLECTION: NoticeCopy = {
  kind: "collection",
  loadErrorTitle: "تعذّر تحميل المجموعة",
  loadErrorBody: "تعذّر تحميل المجموعة، حاول مجدداً",
  comingSoonBody: "هذه المجموعة قريباً في المكتبة القانونية.",
  notFoundTitle: "المجموعة غير موجودة",
  notFoundBody: "المجموعة المطلوبة غير موجودة في المكتبة.",
  textPendingTitle: "قريباً",
  textPendingBody: "نص هذه المجموعة قيد الإضافة — قريباً.",
};

const BOOK: NoticeCopy = {
  kind: "book",
  loadErrorTitle: "تعذّر تحميل الكتاب",
  loadErrorBody: "تعذّر تحميل الكتاب، حاول مجدداً",
  comingSoonBody: "هذا الكتاب قريباً في المكتبة القانونية.",
  // Today's book reader copy, kept.
  notFoundTitle: "عفواً، الكتاب غير موجود",
  notFoundBody: "لم نتمكن من العثور على هذا الكتاب الفقهي في المكتبة.",
  textPendingTitle: "قريباً",
  textPendingBody: "نص هذا الكتاب قيد الإضافة — قريباً.",
};

function notice(
  copy: NoticeCopy,
  status: number | null,
  slug: string,
  count: number | null,
  error: string | null,
): ReaderNotice | null {
  const errorText = typeof error === "string" && error.trim() !== "" ? error : null;
  // A server error, or a request that failed before any status came back.
  if ((status !== null && status >= 500) || (status === null && errorText !== null)) {
    return { kind: "load_error", titleAr: copy.loadErrorTitle, bodyAr: errorText ?? copy.loadErrorBody };
  }
  const legacy = legacyTarget(copy.kind, slug);
  if (status === 404) {
    return legacy
      ? { kind: "coming_soon", titleAr: legacy.titleAr, bodyAr: copy.comingSoonBody }
      : { kind: "not_found", titleAr: copy.notFoundTitle, bodyAr: copy.notFoundBody };
  }
  if (status === 200 && count === 0) {
    return { kind: "text_pending", titleAr: legacy?.titleAr ?? copy.textPendingTitle, bodyAr: copy.textPendingBody };
  }
  return null;
}

/** The precedents reader's notice; null = render the collection (or keep loading). */
export function collectionNotice(i: {
  status: number | null;
  slug: string;
  total: number | null;
  error: string | null;
}): ReaderNotice | null {
  return notice(COLLECTION, i.status, i.slug, i.total, i.error);
}

/** The book reader's notice; null = render the book (or keep loading). */
export function bookNotice(i: {
  status: number | null;
  slug: string;
  blocks: number | null;
  error: string | null;
}): ReaderNotice | null {
  return notice(BOOK, i.status, i.slug, i.blocks, i.error);
}
