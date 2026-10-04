import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { libraryGate } from "@/lib/library-gate";
import { selectAllPages } from "@/lib/supabase/selectAllPages";
import { buildLawFacets, type LawFacetRow, type LawFacets } from "@/app/laws/lawsIndexFacets";

/**
 * GET /api/library/facets — section × doc-type counts for the /laws index.
 *
 * The chips used to count only the laws already loaded in the browser (50 of
 * 5,901 on first paint), so 28 of 30 sections read «قريباً» (LIB-03). This
 * route counts the whole table once and returns the matrix; the page derives
 * every chip and doc-type count from it with countLaws(), the same predicate
 * /api/library/init filters the list by.
 *
 * TWO PATHS, one answer:
 *   1. library.law_facet_counts() — a GROUP BY in the database (migration
 *      20260925_04_law_facet_counts.sql). ~200 grouped rows.
 *   2. Without it (the migration is applied by the developer, not by this
 *      code), walk section_code/type/has_merged_regulation for every law with
 *      selectAllPages — PostgREST aggregates are disabled on this instance
 *      (PGRST123) and an unranged select would stop silently at 1,000.
 *
 * Counts are the same for every caller (law metadata is browsable by guests;
 * the paywall gates bodies, not titles), so the result is kept in memory for a
 * few minutes and concurrent callers share one in-flight read. Only counts are
 * cached, never rows.
 */

const TTL_MS = 5 * 60 * 1000;
const RPC_ROW_CAP = 1000;
let cached: { at: number; facets: LawFacets; source: string } | null = null;
let inflight: Promise<{ facets: LawFacets; source: string }> | null = null;

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function readFacets(supabase: Supabase): Promise<{ facets: LawFacets; source: string }> {
  const rpc = await supabase.schema("library").rpc("law_facet_counts");
  // PostgREST's max-rows (1000) caps a set-returning RPC as silently as a
  // select. ~200 grouped rows today; at the cap the answer may be truncated,
  // so fall through to the scan rather than undercount.
  if (!rpc.error && Array.isArray(rpc.data) && rpc.data.length < RPC_ROW_CAP) {
    return { facets: buildLawFacets(rpc.data as LawFacetRow[]), source: "rpc" };
  }
  if (rpc.error && rpc.error.code !== "PGRST202" && rpc.error.code !== "42883") {
    console.error("[Library Facets API] rpc law_facet_counts failed, falling back to a scan:", rpc.error);
  }

  const { data, error } = await selectAllPages<LawFacetRow>(
    (from, to) =>
      supabase
        .schema("library")
        .from("laws")
        .select("section_code, type, has_merged_regulation")
        .order("slug")
        .range(from, to) as unknown as PromiseLike<{ data: LawFacetRow[] | null; error: { message: string } | null }>,
    { pageSize: 1000, maxRows: 50_000 },
  );
  if (error) throw new Error(error.message);
  return { facets: buildLawFacets(data), source: "scan" };
}

export async function GET() {
  const gate = await libraryGate();
  if (gate) return gate;

  if (cached && Date.now() - cached.at < TTL_MS) {
    return NextResponse.json(
      { laws: cached.facets, source: cached.source, cached: true },
      { headers: { "Cache-Control": "private, max-age=300" } },
    );
  }

  try {
    const supabase = await createClient();
    inflight ??= readFacets(supabase).finally(() => {
      inflight = null;
    });
    const { facets, source } = await inflight;
    cached = { at: Date.now(), facets, source };
    return NextResponse.json(
      { laws: facets, source, cached: false },
      { headers: { "Cache-Control": "private, max-age=300" } },
    );
  } catch (error) {
    console.error("[Library Facets API] Error:", error);
    return NextResponse.json({ error: "تعذّر حساب أعداد أقسام المكتبة" }, { status: 500 });
  }
}
