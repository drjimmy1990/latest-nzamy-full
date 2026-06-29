import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();

  // Bounded reads: the front-end mounts this once on load, so cap each table
  // to a sane page size instead of `select('*')` (unbounded table scan).
  // Optional ?limit (1-200, default 100) and ?page (1-based) query params.
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "100", 10) || 100, 1), 200);
  const page = Math.max(parseInt(searchParams.get("page") || "1", 10) || 1, 1);
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  try {
    // 1. Fetch laws (bounded)
    const { data: laws } = await supabase
      .schema("library")
      .from("laws")
      .select("*")
      .range(from, to);

    // 2. Fetch decrees (bounded)
    const { data: decrees } = await supabase
      .schema("library")
      .from("decrees_circulars")
      .select("*")
      .range(from, to);

    // 3. Fetch principles joined with collections (bounded)
    const { data: principles } = await supabase
      .schema("library")
      .from("principles")
      .select(`
        id, principle_number, issuing_body, text, session_date, decision_number, year_hijri,
        judicial_collections ( id, title, court, track, source_id, category )
      `)
      .range(from, to);

    // 4. Fetch feqh books (bounded)
    const { data: books } = await supabase
      .schema("library")
      .from("feqh_books")
      .select("*")
      .range(from, to);

    // 5. Fetch judicial collections (bounded)
    const { data: collections } = await supabase
      .schema('library')
      .from('judicial_collections')
      .select('*')
      .range(from, to);

    return NextResponse.json({
      laws: laws || [],
      decrees: decrees || [],
      principles: principles || [],
      books: books || [],
      collections: collections || []
    });
  } catch (error: any) {
    console.error("[Library Init API] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
