import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  titleAr: "محلل القضايا والوثائق بالذكاء الاصطناعي",
  titleEn: "AI Case & Document Analyzer",
  descriptionAr: "حلّل وضعك القانوني أو وثيقتك بالذكاء الاصطناعي الذي يعتمد الأنظمة السعودية مصدراً",
  descriptionEn: "Analyze your legal situation or document with AI that takes Saudi law as its source",
  path: "/ai/analyze",
  keywords: ["تحليل قضية","فحص وثيقة","ذكاء اصطناعي قانوني"],
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
