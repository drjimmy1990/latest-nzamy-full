import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  titleAr: "سوق الخدمات القانونية",
  titleEn: "Legal Services Marketplace",
  descriptionAr: "اطلب خدمات قانونية متخصصة أو قدّم خدماتك القانونية عبر منصة نظامي",
  descriptionEn: "Request specialized legal services or offer your legal expertise on Nzamy platform",
  path: "/marketplace",
  keywords: ["سوق قانوني","خدمات قانونية","محامي فريلانس"],
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
