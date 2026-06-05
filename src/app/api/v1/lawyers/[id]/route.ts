import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/lawyers/[id] — Get single lawyer profile (public)
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { id } = await context.params;

  const { data, error } = await supabase
    .from("profiles")
    .select("*, lawyer_profiles!inner(*)")
    .eq("id", id)
    .eq("user_type", "lawyer")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  return NextResponse.json({ data });
}
