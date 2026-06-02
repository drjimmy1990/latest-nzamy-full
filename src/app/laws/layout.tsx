import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  titleAr: "مكتبة الأنظمة والتشريعات السعودية",
  titleEn: "Saudi Laws & Regulations Library",
  descriptionAr: "استعرض الأنظمة واللوائح السعودية كاملة — نظام العمل، المرافعات، الأحوال الشخصية، والمزيد",
  descriptionEn: "Browse complete Saudi laws and regulations — Labor Law, Civil Procedure, Personal Status, and more",
  path: "/laws",
  keywords: ["مكتبة الأنظمة","قانون سعودي","نظام العمل","الأنظمة السعودية"],
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
