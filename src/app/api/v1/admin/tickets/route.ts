import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/access-control";

/**
 * GET /api/v1/admin/tickets — List support tickets (admin only)
 *
 * Query params:
 *   - status (optional filter: open | pending | resolved | closed)
 *
 * FAILURE IS A 500, NOT AN EMPTY LIST. A support queue that answers a broken
 * read with «لا توجد تذاكر» tells the admin there is nothing waiting on them —
 * the worst possible false statement for this particular screen. The page
 * (src/app/dashboard/admin/tickets/page.tsx:152) already throws on `!res.ok`,
 * so nothing depends on the 200.
 */
export async function GET(request: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.isAdmin) {
    return NextResponse.json({ error: gate.error }, { status: gate.status ?? 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    const adminClient = await createServiceClient();
    let query = adminClient
      .from("support_tickets")
      .select("*")
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[admin/tickets GET] Supabase error:", error.message, error.details, error.hint, error.code);
      return NextResponse.json({ error: "تعذّر تحميل تذاكر الدعم." }, { status: 500 });
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (err) {
    console.error("[admin/tickets GET] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر تحميل تذاكر الدعم." }, { status: 500 });
  }
}

/**
 * POST /api/v1/admin/tickets — Create a support ticket (admin only)
 *
 * Body: {
 *   subject: string (required),
 *   body?: string,
 *   category?: string,
 *   priority?: 'low' | 'normal' | 'high' | 'urgent',
 *   status?: 'open' | 'pending' | 'resolved' | 'closed',
 *   user_id?: string,
 *   assignee_id?: string,
 *   metadata?: Record<string, unknown>
 * }
 */
export async function POST(request: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.isAdmin) {
    return NextResponse.json({ error: gate.error }, { status: gate.status ?? 403 });
  }

  let body: {
    subject?: string;
    body?: string;
    category?: string;
    priority?: string;
    status?: string;
    user_id?: string;
    assignee_id?: string;
    metadata?: Record<string, unknown>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }

  if (!body.subject || typeof body.subject !== "string") {
    return NextResponse.json({ error: "الموضوع مطلوب" }, { status: 400 });
  }

  try {
    const adminClient = await createServiceClient();

    const insertData: Record<string, unknown> = {
      subject: body.subject,
      body: body.body ?? null,
      category: body.category ?? null,
      priority: body.priority ?? "normal",
      status: body.status ?? "open",
      user_id: body.user_id ?? null,
      assignee_id: body.assignee_id ?? null,
      metadata: body.metadata ?? {},
    };

    const { data, error } = await adminClient
      .from("support_tickets")
      .insert(insertData)
      .select("*")
      .single();

    if (error) {
      console.error("[admin/tickets POST] Supabase error:", error.message, error.details, error.hint, error.code);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err) {
    console.error("[admin/tickets POST] Unexpected error:", err);
    return NextResponse.json({ error: "حدث خطأ أثناء إنشاء التذكرة" }, { status: 500 });
  }
}
