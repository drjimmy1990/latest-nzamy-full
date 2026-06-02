import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  titleAr: "الاستشارة القانونية AI",
  titleEn: "AI Legal Opinion",
  descriptionAr: "احصل على رأي قانوني فوري بالذكاء الاصطناعي مبني على الأنظمة السعودية",
  descriptionEn: "Get an instant legal opinion powered by AI built on Saudi regulations",
  path: "/ai/legal-opinion",
  keywords: ["استشارة قانونية","رأي قانوني","AI"],
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
