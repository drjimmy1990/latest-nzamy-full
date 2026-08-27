import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/access-control";

/**
 * GET /api/v1/admin/broadcasts — List all broadcasts (newest first)
 *
 * Requires: authenticated admin user
 *
 * FAILURE IS A 500, NOT AN EMPTY LIST. Both branches used to return
 * `{ data: [] }` at HTTP 200 so the page could "fall back to its local mock
 * gracefully". Two separate problems with that: an empty array is a claim that
 * no broadcast has ever been sent, and the page could not distinguish it from a
 * missing table, so it substituted mock broadcasts for real ones with no marker
 * of any kind. src/app/dashboard/admin/broadcasts/page.tsx:70 already throws on
 * `!res.ok` into the same fallback, so this lands without a consumer edit — and
 * the mock substitution is now something that page can be fixed to stop doing,
 * because it can finally tell the two cases apart.
 */
export async function GET() {
  try {
    const gate = await requireAdmin();
    if (!gate.isAdmin) {
      return NextResponse.json({ error: gate.error }, { status: gate.status ?? 403 });
    }

    const admin = await createServiceClient();
    const { data, error } = await admin
      .from("broadcasts")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[admin/broadcasts GET] Supabase error:", error.message, error.details, error.hint, error.code);
      return NextResponse.json({ error: "تعذّر تحميل الرسائل الجماعية." }, { status: 500 });
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (err) {
    console.error("[admin/broadcasts GET] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر تحميل الرسائل الجماعية." }, { status: 500 });
  }
}

/**
 * POST /api/v1/admin/broadcasts — Create a broadcast
 *
 * Body: {
 *   title: string (required),
 *   body?: string,
 *   audience?: string (default 'all'),
 *   status?: 'draft' | 'scheduled' | 'sent' (default 'draft'),
 *   scheduled_at?: string (ISO timestamp)
 * }
 *
 * created_by is set from the admin's user id.
 * Requires: authenticated admin user
 */
export async function POST(request: NextRequest) {
  try {
    const gate = await requireAdmin();
    if (!gate.isAdmin) {
      return NextResponse.json({ error: gate.error }, { status: gate.status ?? 403 });
    }

    let body: {
      title?: string;
      body?: string;
      audience?: string;
      status?: string;
      scheduled_at?: string | null;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    }

    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) {
      return NextResponse.json({ error: "العنوان مطلوب" }, { status: 400 });
    }

    const validStatuses = ["draft", "scheduled", "sent"];
    const status = validStatuses.includes(body.status ?? "")
      ? (body.status as string)
      : "draft";

    const insert: Record<string, unknown> = {
      title,
      body: body.body ?? null,
      audience: body.audience ?? "all",
      status,
      scheduled_at: body.scheduled_at ?? null,
      created_by: gate.userId,
    };

    if (status === "sent") {
      insert.sent_at = new Date().toISOString();
    }

    const admin = await createServiceClient();
    const { data, error } = await admin
      .from("broadcasts")
      .insert(insert)
      .select("*")
      .single();

    if (error) {
      console.error("[admin/broadcasts POST] Supabase error:", error.message, error.details, error.hint, error.code);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err) {
    console.error("[admin/broadcasts POST] Unexpected error:", err);
    return NextResponse.json({ error: "حدث خطأ أثناء إنشاء الرسالة" }, { status: 500 });
  }
}
