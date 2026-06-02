import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  titleAr: "الأسئلة الشائعة",
  titleEn: "FAQ",
  descriptionAr: "إجابات على أكثر الأسئلة شيوعاً عن منصة نظامي وخدماتها القانونية",
  descriptionEn: "Answers to the most common questions about Nzamy platform and its legal services",
  path: "/faq",
  keywords: ["أسئلة شائعة","مساعدة","كيفية"],
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
