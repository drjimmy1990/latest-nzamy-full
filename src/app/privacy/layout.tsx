import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  titleAr: "سياسة الخصوصية",
  titleEn: "Privacy Policy",
  descriptionAr: "اقرأ سياسة الخصوصية الخاصة بمنصة نظامي وكيفية حماية بياناتك الشخصية",
  descriptionEn: "Read Nzamy's privacy policy and how we protect your personal data",
  path: "/privacy",
  keywords: ["خصوصية","بيانات","أمان"],
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
