import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  titleAr: "الخدمات القانونية",
  titleEn: "Legal Services",
  descriptionAr: "خدمات قانونية متكاملة: استشارات، عقود، قضايا، تمثيل قانوني، وأكثر — بمحامين سعوديين معتمدين",
  descriptionEn: "Comprehensive legal services: consultations, contracts, cases, legal representation, and more — with certified Saudi lawyers",
  path: "/services",
  keywords: ["خدمات قانونية", "محامي معتمد", "استشارات قانونية", "عقود", "قضايا"],
});

export default function ServicesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
