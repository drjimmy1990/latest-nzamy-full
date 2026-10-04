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
  // No redirect here any more. During the single-firm beta
  // (BETA_MONOPOLY_MODE) the multi-vendor DIRECTORY stays closed — /lawyers
  // (page.tsx) and /lawyers/browse (browse/layout.tsx) each redirect to the
  // firm's intake, /services/lawyers. What opened is one lawyer's OWN public
  // profile, /lawyers/[slug]: the owner (Q151, 2026-10-03) keeps the
  // directory closed for privacy but wants each lawyer to share his profile
  // by link and QR. That page renders only a PUBLISHED profile —
  // verification_status = 'verified' AND marketplace_visible = true, the same
  // gate as GET /api/v1/lawyers/[id] — and 404s for anything else
  // ([slug]/layout.tsx).
  //
  // This used to be one redirect for the whole subtree, which is why a shared
  // profile link could not open.
  return <>{children}</>;
}
