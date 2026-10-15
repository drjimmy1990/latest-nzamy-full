import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  titleAr: "شركاء نظامي",
  titleEn: "Nezamy Partners",
  descriptionAr: "تعرف على شركاء منصة نظامي من مكاتب المحاماة والجهات القانونية المعتمدة",
  descriptionEn: "Meet Nezamy's partners including law firms and accredited legal entities",
  path: "/partners",
  keywords: ["شركاء","مكاتب محاماة","جهات قانونية"],
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
