import { NextResponse, NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { TICKET_SELECT, toTicketDto, validateTicketInput, ticketDbErrorResponse, type TicketRow } from "./_shared";

/**
 * /api/v1/tickets — Phase 6 (Help tab support tickets), the caller's own
 * queue. HelpTab.tsx (src/app/settings/components/tabs/HelpTab.tsx) currently
 * submits nowhere; this is the contract its rewiring (screens phase) will
 * call.
 *
 * Backed by `public.support_tickets` (20260706_content_and_ops.sql), which
 * already ships an owner insert policy ("tickets_insert_own": user_id =
 * auth.uid()) and an owner select policy ("tickets_select_own": same check)
 * alongside an admin "for all" policy — so both verbs below use the caller's
 * own RLS-scoped client, never the service role. The admin queue lives at
 * /api/v1/admin/tickets and is untouched by this route.
 *
 * `status` and `assignee_id` are admin-only: the RLS-scoped INSERT below
 * never sets them (the column defaults — 'open' — apply), and the SELECT
 * still narrows to `user_id = eq(auth.uid())` on top of RLS. Without that
 * narrowing an admin account calling THIS endpoint would get every ticket
 * back (their own "for all" policy has no owner restriction) instead of just
 * the tickets they personally filed — the same reasoning as
 * /api/v1/client/contracts's GET.
 */

/**
 * GET /api/v1/tickets → { data: Ticket[], total } — the caller's own
 * tickets, newest first.
 */
export async function GET(_request: NextRequest) {
  try {
    const auth = await assertRole();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const { data, error, count } = await supabase
      .from("support_tickets")
      .select(TICKET_SELECT, { count: "exact" })
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      console.error("[tickets GET] query failed:", error.message, error.code);
      return NextResponse.json({ error: "تعذّر تحميل تذاكر الدعم." }, { status: 500 });
    }

    const rows = (data ?? []) as unknown as TicketRow[];
    return NextResponse.json({ data: rows.map(toTicketDto), total: count ?? rows.length });
  } catch (err) {
    console.error("[tickets GET] Unexpected error:", err);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}

/**
 * POST /api/v1/tickets — files a new support ticket for the signed-in
 * caller. Body: { subject, message, category, priority? }.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await assertRole();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    }

    const validation = validateTicketInput(body);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const { subject, message, category, priority } = validation.value;

    const { data, error } = await supabase
      .from("support_tickets")
      .insert({
        user_id: user.id,
        subject,
        body: message,
        category,
        priority,
      })
      .select(TICKET_SELECT)
      .single();

    if (error || !data) {
      console.error("[tickets POST] insert failed:", error?.message, error?.code);
      const { status, message: errorMessage } = ticketDbErrorResponse(error);
      return NextResponse.json({ error: errorMessage }, { status });
    }

    return NextResponse.json({ data: toTicketDto(data as unknown as TicketRow) }, { status: 201 });
  } catch (err) {
    console.error("[tickets POST] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر حفظ التذكرة." }, { status: 500 });
  }
}
