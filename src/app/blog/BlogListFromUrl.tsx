"use client";

// /blog's list as the URL asks for it: `?category=<label>` for a label with no
// category page of its own (4 Oct item 99). The one reader of useSearchParams,
// so /blog renders it inside <Suspense> — whose fallback is <BlogList /> itself
// (the unfiltered list), which the server renders: the first HTML keeps the
// heading and the page around it (owner package 25-Nov, annex 09 GSC-02).

import { useSearchParams } from "next/navigation";
import BlogList from "./BlogList";

export default function BlogListFromUrl() {
  const searchParams = useSearchParams();
  return <BlogList urlCategory={searchParams.get("category")} />;
}
