import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  titleAr: "صياغة العقود بالذكاء الاصطناعي",
  titleEn: "AI Contract Drafter",
  descriptionAr: "اصغ عقودك القانونية بالذكاء الاصطناعي المدرّب على الأنظمة السعودية — عمل، إيجار، شراكة، وأكثر",
  descriptionEn: "Draft your legal contracts with AI trained on Saudi regulations — employment, lease, partnership, and more",
  path: "/ai/contract-drafter",
  keywords: ["صياغة عقد","عقد عمل","عقد إيجار","ذكاء اصطناعي"],
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
