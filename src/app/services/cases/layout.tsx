import { buildMetadata } from "@/lib/seo";
import { servicePageSeo } from "@/lib/publicSeo/servicePages";

// Its own title, description and self canonical (owner 18 Nov, item 4.2) —
// not /services's, which every sub-page inherited before. The copy lives in
// src/lib/publicSeo/servicePages.ts.
export const metadata = buildMetadata(servicePageSeo("/services/cases"));

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
