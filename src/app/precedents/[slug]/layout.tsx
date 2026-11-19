import type { Metadata } from "next";
import LibraryGuard from "@/components/library/LibraryGuard";
import LibraryDocumentShell from "@/components/library/LibraryDocumentShell";
import LibraryJsonLd from "@/components/library/LibraryJsonLd";
import { libraryDocMetadata, loadLibraryDocSeo } from "@/lib/library/libraryDocumentSeo";
import PublicRulings from "./_public-rulings";

/**
 * /precedents/[slug]: a judicial collection, as schema.org Collection — the document's own <head> and JSON-LD (owner note ١٤, phase 1).
 *
 * The reader (page.tsx) is a client page: without this server layout every
 * document inherited the section's generic title. generateMetadata and the
 * JSON-LD read the document once (loadLibraryDocSeo, React cache) with the
 * service role and print it as a GUEST sees it — no decree number or date, no
 * official link, whoever asked (owner answers ٣١٨ / ٣١٩).
 *
 * Owner 18 Nov, item 4.1 (the P1-10 pattern of /laws/[slug]): this layout
 * guards the reader itself, and the JSON-LD and the public block (the name as
 * the page's H1 and the public description — nothing else) sit OUTSIDE that
 * guard, so they are in the first HTML: the guard SSRs only a spinner. The
 * section guard (src/app/precedents/layout.tsx) lets this path through. Nothing is
 * printed while the library is closed (the load answers "closed").
 *
 * Register 14 item 13 + pending #44 (batch l9): the free rulings a guest reads
 * in full (2 per collection by the owner's setting) are in that first HTML too
 * (_public-rulings.tsx) — exactly what a guest's API answer opens, no more.
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
      <LibraryGuard>{children}</LibraryGuard>
      {load.status === "ok" && <LibraryDocumentShell doc={load.doc} />}
      {load.status === "ok" && <PublicRulings collectionId={load.doc.id} />}
    </>
  );
}