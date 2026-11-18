import { PRIVATE_ROBOTS } from "@/lib/publicSeo/privatePages";

// Owner 18 Nov, item 4.3: a private page — <meta name="robots" content="noindex, follow">
// (next.config.ts also sends it as X-Robots-Tag; src/lib/publicSeo/privatePages.ts).
export const metadata = { robots: PRIVATE_ROBOTS };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
