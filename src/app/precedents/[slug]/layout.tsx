import type { Metadata } from "next";
import LibraryJsonLd from "@/components/library/LibraryJsonLd";
import { libraryDocMetadata, loadLibraryDocSeo } from "@/lib/library/libraryDocumentSeo";

/**
 * /precedents/[slug]: a judicial collection, as schema.org Collection — the document's own <head> and JSON-LD (owner note ١٤, phase 1).
 *
 * The reader (page.tsx) is a client page: without this server layout every
 * document inherited the section's generic title. generateMetadata and the
 * JSON-LD read the document once (loadLibraryDocSeo, React cache) with the
 * service role and print it as a GUEST sees it — no decree number or date, no
 * official link, whoever asked (owner answers ٣١٨ / ٣١٩).
 *
 * The JSON-LD sits inside the section's LibraryGuard (src/app/precedents/layout.tsx), so it
 * reaches the DOM once the guard resolves, not the first HTML; see the S6
 * ledger (NOTE-14-C03) for the follow-up that lets the guard render on the
 * server.
 */
type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  return libraryDocMetadata("collection", slug);
}

export default async function Layout({ children, params }: Params & { children: React.ReactNode }) {
  const { slug } = await params;
  const load = await loadLibraryDocSeo("collection", slug);
  return (
    <>
      {load.status === "ok" && <LibraryJsonLd doc={load.doc} />}
      {children}
    </>
  );
}