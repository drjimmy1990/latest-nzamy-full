import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  titleAr: "الشروط والأحكام",
  titleEn: "Terms & Conditions",
  descriptionAr: "اطلع على شروط وأحكام الاستخدام لمنصة نظامي القانونية",
  descriptionEn: "Review the terms and conditions for using the Nzamy legal platform",
  path: "/terms",
  keywords: ["شروط الاستخدام","أحكام","اتفاقية"],
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
