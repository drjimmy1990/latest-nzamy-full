import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isValidUuid, validateTitle, dbErrorResponse } from "../_shared";

/**
 * /api/v1/research/items/[id] — one `research_items` row, addressed on its
 * own rather than through its session (used by researchService.ts's
 * markUsed/updateItem/removeFromInbox — see that file's header for why
 * those were local-only until now).
 *
 * Ownership is RLS-only — see ../_shared.ts's header for the exact policy.
 */

/**
 * PATCH /api/v1/research/items/[id]
 * Body: { used?: boolean, title?: string, content?: string } — at least one.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "غير مصرح — يرجى تسجيل الدخول" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "معرّف العنصر غير صالح" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "بيانات الطلب غير صالحة" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if ("used" in body) {
    if (typeof body.used !== "boolean") {
      return NextResponse.json({ error: "used يجب أن تكون true أو false" }, { status: 400 });
    }
    updates.used = body.used;
  }

  if ("title" in body) {
    const titleCheck = validateTitle(body.title);
    if (!titleCheck.ok) {
      return NextResponse.json({ error: titleCheck.error }, { status: 400 });
    }
    updates.title = titleCheck.value;
  }

  if ("content" in body) {
    if (typeof body.content !== "string" || body.content.length === 0) {
      return NextResponse.json({ error: "content يجب أن يكون نصاً غير فارغ" }, { status: 400 });
    }
    updates.content = body.content;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "لا توجد حقول صالحة للتحديث" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("research_items")
    .update(updates)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) {
    const { status, message } = dbErrorResponse(error);
    return NextResponse.json({ error: message }, { status });
  }
  // RLS scoped the write to 0 rows — either the id does not exist, or it is
  // not in a session this caller owns. Both read as "not found": this route
  // never confirms the existence of another user's item.
  if (!data) {
    return NextResponse.json({ error: "العنصر غير موجود" }, { status: 404 });
  }

  return NextResponse.json({ data });
}

/**
 * DELETE /api/v1/research/items/[id]
 */
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "غير مصرح — يرجى تسجيل الدخول" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "معرّف العنصر غير صالح" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("research_items")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    const { status, message } = dbErrorResponse(error);
    return NextResponse.json({ error: message }, { status });
  }
  if (!data) {
    return NextResponse.json({ error: "العنصر غير موجود" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
