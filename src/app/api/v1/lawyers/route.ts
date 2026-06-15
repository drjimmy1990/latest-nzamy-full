import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/lawyers — List verified lawyers (public)
 * Query params:
 *   - specialty (filter by specialization)
 *   - sort ('price' | 'experience', default: 'experience')
 *   - available (true to show only accepting clients)
 *   - limit (default: 20)
 *   - offset (default: 0)
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();

  const { searchParams } = new URL(request.url);
  const specialty = searchParams.get("specialty");
  const sort = searchParams.get("sort") ?? "experience";
  const available = searchParams.get("available");
  const limit = parseInt(searchParams.get("limit") ?? "20", 10);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);

  let query = supabase
    .from("profiles")
    .select("*, lawyer_profiles!inner(*)", { count: "exact" })
    .eq("user_type", "lawyer")
    .eq("lawyer_profiles.verification_status", "verified")
    .range(offset, offset + limit - 1);

  if (specialty) {
    query = query.contains("lawyer_profiles.specialties", [specialty]);
  }

  if (available === "true") {
    query = query.eq("lawyer_profiles.is_accepting_clients", true);
  }

  // Sorting
  switch (sort) {
    case "price":
      query = query.order("hourly_rate", {
        ascending: true,
        referencedTable: "lawyer_profiles",
      });
      break;
    case "experience":
    default:
      query = query.order("years_experience", {
        ascending: false,
        referencedTable: "lawyer_profiles",
      });
      break;
  }

  const { data, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ lawyers: data, total: count });
}
