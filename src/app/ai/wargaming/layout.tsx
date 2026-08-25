import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  titleAr: "محاكاة القضايا القانونية",
  titleEn: "Legal Case Simulation",
  descriptionAr: "حاكِ سير قضيتك القانونية — يراجع فريق نظامي بيانات قضيتك يدوياً ويُعدّ لك تحليلاً مكتوباً",
  descriptionEn: "Simulate your legal case trajectory — reviewed and prepared manually by the Nazamy team",
  path: "/ai/wargaming",
  keywords: ["محاكاة قضائية","توقع نتيجة","استراتيجية قانونية"],
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
