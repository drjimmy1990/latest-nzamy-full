import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  titleAr: "سياسة الاسترجاع والاستبدال",
  titleEn: "Refund & Exchange Policy",
  descriptionAr: "اطلع على سياسة الاسترجاع والاستبدال الخاصة بمنصة نظامي القانونية",
  descriptionEn: "Review the refund and exchange policy for the Nzamy legal platform",
  path: "/refund-policy",
  keywords: ["سياسة الاسترجاع", "استرداد", "استبدال"],
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
