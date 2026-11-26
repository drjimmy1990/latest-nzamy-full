import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireApiUser } from "@/lib/auth/apiAuth";
import {
  PRIORITY_SQL_MISSING_AR,
  isHeld,
  isPrioritySqlMissing,
  openNowResultReply,
} from "@/lib/marketplace/marketPriority";

/**
 * «افتحه للجميع فوراً» (owner س٢٣, batch l16) on the client's own request.
 *
 * GET   { held, releaseAt } — is the request still in the Nezamy priority
 *       window? Read on the caller's own session (RLS: requester or assignee);
 *       only the requester's own pending, unassigned 'ai_workspace' request can
 *       be held. Before 20261206_40 runs: { held: false, installed: false }.
 * POST  opens it to every verified lawyer now —
 *       public.service_request_market_open_now (definer; checks the requester
 *       and the state itself). Never the service role.
 */

const NO_STORE = { "Cache-Control": "private, no-store" };
const MARKET_CLIENT_TYPES = ["individual", "corporate", "micro", "ngo", "government"];
const SIGN_IN = { error: "سجّل الدخول أولاً" };

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const auth = await requireApiUser(supabase, SIGN_IN);
    if (auth instanceof NextResponse) return auth;
    const { data, error } = await supabase
      .from("service_requests")
      .select("requester_user_id, receiver, assigned_to, status, marketplace_release_at")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      if (isPrioritySqlMissing(error.code)) return NextResponse.json({ held: false, releaseAt: null, installed: false }, { headers: NO_STORE });
      console.error("[service-requests open-market GET] read failed:", error.code);
      return NextResponse.json({ error: "تعذّر قراءة حالة الطلب." }, { status: 500, headers: NO_STORE });
    }
    const row = data as {
      requester_user_id?: string | null;
      receiver?: string | null;
      assigned_to?: string | null;
      status?: string | null;
      marketplace_release_at?: string | null;
    } | null;
    if (!row || row.requester_user_id !== auth.user.id) {
      return NextResponse.json({ error: "الطلب غير موجود." }, { status: 404, headers: NO_STORE });
    }
    // The market lists a request of these account types only (20261202_70).
    const { data: profile } = await supabase.from("profiles").select("user_type").eq("id", auth.user.id).maybeSingle();
    const clientType = MARKET_CLIENT_TYPES.includes(String((profile as { user_type?: unknown } | null)?.user_type ?? ""));
    const eligible =
      clientType &&
      row.receiver === "ai_workspace" &&
      row.assigned_to == null &&
      (row.status === "pending" || row.status === "pending_assignment");
    const releaseAt = typeof row.marketplace_release_at === "string" ? row.marketplace_release_at : null;
    return NextResponse.json({ held: eligible && isHeld(releaseAt, Date.now()), releaseAt, installed: true }, { headers: NO_STORE });
  } catch (err) {
    console.error("[service-requests open-market GET] threw:", err instanceof Error ? err.name : "error");
    return NextResponse.json({ error: "تعذّر قراءة حالة الطلب." }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const auth = await requireApiUser(supabase, SIGN_IN);
    if (auth instanceof NextResponse) return auth;
    const { data, error } = await supabase.rpc("service_request_market_open_now", { p_id: id });
    if (error) {
      if (isPrioritySqlMissing(error.code)) return NextResponse.json({ error: PRIORITY_SQL_MISSING_AR }, { status: 409, headers: NO_STORE });
      console.error("[service-requests open-market POST] rpc failed:", error.code);
      return NextResponse.json({ error: "تعذّر تنفيذ ذلك الآن. حاول مجدداً." }, { status: 500, headers: NO_STORE });
    }
    const result = (data as { result?: unknown } | null)?.result;
    const { status, message } = openNowResultReply(result);
    return NextResponse.json(
      status < 400 ? { result, message } : { error: message, result },
      { status, headers: NO_STORE },
    );
  } catch (err) {
    console.error("[service-requests open-market POST] threw:", err instanceof Error ? err.name : "error");
    return NextResponse.json({ error: "تعذّر تنفيذ ذلك الآن. حاول مجدداً." }, { status: 500, headers: NO_STORE });
  }
}
