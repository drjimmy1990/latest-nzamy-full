import { buildMetadata } from "@/lib/seo";
import LibraryGuard from "@/components/library/LibraryGuard";

export const metadata = buildMetadata({
  titleAr: "السوابق القضائية",
  titleEn: "Judicial Precedents",
  descriptionAr: "استعرض السوابق القضائية السعودية المفصّلة للاستناد إليها في قضاياك",
  descriptionEn: "Browse detailed Saudi judicial precedents for reference in your cases",
  path: "/precedents",
  keywords: ["سوابق قضائية","أحكام","مبادئ قضائية"],
});

export default function Layout({ children }: { children: React.ReactNode }) {
  // A collection's reader (/precedents/[slug]) carries its own guard, so its
  // public block and JSON-LD reach the first HTML: see that layout.
  return <LibraryGuard collectionReaderGuardsItself>{children}</LibraryGuard>;
}
