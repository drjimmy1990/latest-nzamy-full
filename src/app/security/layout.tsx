import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  titleAr: "الأمان والحماية",
  titleEn: "Security & Protection",
  descriptionAr: "تعرف على معايير الأمان والحماية التي تطبقها منصة نظامي لحفظ بياناتك",
  descriptionEn: "Learn about the security standards Nzamy applies to protect your data",
  path: "/security",
  keywords: ["أمان","تشفير","حماية البيانات"],
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
