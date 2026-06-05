import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/lawyers — List verified lawyers (public)
 * Query params:
 *   - specialty (filter by specialization)
 *   - city (filter by city)
 *   - sort ('rating' | 'price' | 'experience', default: 'rating')
 *   - available (true to show only available)
 *   - limit (default: 20)
 *   - offset (default: 0)
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();

  const { searchParams } = new URL(request.url);
  const specialty = searchParams.get("specialty");
  const city = searchParams.get("city");
  const sort = searchParams.get("sort") ?? "rating";
  const available = searchParams.get("available");
  const limit = parseInt(searchParams.get("limit") ?? "20", 10);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);

  let query = supabase
    .from("profiles")
    .select("*, lawyer_profiles!inner(*)", { count: "exact" })
    .eq("user_type", "lawyer")
    .eq("lawyer_profiles.is_verified", true)
    .range(offset, offset + limit - 1);

  if (specialty) {
    query = query.contains("lawyer_profiles.specializations", [specialty]);
  }

  if (city) {
    query = query.eq("city", city);
  }

  if (available === "true") {
    query = query.eq("lawyer_profiles.is_available", true);
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
      query = query.order("years_of_experience", {
        ascending: false,
        referencedTable: "lawyer_profiles",
      });
      break;
    case "rating":
    default:
      query = query.order("rating", {
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
