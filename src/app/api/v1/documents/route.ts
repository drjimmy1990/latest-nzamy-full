import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/documents — List user's documents
 * Auth required.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("attachments")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

/**
 * POST /api/v1/documents — Upload a document record
 * Auth required.
 * Body: { file_name, file_url, file_size, file_type, case_ref? }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  if (!body.file_name || !body.file_url || !body.file_size || !body.file_type) {
    return NextResponse.json(
      { error: "file_name, file_url, file_size, and file_type are required" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("attachments")
    .insert({
      user_id: user.id,
      file_name: body.file_name,
      file_url: body.file_url,
      file_size: body.file_size,
      file_type: body.file_type,
      request_id: body.case_ref ?? null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
