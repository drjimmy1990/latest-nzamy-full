import { getSearchEntries } from "@/lib/murshid/murshidStore";
import { searchMurshid, SEARCH_QUERY_MAX } from "@/lib/murshid/murshidData";
import { murshidError, murshidJson } from "../_cache";

/**
 * GET /api/v1/murshid/search?q= — cards across all sectors whose agency,
 * problem type or sector title match `q` (the page's search grammar:
 * space/+ AND, / OR, "…" phrase, -word excluded). At most 50 matches, each a
 * pointer {cardId, sectorNo, …}; the page then opens that sector.
 */
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, SEARCH_QUERY_MAX);
  if (!q) return murshidJson({ total: 0, matches: [], suggestions: [], unmatchedTerms: [] });
  try {
    return murshidJson(searchMurshid(getSearchEntries(), q));
  } catch (err) {
    console.error("[murshid] search failed", err);
    return murshidError("تعذّر البحث", 500);
  }
}
