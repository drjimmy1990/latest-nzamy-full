import type { Metadata } from "next";
import {
  libraryDocPath,
  libraryPageTitle,
  publicDescription,
  publicDocumentTitle,
  type LibraryDocKind,
} from "./library/libraryMetadata.ts";

export const BASE_URL = "https://nezamy.sa";
const SITE_NAME = "نظامي | Nezamy";
const DEFAULT_OG = `${BASE_URL}/og-image.png`;
/** public/og-image.png is 1024×1024 (the root layout's own declaration). */
const DEFAULT_OG_SIZE = { width: 1024, height: 1024 } as const;

interface SeoOptions {
  titleAr: string;
  titleEn?: string;
  descriptionAr: string;
  descriptionEn?: string;
  path: string;
  keywords?: string[];
  noIndex?: boolean;
}

export function buildMetadata({
  titleAr,
  titleEn,
  descriptionAr,
  descriptionEn,
  path,
  keywords = [],
  noIndex = false,
}: SeoOptions): Metadata {
  const title = titleEn ? `${titleAr} | ${titleEn}` : titleAr;
  const description = descriptionEn
    ? `${descriptionAr} | ${descriptionEn}`
    : descriptionAr;
  const url = `${BASE_URL}${path}`;

  return {
    title: `${title} - ${SITE_NAME}`,
    description,
    keywords: [
      "محامي سعودي",
      "استشارة قانونية",
      "نظامي",
      "منصة قانونية",
      ...keywords,
    ],
    alternates: { canonical: url },
    robots: noIndex
      ? { index: false, follow: false }
      : { index: true, follow: true },
    openGraph: {
      title: `${title} - ${SITE_NAME}`,
      description,
      url,
      siteName: SITE_NAME,
      locale: "ar_SA",
      type: "website",
      images: [{ url: DEFAULT_OG, width: 1200, height: 630, alt: titleAr }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} - ${SITE_NAME}`,
      description,
      images: [DEFAULT_OG],
    },
  };
}

/* ── Library documents (owner note ١٤, phase 1) ──────────────────────────── */

export interface LibraryMetadataInput {
  kind: LibraryDocKind;
  /** The document's id / slug, decoded (the path encodes it once). */
  id: string;
  /** Its name — cleaned again here (publicDocumentTitle is idempotent). */
  name: string;
  /** Its public موجز or description — cleaned and cut again here. */
  description: string | null | undefined;
  noIndex?: boolean;
}

/**
 * A library document's <head>: its own title and description, built as a
 * GUEST sees the document (owner answers ٣١٨ / ٣١٩), whoever asked.
 *   - title «<name> | نظامي»: the brand once — no «- نظامي | Nezamy» from
 *     buildMetadata, no brand the source title already carried (the owner's
 *     «| نظامي - نظامي»); a law's or decree's name loses its decree number
 *     and date (publicDocumentTitle);
 *   - description: the public موجز stripped of decree numbers and issue dates
 *     (summaryForViewer(…, false)), of every link and bare domain, cut to
 *     ~160 characters — or a generic line when nothing safe is left;
 *   - og-image.png kept (a child openGraph/twitter replaces the root's whole,
 *     so the image is set here explicitly);
 *   - no URL other than the page's own canonical on nezamy.sa.
 */
export function buildLibraryMetadata({ kind, id, name, description, noIndex = false }: LibraryMetadataInput): Metadata {
  const docName = publicDocumentTitle(kind, { title: name });
  const title = libraryPageTitle(docName);
  const desc = publicDescription(kind, description);
  const url = `${BASE_URL}${libraryDocPath(kind, id)}`;
  return {
    title,
    description: desc,
    alternates: { canonical: url },
    robots: noIndex ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: {
      title,
      description: desc,
      url,
      siteName: "نظامي",
      locale: "ar_SA",
      type: "article",
      images: [{ url: DEFAULT_OG, ...DEFAULT_OG_SIZE, alt: docName }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: desc,
      images: [DEFAULT_OG],
    },
  };
}

const LIBRARY_SECTION_TITLE: Record<LibraryDocKind, string> = {
  law: "مكتبة الأنظمة والتشريعات السعودية",
  order: "الأوامر والقرارات والتعاميم",
  collection: "السوابق القضائية",
  book: "الكتب الفقهية",
};

/**
 * The <head> of a library page whose document could not be shown: closed
 * library or no such document (noIndex), or a failed read (indexable — a
 * passing outage must not de-index a real page). No database value in it.
 */
export function buildLibraryFallbackMetadata(kind: LibraryDocKind, { noIndex }: { noIndex: boolean }): Metadata {
  const title = libraryPageTitle(LIBRARY_SECTION_TITLE[kind]);
  const description = publicDescription(kind);
  return {
    title,
    description,
    robots: noIndex ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: {
      title,
      description,
      siteName: "نظامي",
      locale: "ar_SA",
      type: "website",
      images: [{ url: DEFAULT_OG, ...DEFAULT_OG_SIZE, alt: title }],
    },
    twitter: { card: "summary_large_image", title, description, images: [DEFAULT_OG] },
  };
}
