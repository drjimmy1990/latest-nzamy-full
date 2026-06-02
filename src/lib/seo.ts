import type { Metadata } from "next";

const BASE_URL = "https://nezamy.online";
const SITE_NAME = "نظامي | Nzamy";
const DEFAULT_OG = `${BASE_URL}/og-image.png`;

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
