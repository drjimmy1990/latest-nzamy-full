import { redirect } from "next/navigation";
import { buildMetadata } from "@/lib/seo";
import { BETA_MONOPOLY_MODE } from "@/lib/betaConfig";

export const metadata = buildMetadata({
  titleAr: "سوق الخدمات القانونية",
  titleEn: "Legal Services Marketplace",
  descriptionAr: "اطلب خدمات قانونية متخصصة أو قدّم خدماتك القانونية عبر منصة نظامي",
  descriptionEn: "Request specialized legal services or offer your legal expertise on Nzamy platform",
  path: "/marketplace",
  keywords: ["سوق قانوني","خدمات قانونية","محامي فريلانس"],
});

export default function Layout({ children }: { children: React.ReactNode }) {
  // During the single-firm beta (BETA_MONOPOLY_MODE) the multi-vendor marketplace
  // (request board, /post, /collaborate, external-vendor orders) is not offered —
  // it renders mock vendors/requests (e.g. hardcoded "248 requests"), which
  // contradicts monopoly mode. Redirect the whole subtree to the services hub.
  if (BETA_MONOPOLY_MODE) redirect("/services");
  return <>{children}</>;
}
