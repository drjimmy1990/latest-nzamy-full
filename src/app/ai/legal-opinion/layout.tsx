import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  titleAr: "الاستشارة القانونية AI",
  titleEn: "AI Legal Opinion",
  // "فوري"/"instant" removed (Task C4 fix pass) — asserted a turnaround
  // the system doesn't enforce (fulfilment is manual); "بالذكاء
  // الاصطناعي"/"AI" kept, matching the sibling /ai/wargaming layout's
  // untouched precedent for that framing.
  descriptionAr: "احصل على رأي قانوني بالذكاء الاصطناعي مبني على الأنظمة السعودية",
  descriptionEn: "Get a legal opinion powered by AI, built on Saudi regulations",
  path: "/ai/legal-opinion",
  keywords: ["استشارة قانونية","رأي قانوني","AI"],
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
