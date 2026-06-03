import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/cases/[id] — Get case detail with related attachments
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  const { data: caseData, error } = await supabase
    .from("cases")
    .select("*")
    .eq("id", id)
    .or(`user_id.eq.${user.id},lawyer_id.eq.${user.id}`)
    .single();

  if (error || !caseData) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
  }

  // Fetch related attachments if they exist
  const { data: attachments } = await supabase
    .from("case_attachments")
    .select("*")
    .eq("case_id", id)
    .order("created_at", { ascending: false });

  return NextResponse.json({
    data: { ...caseData, attachments: attachments ?? [] },
  });
}
