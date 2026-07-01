import { redirect } from "next/navigation";
import { buildMetadata } from "@/lib/seo";
import { BETA_MONOPOLY_MODE } from "@/lib/betaConfig";

export const metadata = buildMetadata({
  titleAr: "تصفح المحامين السعوديين المعتمدين",
  titleEn: "Browse Certified Saudi Lawyers",
  descriptionAr: "ابحث عن محامين سعوديين متخصصين في مجالك القانوني وتواصل مباشرة",
  descriptionEn: "Find specialized Saudi lawyers in your legal field and connect directly",
  path: "/lawyers",
  keywords: ["محامين سعوديين","محامي","مستشار قانوني"],
});

export default function Layout({ children }: { children: React.ReactNode }) {
  // During the single-firm beta (BETA_MONOPOLY_MODE) the multi-vendor lawyer
  // directory is not offered — /lawyers, /lawyers/browse and /lawyers/[slug]
  // render demo/mock "licensed" lawyers, which contradicts monopoly mode.
  // Redirect the whole subtree to the real single-firm intake.
  if (BETA_MONOPOLY_MODE) redirect("/services/lawyers");
  return <>{children}</>;
}
