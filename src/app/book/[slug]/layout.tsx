import type { Metadata } from "next";
import LibraryGuard from "@/components/library/LibraryGuard";
import LibraryDocumentShell from "@/components/library/LibraryDocumentShell";
import LibraryJsonLd from "@/components/library/LibraryJsonLd";
import { libraryDocMetadata, loadLibraryDocSeo } from "@/lib/library/libraryDocumentSeo";

/**
 * Guards the feqh book reader (/book/[slug]) with the global library switch.
 *
 * Scoped to the [slug] segment on purpose: /book/consultation is a lawyer
 * booking flow, not library content, and Next.js resolves that static segment
 * ahead of this dynamic one — so it is unaffected by this layout.
 *
 * Owner note ١٤ (phase 1): the book's own <head> (generateMetadata), its
 * schema.org Book JSON-LD and the «عن هذا الكتاب» block. Those two are
 * rendered OUTSIDE LibraryGuard on purpose: the guard shows only a spinner on
 * the server, so anything inside it never reaches the first HTML. They carry
 * only public catalogue text as a guest sees it (loadLibraryDocSeo), and
 * nothing at all while the library is closed (the load answers "closed").
 */
type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  return libraryDocMetadata("book", slug);
}

export default async function Layout({ children, params }: Params & { children: React.ReactNode }) {
  const { slug } = await params;
  const load = await loadLibraryDocSeo("book", slug);
  return (
    <>
      {load.status === "ok" && <LibraryJsonLd doc={load.doc} />}
      <LibraryGuard>{children}</LibraryGuard>
      {load.status === "ok" && load.shell && <LibraryDocumentShell doc={load.doc} shell={load.shell} />}
    </>
  );
}
