import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  titleAr: "البحث القانوني AI",
  titleEn: "AI Legal Research",
  descriptionAr: "ابحث في الأنظمة والمراسيم الملكية والسوابق القضائية السعودية بمساعدة الذكاء الاصطناعي",
  descriptionEn: "Search Saudi regulations, royal decrees, and judicial precedents with AI assistance",
  path: "/ai/research",
  keywords: ["بحث قانوني","أنظمة سعودية","مراسيم ملكية"],
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
