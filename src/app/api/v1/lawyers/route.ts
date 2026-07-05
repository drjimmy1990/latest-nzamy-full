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

  // LAWYER-6.1: explicit projection — never SELECT profiles.phone/email (raw PII).
  // license_number is projected but stripped per-row below unless show_contact.
  let query = supabase
    .from("profiles")
    .select(
      "id, display_name, display_name_en, avatar_url, city, user_type, " +
      "lawyer_profiles!inner(user_id, specialties, years_experience, hourly_rate, " +
      "bio_ar, bio_en, verification_status, is_accepting_clients, marketplace_visible, " +
      "show_contact, bar_association, license_number)",
      { count: "exact" },
    )
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

  // LAWYER-6.1: strip regulated credential PII (license_number) for lawyers who
  // have not opted into public contact disclosure. phone/email are already
  // omitted from the projection above.
  const lawyers = ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
    const lp = (Array.isArray(row.lawyer_profiles)
      ? row.lawyer_profiles[0]
      : row.lawyer_profiles) as Record<string, unknown> | null;
    if (lp && lp.show_contact !== true) {
      delete lp.license_number;
    }
    return row;
  });

  return NextResponse.json({ lawyers, total: count });
}
