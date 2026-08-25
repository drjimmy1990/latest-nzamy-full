import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  titleAr: "الاستشارة القانونية AI",
  titleEn: "AI Legal Opinion",
  // "فوري"/"instant" removed (Task C4 fix pass) — asserted a turnaround the
  // system doesn't enforce (fulfilment is manual). "بالذكاء الاصطناعي"/"AI"
  // removed too (Task C6) — same class of claim as the sibling
  // /ai/wargaming layout's description, which C4 had left as precedent for
  // keeping this one; that precedent no longer holds since C6 fixed
  // wargaming's too. A human admin now writes this opinion by hand.
  // titleAr/titleEn ("الاستشارة القانونية AI") are left as-is — a stable
  // product name matching the /ai/* URL family, not a capability claim.
  descriptionAr: "احصل على رأي قانوني مبني على الأنظمة السعودية — يعدّه فريق نظامي",
  descriptionEn: "Get a legal opinion built on Saudi regulations, prepared by the Nazamy team",
  path: "/ai/legal-opinion",
  keywords: ["استشارة قانونية","رأي قانوني","AI"],
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
