import { buildMetadata } from "@/lib/seo";

// Its own head (SEO audit ع3): it used to inherit the root layout's title,
// no canonical and og:url = the home page.
export const metadata = buildMetadata({
  titleAr: "من نحن",
  descriptionAr: "تعرّف على نظامي: شركة تقنية قانونية سعودية تقدّم حلول البرمجيات السحابية وإدارة وتنسيق الخدمات القانونية عبر محامين مرخّصين.",
  path: "/about",
  keywords: ["من نحن", "عن نظامي"],
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
