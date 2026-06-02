import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  titleAr: "المدونة القانونية",
  titleEn: "Legal Blog",
  descriptionAr: "مقالات قانونية متخصصة في الأنظمة السعودية — عمالي، مدني، تجاري، أسري، وأكثر",
  descriptionEn: "Specialized legal articles on Saudi regulations — labor, civil, commercial, family, and more",
  path: "/blog",
  keywords: ["مقالات قانونية","نظام سعودي","حقوق قانونية"],
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
