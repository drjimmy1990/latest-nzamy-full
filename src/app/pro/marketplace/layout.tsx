import { redirect } from "next/navigation";
import { buildMetadata } from "@/lib/seo";
import { BETA_MONOPOLY_MODE } from "@/lib/betaConfig";

export const metadata = buildMetadata({
  titleAr: "سوق المهنيين",
  titleEn: "Professional Marketplace",
  descriptionAr: "أدوات وخدمات المهنيين على منصة نظامي",
  descriptionEn: "Professional tools and services on the Nzamy platform",
  path: "/pro/marketplace",
  keywords: ["سوق المهنيين", "أدوات المحامي"],
});

export default function Layout({ children }: { children: React.ReactNode }) {
  // `/marketplace` has been redirected away under BETA_MONOPOLY_MODE for a
  // while. THIS route is its twin, and it was missed — which is the shape this
  // whole wave keeps finding: the fix landed where someone looked and the
  // sibling screen kept shipping.
  //
  // What it kept shipping is worse than the one that was closed. This page is
  // linked from the FOOTER OF EVERY PUBLIC PAGE and renders a storefront of six
  // products with named monthly prices (٢٩٩ / ١٩٩ / ١٤٩ / ٩٩ / ٢٤٩ ر.س and
  // ٣٩٩ ر.س للمراجعة), star ratings up to 5.0, review counts up to 421, a
  // «الأكثر مبيعاً» best-seller badge, and hero stats «٥٠+ أداة وخدمة» /
  // «١٠٠٪ موثّقة ومعتمدة» — every one of them a literal in the file.
  //
  // There is no vendor, no order, no review and no payment provider behind any
  // of it. One of the six («مراجعة قانونية متخصصة … رد خلال ٢٤ ساعة» from
  // «شبكة محامي نظامي») is a turnaround commitment on a platform with zero
  // published lawyers. A price is a stronger promise than a slogan, so this is
  // the same defect class as the compliance guarantee — with money attached.
  //
  // Redirected to /services, exactly as /marketplace is, from the same flag.
  if (BETA_MONOPOLY_MODE) redirect("/services");
  return <>{children}</>;
}
