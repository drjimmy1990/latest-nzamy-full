import { buildLibraryJsonLd, serializeJsonLd, type LibraryDocSeo } from "@/lib/library/libraryMetadata";

/**
 * A library document's JSON-LD (owner note ١٤): Legislation / Collection /
 * Book plus its BreadcrumbList, from buildLibraryJsonLd only — no FAQPage, no
 * sameAs, no official link, no decree date. serializeJsonLd escapes `<`, so a
 * title can never close the script.
 */
export default function LibraryJsonLd({ doc }: { doc: LibraryDocSeo }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildLibraryJsonLd(doc)) }}
    />
  );
}
