/**
 * collectionSeriesLookup — the other volumes of a judicial collection, for the
 * reader's volume selector (/api/library/precedents/[slug]) and the
 * in-collection search (/api/library/scoped-search). One helper, so the two
 * routes can never disagree about which volumes make a series.
 *
 * Owner file 11 item 7 (20 Nov): /precedents/LAW-98-1255 («مدونة المبادئ
 * والقرارات العمالية لعام 1431ه - المجلد الثالث») has no series_id, so both
 * routes looked up nothing: no selector, a «الجزء 1» badge, and a search over
 * one volume instead of four. A tagged collection reads its series_id siblings
 * as before; an untagged one now reads the candidates with the same court and
 * base title (collectionFallbackLookup) and lets buildCollectionSeries apply
 * the exact title-fallback rule (owner note ٠٣) the catalogue already uses.
 *
 * Catalogue columns only (all on the anon allow-list), on the caller's request
 * client — never the service role — and bounded. A failed read returns
 * `error` and the caller decides (the reader hides the selector; the search
 * refuses the scope as before).
 */
import type { createClient } from "@/lib/supabase/server";
import {
  buildCollectionSeries,
  collectionFallbackLookup,
  type CollectionSeriesInfo,
  type CollectionVolumeRow,
} from "./precedentVolumes.ts";

export const SERIES_MAX_VOLUMES = 200;

/**
 * The catalogue columns a series needs (court: half of the title-fallback key).
 * The query below spells them as a literal so library-column-lock.test.ts can
 * read them; this constant is what the tests compare against.
 */
export const SERIES_SIBLING_COLUMNS = "id, title, court, part, series_id, free, ruling_count";

/** The REQUEST client (never the service role): the column-lock scanner reads this alias. */
type LibraryClient = Awaited<ReturnType<typeof createClient>>;

export interface CollectionSeriesLookup {
  series: CollectionSeriesInfo | null;
  error: unknown;
}

/** The series `collection` belongs to (tagged or by title), or null for a stand-alone collection. */
export async function readCollectionSeries(
  supabase: LibraryClient,
  collection: Pick<CollectionVolumeRow, "id" | "title" | "court" | "series_id">,
): Promise<CollectionSeriesLookup> {
  const table = () => supabase.schema("library").from("judicial_collections").select("id, title, court, part, series_id, free, ruling_count");
  const seriesId = typeof collection.series_id === "string" ? collection.series_id.trim() : "";
  let siblings: { data: unknown[] | null; error: unknown };
  if (seriesId) {
    siblings = await table()
      .eq("series_id", seriesId)
      .order("part", { ascending: true })
      .order("id", { ascending: true })
      .limit(SERIES_MAX_VOLUMES);
  } else {
    const lookup = collectionFallbackLookup(collection);
    if (!lookup) return { series: null, error: null };
    siblings = await table()
      .eq("court", lookup.court)
      .ilike("title", lookup.titleLike)
      .order("id", { ascending: true })
      .limit(SERIES_MAX_VOLUMES);
  }
  if (siblings.error) return { series: null, error: siblings.error };
  const rows = (siblings.data ?? []) as CollectionVolumeRow[];
  // The current row is always a candidate, even if the LIKE missed it.
  const all = rows.some((r) => r && r.id === collection.id) ? rows : [...rows, collection as CollectionVolumeRow];
  return { series: buildCollectionSeries(all, collection.id), error: null };
}
