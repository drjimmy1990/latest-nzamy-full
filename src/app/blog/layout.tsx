import type { Metadata } from "next";
import { buildMetadata, BASE_URL } from "@/lib/seo";

const base = buildMetadata({
  titleAr: "المدونة القانونية",
  titleEn: "Legal Blog",
  descriptionAr: "مقالات قانونية متخصصة في الأنظمة السعودية — عمالي، مدني، تجاري، أسري، وأكثر",
  descriptionEn: "Specialized legal articles on Saudi regulations — labor, civil, commercial, family, and more",
  path: "/blog",
  keywords: ["مقالات قانونية","نظام سعودي","حقوق قانونية"],
});

// P1-39: the feed, advertised in the head as <link rel="alternate" type="application/rss+xml">.
export const metadata: Metadata = {
  ...base,
  alternates: {
    ...base.alternates,
    types: { "application/rss+xml": [{ url: `${BASE_URL}/blog/rss.xml`, title: "المدونة القانونية — نظامي" }] },
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
