import type { LibraryDocSeo } from "@/lib/library/libraryMetadata";
import type { LibraryDocShell } from "@/lib/library/libraryDocumentSeo";

/**
 * «عن هذا الكتاب» — the server-rendered block under a fiqh book's reader
 * (owner note ١٤ §٣: a limited public SSR shell). The reader itself is a
 * client page behind LibraryGuard, so without this block the HTML a crawler
 * receives holds no word of the book.
 *
 * Shown to EVERY visitor as it is (Google forbids content only crawlers see):
 * a closed <details> the reader can open, under the reader. It carries only
 * public catalogue text — the cleaned name and موجز (libraryMetadata.ts) and
 * the chapter titles — never a block's text (server-only, 20261018_02).
 * The layout renders it only while the library is open.
 */
export default function LibraryDocumentShell({ doc, shell }: { doc: LibraryDocSeo; shell: LibraryDocShell }) {
  return (
    <section dir="rtl" aria-label="عن هذا الكتاب" className="mx-auto w-full max-w-5xl px-4 pb-10">
      <details className="rounded-xl border border-zinc-300/60 dark:border-white/10 px-4 py-3">
        <summary className="cursor-pointer select-none text-sm font-bold text-zinc-700 dark:text-zinc-300">
          عن هذا الكتاب
        </summary>
        <div className="mt-3 space-y-3 text-sm leading-7 text-zinc-700 dark:text-zinc-300">
          <h2 className="text-base font-black text-zinc-900 dark:text-white">{doc.name}</h2>
          {shell.author && <p>المؤلف: {shell.author}</p>}
          {doc.description && <p>{doc.description}</p>}
          {shell.toc.length > 0 && (
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
