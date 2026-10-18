// /blog — the list of every published article. The list itself is the client
// component <BlogList>, shared with the category pages
// (/blog/category/<slug>); its metadata is ./layout.tsx's. <BlogList> reads
// the URL's `?category=`, so it renders inside <Suspense> (Next 16 asks for a
// boundary around useSearchParams on a prerendered route).

import { Suspense } from "react";
import BlogList from "./BlogList";

export default function BlogPage() {
  return (
    <Suspense fallback={null}>
      <BlogList />
    </Suspense>
  );
}
