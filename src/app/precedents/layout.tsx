import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  titleAr: "السوابق القضائية",
  titleEn: "Judicial Precedents",
  descriptionAr: "استعرض السوابق القضائية السعودية المفصّلة للاستناد إليها في قضاياك",
  descriptionEn: "Browse detailed Saudi judicial precedents for reference in your cases",
  path: "/precedents",
  keywords: ["سوابق قضائية","أحكام","مبادئ قضائية"],
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
