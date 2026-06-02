import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  titleAr: "انضم كمحامٍ أو مزود خدمة",
  titleEn: "Join as Lawyer or Service Provider",
  descriptionAr: "انضم لشبكة نظامي من المحامين والمتخصصين القانونيين وابدأ في قبول الطلبات",
  descriptionEn: "Join Nzamy's network of lawyers and legal specialists and start accepting requests",
  path: "/join",
  keywords: ["محامي","مزود خدمة","انضم نظامي"],
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
