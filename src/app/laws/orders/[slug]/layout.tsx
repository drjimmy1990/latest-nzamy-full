import type { Metadata } from "next";
import { notFound } from "next/navigation";
import LibraryGuard from "@/components/library/LibraryGuard";
import LibraryDocumentShell from "@/components/library/LibraryDocumentShell";
import LibraryJsonLd from "@/components/library/LibraryJsonLd";
import { isMissingLibraryDoc, libraryDocMetadata, loadLibraryDocSeo } from "@/lib/library/libraryDocumentSeo";

/**
 * /laws/orders/[slug]: a royal decree, cabinet decision or circular, as schema.org Legislation (never GovernmentService / HowTo) — the document's own <head> and JSON-LD (owner note ١٤, phase 1).
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
 * section guard (src/app/laws/layout.tsx) lets this path through. Nothing is
 * printed while the library is closed (the load answers "closed").
 */
type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  return libraryDocMetadata("order", slug);
}

export default async function Layout({ children, params }: Params & { children: React.ReactNode }) {
  const { slug } = await params;
  const load = await loadLibraryDocSeo("order", slug);
  // Batch l9 (file 20 §2): a document that does not exist is a 404, not a reader saying so.
  if (isMissingLibraryDoc("order", slug, load)) notFound();
  return (
    <>
      {load.status === "ok" && <LibraryJsonLd doc={load.doc} />}
      <LibraryGuard>{children}</LibraryGuard>
      {load.status === "ok" && <LibraryDocumentShell doc={load.doc} />}
    </>
  );
}