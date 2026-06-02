import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  titleAr: "محاكاة القضايا القانونية",
  titleEn: "Legal Case Simulation",
  descriptionAr: "حاكِ سير قضيتك القانونية وتوقّع النتائج المحتملة بالذكاء الاصطناعي",
  descriptionEn: "Simulate your legal case trajectory and predict possible outcomes with AI",
  path: "/ai/wargaming",
  keywords: ["محاكاة قضائية","توقع نتيجة","استراتيجية قانونية"],
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
