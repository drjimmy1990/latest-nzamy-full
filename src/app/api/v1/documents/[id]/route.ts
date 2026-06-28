import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * DELETE /api/v1/documents/[id] — Delete a document metadata row.
 * The caller is expected to also remove the storage object (client-side, since
 * the row's storage_path is returned to the client). Auth required; only the
 * owner can delete (RLS enforces; here we also verify ownership explicitly).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Verify ownership before deleting.
    const { data: doc, error: fetchError } = await supabase
      .from("attachments")
      .select("id, owner_user_id, storage_path")
      .eq("id", id)
      .maybeSingle();

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }
    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    if (doc.owner_user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error: deleteError } = await supabase
      .from("attachments")
      .delete()
      .eq("id", id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, storage_path: doc.storage_path });
  } catch (err) {
    console.error("[documents DELETE] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}