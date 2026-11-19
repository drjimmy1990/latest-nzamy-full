import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  titleAr: "الأسئلة الشائعة",
  titleEn: "FAQ",
  descriptionAr: "إجابات على أكثر الأسئلة شيوعاً عن منصة نظامي وخدماتها القانونية",
  descriptionEn: "Answers to the most common questions about Nezamy platform and its legal services",
  path: "/faq",
  keywords: ["أسئلة شائعة","مساعدة","كيفية"],
});

// The FAQPage JSON-LD (owner 18 Nov, item 4.4) is printed by ./page.tsx, a
// server page, from the very items it shows — the licence line included
// (batch l9, owner file 20 row 4).

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
