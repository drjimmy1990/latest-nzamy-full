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
    .eq("owner_user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

/**
 * POST /api/v1/documents — Upload a document record
 * Auth required.
 * Body: { file_name?, label?, storage_path, size_bytes, mime_type, request_id? }
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

  const fileName = body.file_name ?? body.label;
  if (!fileName || !body.storage_path) {
    return NextResponse.json(
      { error: "file_name (or label) and storage_path are required" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("attachments")
    .insert({
      owner_user_id: user.id,
      file_name: body.file_name ?? body.label ?? "Untitled Document",
      storage_path: body.storage_path,
      mime_type: body.mime_type ?? "application/octet-stream",
      size_bytes: body.size_bytes ?? 0,
      request_id: body.request_id ?? null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
