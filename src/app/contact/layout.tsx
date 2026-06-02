import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  titleAr: "تواصل معنا",
  titleEn: "Contact Us",
  descriptionAr: "تواصل مع فريق نظامي للدعم والاستفسارات والشراكات",
  descriptionEn: "Contact the Nzamy team for support, inquiries, and partnerships",
  path: "/contact",
  keywords: ["تواصل","دعم فني","استفسار"],
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
