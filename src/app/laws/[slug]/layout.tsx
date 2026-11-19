import type { Metadata } from "next";
import { notFound } from "next/navigation";
import LibraryGuard from "@/components/library/LibraryGuard";
import LibraryDocumentShell from "@/components/library/LibraryDocumentShell";
import LibraryJsonLd from "@/components/library/LibraryJsonLd";
import { isMissingLibraryDoc, libraryDocMetadata, loadLibraryDocSeo } from "@/lib/library/libraryDocumentSeo";

/**
 * /laws/[slug]: a law, as schema.org Legislation — the document's own <head> and JSON-LD (owner note ١٤, phase 1).
 *
 * The reader (page.tsx) is a client page: without this server layout every
 * document inherited the section's generic title. generateMetadata and the
 * JSON-LD read the document once (loadLibraryDocSeo, React cache) with the
 * service role and print it as a GUEST sees it — no decree number or date, no
 * official link, whoever asked (owner answers ٣١٨ / ٣١٩).
 *
 * Owner TODO P1-10: the JSON-LD and the «عن هذا النظام» block (the cleaned
 * name and موجز, nothing else) are rendered OUTSIDE LibraryGuard, so they are
 * in the first HTML: the guard SSRs only a spinner. That is why this layout
 * guards the reader itself and the section guard (src/app/laws/layout.tsx,
 * `lawReaderGuardsItself`) lets this path through. Nothing is printed while
 * the library is closed (the load answers "closed"); the ديباجة (a
 * subscriber's, T28-22) is never printed, and of the articles only the first
 * one, when a guest's reader shows it too, cut short (owner 18 Nov, item 4.1:
 * src/lib/library/lawPublicExcerpt.ts). The block's name is the page's H1.
 */
type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  return libraryDocMetadata("law", slug);
}

export default async function Layout({ children, params }: Params & { children: React.ReactNode }) {
  const { slug } = await params;
  const load = await loadLibraryDocSeo("law", slug);
  // Batch l9 (file 20 §2): a document that does not exist is a 404, not a reader saying so.
  if (isMissingLibraryDoc("law", slug, load)) notFound();
  return (
    <>
      {load.status === "ok" && <LibraryJsonLd doc={load.doc} />}
      <LibraryGuard>{children}</LibraryGuard>
      {load.status === "ok" && <LibraryDocumentShell doc={load.doc} shell={load.shell} />}
    </>
  );
}