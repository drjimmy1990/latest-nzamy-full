import type { Metadata } from "next";
import { BASE_URL } from "@/lib/seo";

// P1-39: the feed, advertised in the head as <link rel="alternate" type="application/rss+xml">.
// Batch l9 (file 20 §2): only the feed link here. /blog's title, canonical and
// index,follow are the list page's own (./(list)/page.tsx): set here, a missing
// article's 404 inherited /blog's canonical, which the owner's check forbids.
export const metadata: Metadata = {
  alternates: {
    types: { "application/rss+xml": [{ url: `${BASE_URL}/blog/rss.xml`, title: "المدونة القانونية — نظامي" }] },
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
