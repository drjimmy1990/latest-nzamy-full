import type { LibraryDocSeo } from "@/lib/library/libraryMetadata";
import type { LibraryDocShell } from "@/lib/library/libraryDocumentSeo";

/**
 * «عن هذا الكتاب» / «عن هذا النظام» — the server-rendered block under a fiqh
 * book's or a law's reader (owner note ١٤ §٣: a limited public SSR shell;
 * owner TODO P1-10 for laws). The reader itself is a client page behind
 * LibraryGuard, so without this block the HTML a crawler receives holds no
 * word of the document.
 *
 * Shown to EVERY visitor as it is (Google forbids content only crawlers see):
 * a closed <details> the reader can open, under the reader. It carries only
 * public catalogue text — the cleaned name and موجز (libraryMetadata.ts) and
 * the chapter titles — never a block's text (server-only, 20261018_02).
 * A law's block has the cleaned name and موجز, and (owner 18 Nov, item 4.1)
 * the public excerpt: its first article only when a guest's reader shows it
 * too, cut short (lawPublicExcerpt.ts) — never its ديباجة (a subscriber's,
 * T28-22), never a locked article. A decree's and a collection's block: the
 * name and the public description only (no ruling text: that excerpt is the
 * collection reader's own rule).
 * The layout renders it only while the library is open.
 *
 * The document's name is the page's <h1> here for a law, a decree and a
 * collection — the client reader shows its title as an <h2>, so the page has
 * one H1 in the server HTML and after hydration. A book keeps <h2>: its
 * reader's title stays the <h1>.
 */
const HEADING: Record<LibraryDocSeo["kind"], string> = {
  book: "عن هذا الكتاب",
  law: "عن هذا النظام",
  order: "عن هذا القرار",
  collection: "عن هذه المجموعة",
};

export default function LibraryDocumentShell({ doc, shell }: { doc: LibraryDocSeo; shell?: LibraryDocShell }) {
  const heading = HEADING[doc.kind] ?? "عن هذا المستند";
  const TitleTag = doc.kind === "book" ? "h2" : "h1";
  return (
    <section dir="rtl" aria-label={heading} className="mx-auto w-full max-w-5xl px-4 pb-10">
      {/* The name stays outside the closed <details>: visible, and in the accessibility tree. */}
      <TitleTag className="mb-2 text-base font-black text-zinc-900 dark:text-white">{doc.name}</TitleTag>
      <details className="rounded-xl border border-zinc-300/60 dark:border-white/10 px-4 py-3">
        <summary className="cursor-pointer select-none text-sm font-bold text-zinc-700 dark:text-zinc-300">
          {heading}
        </summary>
        <div className="mt-3 space-y-3 text-sm leading-7 text-zinc-700 dark:text-zinc-300">
          {shell?.author && <p>المؤلف: {shell.author}</p>}
          {doc.description && <p>{doc.description}</p>}
          {shell?.excerpt && (
            <>
              <h2 className="font-bold text-zinc-900 dark:text-white">من نص النظام</h2>
              <blockquote className="whitespace-pre-line border-r-2 border-[#C8A762] pr-3">{shell.excerpt}</blockquote>
              <p className="text-zinc-600 dark:text-zinc-400">تابع قراءة النظام في القارئ أعلاه.</p>
            </>
          )}
          {shell && shell.toc.length > 0 && (
            <>
              <h3 className="font-bold text-zinc-900 dark:text-white">فهرس الكتاب</h3>
              <ol className="list-decimal space-y-1 pr-5">
                {shell.toc.map((title, i) => (
                  <li key={i}>{title}</li>
                ))}
              </ol>
              {shell.tocTruncated && <p className="text-zinc-600 dark:text-zinc-400">والمزيد في الفهرس داخل القارئ.</p>}
            </>
          )}
        </div>
      </details>
    </section>
  );
}
