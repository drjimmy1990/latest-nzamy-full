import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  titleAr: "تصفح المحامين السعوديين المعتمدين",
  titleEn: "Browse Certified Saudi Lawyers",
  descriptionAr: "ابحث عن محامين سعوديين متخصصين في مجالك القانوني وتواصل مباشرة",
  descriptionEn: "Find specialized Saudi lawyers in your legal field and connect directly",
  path: "/lawyers",
  keywords: ["محامين سعوديين","محامي","مستشار قانوني"],
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
