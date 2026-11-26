// /blog/category/<slug> — one page per blog category (4 Oct item 99; the
// owner's example is /blog/category/labor). Server component: the 30 pages
// are fixed by ../../_categories.ts and prerendered at build time, each with
// its own Arabic title, description and canonical URL. The list is the same
// <BlogList> /blog renders, filtered by the category. No database read here:
// the articles are fetched by the list, as on /blog. The list reads no search
// params, so it needs no <Suspense> and the server renders it whole — heading
// included — with the page's CollectionPage + BreadcrumbList JSON-LD (owner
// package 25-Nov, annex 09 GSC-02).

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buildMetadata } from "@/lib/seo";
import { buildBlogListJsonLd, serializeJsonLd } from "@/lib/publicSeo/structuredData";
import BlogList from "../../BlogList";
import { BLOG_CATEGORY_PAGES, blogCategoryBySlug } from "../../_categories";

type Props = { params: Promise<{ slug: string }> };

// Only the 30 slugs below exist; any other answers 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return BLOG_CATEGORY_PAGES.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const category = blogCategoryBySlug(slug);
  // No database read: an unknown slug is a definite miss, so a real 404
  // (dynamicParams = false answers it first; this is the belt).
  if (!category) notFound();
  return buildMetadata({
    titleAr: `${category.label} — المدونة القانونية`,
    descriptionAr: `مقالات المدونة القانونية في ${category.label}.`,
    path: `/blog/category/${category.slug}`,
    keywords: ["مقالات قانونية", category.label],
  });
}

export default async function BlogCategoryPage({ params }: Props) {
  const { slug } = await params;
  const category = blogCategoryBySlug(slug);
  if (!category) notFound();
  const jsonLd = buildBlogListJsonLd({
    name: category.label,
    description: `مقالات المدونة القانونية في ${category.label}.`,
    path: `/blog/category/${category.slug}`,
    categoryLabel: category.label,
  });
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      <BlogList key={category.slug} categorySlug={category.slug} />
    </>
  );
}
