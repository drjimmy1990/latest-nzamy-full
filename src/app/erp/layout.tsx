import { buildMetadata } from "@/lib/seo";

// Its own head (SEO audit ع3): it used to inherit the root layout's title,
// no canonical and og:url = the home page.
export const metadata = buildMetadata({
  titleAr: "نظامي ERP لمكاتب المحاماة والإدارات القانونية",
  descriptionAr: "نظامي ERP للمؤسسات وشركات المحاماة الكبرى والإدارات القانونية: وحدات إدارة القضايا والفريق والمالية والمستندات، مع طلب عرض تجريبي.",
  path: "/erp",
  keywords: ["نظامي ERP", "برنامج إدارة مكتب محاماة", "إدارة قانونية"],
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
