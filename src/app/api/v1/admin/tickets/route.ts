import { NextRequest, NextResponse } from "next/server";
import { DB_ERROR_AR } from "@/lib/api/dbError";
import { createServiceClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/access-control";
import { logAdminAction } from "@/lib/auth/adminAudit";
import { parseTicketsQuery } from "@/lib/admin/ticketsQuery";

/**
 * GET /api/v1/admin/tickets — List support tickets (admin only)
 *
 * Query params (checked by parseTicketsQuery; a bad value is a 400):
 *   - status (optional filter: open | pending | resolved | closed)
 *   - user_id (optional: one account's tickets — a uuid)
 *   - limit (optional: 1..500; absent = the whole list, as before)
 *
 * FAILURE IS A 500, NOT AN EMPTY LIST. A support queue that answers a broken
 * read with «لا توجد تذاكر» tells the admin there is nothing waiting on them —
 * the worst possible false statement for this particular screen. The page
 * (src/app/dashboard/admin/tickets/page.tsx:152) already throws on `!res.ok`,
 * so nothing depends on the 200.
 */
export async function GET(request: NextRequest) {
  // l16 (C35): the staff-role gate (least privilege, staffRoles.ts), not admin-only.
  const gate = await requireStaff("read");
  if (!gate.ok) return gate.response;

  try {
    // status / user_id / limit are checked before the query (ticketsQuery.ts);
    // user_id serves the «تذاكر الدعم» tab of one user's page (live check of
    // 13 Nov, row 31), which used to print three invented tickets.
    const parsed = parseTicketsQuery(new URL(request.url).searchParams);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const adminClient = await createServiceClient();
    let query = adminClient
      .from("support_tickets")
      .select("*")
      .order("created_at", { ascending: false });

    if (parsed.status) {
      query = query.eq("status", parsed.status);
    }
    if (parsed.userId) {
      query = query.eq("user_id", parsed.userId);
    }
    if (parsed.limit !== null) {
      query = query.limit(parsed.limit);
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
  // Owner ٢١٠: a staff role with tickets.manage; audited.
  const gate = await requireStaff("tickets.manage");
  if (!gate.ok) return gate.response;

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
      return NextResponse.json({ error: DB_ERROR_AR }, { status: 500 });
    }

    await logAdminAction({
      actorId: gate.userId,
      action: "support_ticket_created",
      targetType: "support_ticket",
      targetId: data?.id != null ? String(data.id) : null,
      after: {
        subject: insertData.subject,
        priority: insertData.priority,
        status: insertData.status,
        user_id: insertData.user_id,
        assignee_id: insertData.assignee_id,
      },
    });

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err) {
    console.error("[admin/tickets POST] Unexpected error:", err);
    return NextResponse.json({ error: "حدث خطأ أثناء إنشاء التذكرة" }, { status: 500 });
  }
}
