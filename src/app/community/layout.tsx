import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  titleAr: "مجتمع نظامي القانوني",
  titleEn: "Nzamy Legal Community",
  descriptionAr: "اطرح أسئلتك القانونية واحصل على إجابات من محامين ومتخصصين سعوديين",
  descriptionEn: "Ask your legal questions and get answers from Saudi lawyers and specialists",
  path: "/community",
  keywords: ["أسئلة قانونية","مجتمع محامين","استشارة مجانية"],
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
