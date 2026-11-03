import type { MetadataRoute } from "next";
import { createServiceClient } from "@/lib/supabase/server";
import { getLibraryStatus } from "@/lib/access-control";
import { selectAllPages } from "@/lib/supabase/selectAllPages";
import {
  LIBRARY_SITEMAP_IDS,
  SITEMAP_KIND,
  lawDateModified,
  librarySitemapEntry,
  type LibrarySitemapEntry,
  type LibrarySitemapId,
} from "@/lib/library/libraryMetadata";

/**
 * The library's segmented sitemaps (owner note ١٤ §٢ item ١٠ / §٣): one per
 * document type, at /library-sitemaps/sitemap/<id>.xml, each listed in
 * robots.txt. Documents only — laws, decrees / circulars, judicial
 * collections, fiqh books — never the 13k articles (they live inside their
 * law's page) and never /precedents/judgment (a noindex «قريباً» screen).
 * The root /sitemap.xml keeps the static routes and the blog.
 *
 * Every list is walked with selectAllPages, ordered by the table's primary
 * key (laws.slug, the other three .id), as the service role. A law's
 * lastModified is its «آخر تحديث تشريعي» — the one public date (٣١٧ / ٣١٨);
 * the other types carry none rather than the date of the last reseed.
 *
 * Fails empty: a failed read or a closed library yields an empty sitemap,
 * never a half list or a 500.
 */

export const revalidate = 21600;

export async function generateSitemaps() {
  return LIBRARY_SITEMAP_IDS.map((id) => ({ id }));
}

type Row = Record<string, unknown>;
type Paged = Promise<{ data: Row[] | null; error: { message: string } | null }>;

async function readEntries(id: LibrarySitemapId): Promise<LibrarySitemapEntry[]> {
  const supabase = await createServiceClient();
  const kind = SITEMAP_KIND[id];
  const walk = (page: (from: number, to: number) => Paged) => selectAllPages<Row>(page);
  const { data, error } =
    id === "laws"
      ? await walk((from, to) =>
          supabase
            .schema("library")
            .from("laws")
            .select("slug, latest_update, issue_date_hijri")
            .order("slug", { ascending: true })
            .range(from, to) as unknown as Paged)
      : id === "orders"
        ? await walk((from, to) =>
            supabase
              .schema("library")
              .from("decrees_circulars")
              .select("id")
              .order("id", { ascending: true })
              .range(from, to) as unknown as Paged)
        : id === "collections"
          ? await walk((from, to) =>
              supabase
                .schema("library")
                .from("judicial_collections")
                .select("id")
                .order("id", { ascending: true })
                .range(from, to) as unknown as Paged)
          : await walk((from, to) =>
              supabase
                .schema("library")
                .from("feqh_books")
                .select("id")
                .order("id", { ascending: true })
                .range(from, to) as unknown as Paged);
  if (error) {
    console.error(`[library-sitemap] ${id} read failed:`, error.message);
    return [];
  }
  const out: LibrarySitemapEntry[] = [];
  for (const row of data) {
    const key = id === "laws" ? row.slug : row.id;
    const entry = librarySitemapEntry(kind, typeof key === "string" ? key : "", id === "laws" ? lawDateModified(row) : null);
    if (entry) out.push(entry);
  }
  return out;
}

export default async function sitemap(props: { id: Promise<string> }): Promise<MetadataRoute.Sitemap> {
  try {
    const id = await props.id;
    if (!(LIBRARY_SITEMAP_IDS as readonly string[]).includes(id)) return [];
    if ((await getLibraryStatus()).closed) return [];
    return await readEntries(id as LibrarySitemapId);
  } catch (err) {
    console.error("[library-sitemap] failed:", err);
    return [];
  }
}
