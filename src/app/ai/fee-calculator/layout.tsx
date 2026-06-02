import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  titleAr: "حاسبة أتعاب المحامي",
  titleEn: "Lawyer Fee Calculator",
  descriptionAr: "احسب أتعاب المحامي المتوقعة في السعودية بناءً على نوع القضية وتعقيدها",
  descriptionEn: "Calculate expected lawyer fees in Saudi Arabia based on case type and complexity",
  path: "/ai/fee-calculator",
  keywords: ["أتعاب محامي","تكلفة قضية","حاسبة"],
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
