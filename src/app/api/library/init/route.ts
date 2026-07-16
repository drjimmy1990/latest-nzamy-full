import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();

  // Bounded reads: the front-end mounts this once on load, so cap each table
  // to a sane page size instead of `select('*')` (unbounded table scan).
  // Optional ?limit (1-200, default 50) and ?page (1-based) query params.
  // Optional ?section param to load only one section (laws|decrees|principles|books|collections).
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "50", 10) || 50, 1), 200);
  const page = Math.max(parseInt(searchParams.get("page") || "1", 10) || 1, 1);
  const section = searchParams.get("section"); // optional: load only one section
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  try {
    // Helper: fetch a section with count
    const fetchSection = async (
      table: string,
      selectClause: string,
      sectionName: string
    ) => {
      const { data, count, error } = await supabase
        .schema("library")
        .from(table)
        .select(selectClause, { count: "exact" })
        .range(from, to);

      if (error) {
        console.error(`[Library Init API] ${sectionName} error:`, error);
      }

      const total = count ?? 0;
      const items = data || [];
      return {
        data: items,
        total,
        hasMore: from + items.length < total,
        page,
        limit,
      };
    };

    // Only fetch requested section(s)
    const shouldFetch = (s: string) => !section || section === s;

    const emptySection = { data: [], total: 0, hasMore: false, page: 1, limit };

    const [laws, decrees, principles, books, collections] = await Promise.all([
      shouldFetch("laws")
        ? fetchSection("laws", "*", "laws")
        : Promise.resolve(emptySection),
      shouldFetch("decrees")
        ? fetchSection("decrees_circulars", "*", "decrees")
        : Promise.resolve(emptySection),
      shouldFetch("principles")
        ? fetchSection(
            "principles",
            `id, principle_number, issuing_body, text, session_date, decision_number, year_hijri,
             judicial_collections ( id, title, court, track, source_id, category )`,
            "principles"
          )
        : Promise.resolve(emptySection),
      shouldFetch("books")
        ? fetchSection("feqh_books", "*", "books")
        : Promise.resolve(emptySection),
      shouldFetch("collections")
        ? fetchSection("judicial_collections", "*", "collections")
        : Promise.resolve(emptySection),
    ]);

    return NextResponse.json({
      laws,
      decrees,
      principles,
      books,
      collections,
    });
  } catch (error: any) {
    console.error("[Library Init API] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
