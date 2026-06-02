import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  titleAr: "الأسعار والباقات",
  titleEn: "Pricing & Plans",
  descriptionAr: "اختر الباقة المناسبة لاحتياجاتك القانونية — باقات للأفراد والشركات والمحامين",
  descriptionEn: "Choose the right plan for your legal needs — plans for individuals, businesses, and lawyers",
  path: "/pricing",
  keywords: ["أسعار نظامي","باقات قانونية","اشتراك"],
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
