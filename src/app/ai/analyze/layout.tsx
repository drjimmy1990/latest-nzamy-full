import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  titleAr: "محلل القضايا والوثائق بالذكاء الاصطناعي",
  titleEn: "AI Case & Document Analyzer",
  descriptionAr: "حلّل وضعك القانوني أو وثيقتك مجاناً بالذكاء الاصطناعي المدرّب على الأنظمة السعودية",
  descriptionEn: "Analyze your legal situation or document for free with AI trained on Saudi regulations",
  path: "/ai/analyze",
  keywords: ["تحليل قضية","فحص وثيقة","ذكاء اصطناعي قانوني"],
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
