// /blog — the list of every published article. The list itself is the client
// component <BlogList>, shared with the category pages
// (/blog/category/<slug>); its metadata is ./layout.tsx's. <BlogList> reads
// the URL's `?category=`, so it renders inside <Suspense> (Next 16 asks for a
// boundary around useSearchParams on a prerendered route).
//
// It sits in the (list) route group with its own loading.tsx (owner file 20 §2,
// file 15 row 42; batch l9): a loading boundary above /blog/[slug] streamed a
// 200 before the article's notFound() could run (a soft 404). The group
// changes no URL: this is still /blog.

import { Suspense } from "react";
import type { Metadata } from "next";
import { buildMetadata, BASE_URL } from "@/lib/seo";
import BlogList from "../BlogList";

const base = buildMetadata({
  titleAr: "المدونة القانونية",
  titleEn: "Legal Blog",
  descriptionAr: "مقالات قانونية متخصصة في الأنظمة السعودية — عمالي، مدني، تجاري، أسري، وأكثر",
  descriptionEn: "Specialized legal articles on Saudi regulations — labor, civil, commercial, family, and more",
  path: "/blog",
  keywords: ["مقالات قانونية","نظام سعودي","حقوق قانونية"],
});

// /blog's own head (moved from ../layout.tsx in batch l9) + the feed link.
export const metadata: Metadata = {
  ...base,
  alternates: {
    ...base.alternates,
    types: { "application/rss+xml": [{ url: `${BASE_URL}/blog/rss.xml`, title: "المدونة القانونية — نظامي" }] },
  },
};

export default function BlogPage() {
  return (
    <Suspense fallback={null}>
      <BlogList />
    </Suspense>
  );
}
