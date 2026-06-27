import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();

  try {
    // 1. Fetch all laws
    const { data: laws } = await supabase
      .schema("library")
      .from("laws")
      .select("*");

    // 2. Fetch all decrees
    const { data: decrees } = await supabase
      .schema("library")
      .from("decrees_circulars")
      .select("*");

    // 3. Fetch all principles joined with collections
    const { data: principles } = await supabase
      .schema("library")
      .from("principles")
      .select(`
        id, principle_number, issuing_body, text, session_date, decision_number, year_hijri,
        judicial_collections ( id, title, court, track, source_id, category )
      `);

    // 4. Fetch all feqh books
    const { data: books } = await supabase
      .schema("library")
      .from("feqh_books")
      .select("*");

    // 5. Fetch all judicial collections
    const { data: collections } = await supabase
      .schema('library')
      .from('judicial_collections')
      .select('*');

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
