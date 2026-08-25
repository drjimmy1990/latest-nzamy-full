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
  // During the single-firm beta (BETA_MONOPOLY_MODE) NZAMY operates as one
  // firm, so a multi-vendor lawyer directory is not part of the offer. The
  // whole subtree — /lawyers, /lawyers/browse and /lawyers/[slug] — redirects
  // to the real single-firm intake.
  //
  // This comment used to justify the redirect with "those pages render
  // demo/mock 'licensed' lawyers". That was true and is being fixed:
  // /lawyers/[slug] now renders the real lawyer behind the same
  // verified + marketplace_visible gate as the public API, and /lawyers/browse
  // is being de-mocked separately. The fabrication is no longer the reason —
  // the beta business model is. Whether the directory should now OPEN is an
  // owner decision, not a code cleanup, so the redirect stays as it is.
  if (BETA_MONOPOLY_MODE) redirect("/services/lawyers");
  return <>{children}</>;
}
