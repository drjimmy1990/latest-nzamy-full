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
    .or(`client_user_id.eq.${user.id},assigned_user_id.eq.${user.id}`)
    .single();

  if (error || !caseData) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
  }

  // Fetch related attachments via the case's request_id
  let attachments: Record<string, unknown>[] | null = null;
  if (caseData.request_id) {
    const { data: attachmentData } = await supabase
      .from("attachments")
      .select("*")
      .eq("request_id", caseData.request_id)
      .order("created_at", { ascending: false });
    attachments = attachmentData;
  }

  return NextResponse.json({
    data: { ...caseData, attachments: attachments ?? [] },
  });
}
