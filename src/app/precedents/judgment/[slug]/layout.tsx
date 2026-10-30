import type { Metadata } from "next";

/**
 * /precedents/judgment/[slug] is a «قريباً» screen (no judgment backend yet),
 * so it is noindex until it is built (owner note ١٤ §٢ item ٦). This overrides
 * the section's `index: true` from src/app/precedents/layout.tsx; robots.txt
 * does NOT disallow the path, or a crawler would never read this tag. It is
 * also left out of the library sitemaps (src/lib/library/libraryMetadata.ts).
 */
export const metadata: Metadata = {
  title: "صك حكم قضائي — قريباً | نظامي",
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
