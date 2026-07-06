import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/access-control";

/** Columns an admin is allowed to patch on an article. */
const PATCHABLE_FIELDS = [
  "slug",
  "title",
  "title_en",
  "excerpt",
  "excerpt_en",
  "body",
  "category",
  "cover",
  "status",
  "featured",
  "read_time",
] as const;

/**
 * PATCH /api/v1/admin/articles/[id] — Update an article.
 *
 * Admin-gated. Only allowlisted fields are applied. When `status` transitions
 * to 'published' and the row has no `published_at` yet, it is stamped to now.
 *
 * Next 16: dynamic params are async.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin();
  if (!gate.isAdmin) {
    return NextResponse.json({ error: gate.error }, { status: gate.status ?? 403 });
  }

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  for (const field of PATCHABLE_FIELDS) {
    if (field in body) {
      update[field] = body[field];
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "لا توجد حقول للتحديث" }, { status: 400 });
  }

  update.updated_at = new Date().toISOString();

  try {
    const supabase = await createServiceClient();

    // If becoming published and no published_at yet, stamp it now.
    if (update.status === "published") {
      const { data: existing } = await supabase
        .from("articles")
        .select("published_at")
        .eq("id", id)
        .maybeSingle();

      if (existing && !existing.published_at) {
        update.published_at = new Date().toISOString();
      }
    }

    const { data, error } = await supabase
      .from("articles")
      .update(update)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      console.error("[admin/articles/[id] PATCH] Supabase error:", error.message, error.details, error.hint, error.code);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[admin/articles/[id] PATCH] Unexpected error:", err);
    return NextResponse.json({ error: "حدث خطأ أثناء تحديث المقال" }, { status: 500 });
  }
}

/**
 * DELETE /api/v1/admin/articles/[id] — Delete an article.
 *
 * Admin-gated. Next 16: dynamic params are async.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin();
  if (!gate.isAdmin) {
    return NextResponse.json({ error: gate.error }, { status: gate.status ?? 403 });
  }

  const { id } = await params;

  try {
    const supabase = await createServiceClient();
    const { error } = await supabase.from("articles").delete().eq("id", id);

    if (error) {
      console.error("[admin/articles/[id] DELETE] Supabase error:", error.message, error.details, error.hint, error.code);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin/articles/[id] DELETE] Unexpected error:", err);
    return NextResponse.json({ error: "حدث خطأ أثناء حذف المقال" }, { status: 500 });
  }
}
