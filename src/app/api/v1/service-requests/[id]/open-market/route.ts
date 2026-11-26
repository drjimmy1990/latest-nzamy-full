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
 * GET   { held, releaseAt } — public.service_request_market_hold (definer,
 *       requester only): held only when the market's own rule takes the
 *       request (switch open, free, not hidden, not demo / test …) and its
 *       priority window has not passed, so the screen never promises a market
 *       that will not happen. Before 20261206_40 runs: { held: false, installed: false }.
 * POST  opens it to every verified lawyer now —
 *       public.service_request_market_open_now (definer; checks the requester,
 *       the state and the same market rule itself). Never the service role.
 */

const NO_STORE = { "Cache-Control": "private, no-store" };
const SIGN_IN = { error: "سجّل الدخول أولاً" };

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const auth = await requireApiUser(supabase, SIGN_IN);
    if (auth instanceof NextResponse) return auth;
    const { data, error } = await supabase.rpc("service_request_market_hold", { p_id: id });
    if (error) {
      if (isPrioritySqlMissing(error.code)) return NextResponse.json({ held: false, releaseAt: null, installed: false }, { headers: NO_STORE });
      console.error("[service-requests open-market GET] rpc failed:", error.code);
      return NextResponse.json({ error: "تعذّر قراءة حالة الطلب." }, { status: 500, headers: NO_STORE });
    }
    const hold = data as { held?: unknown; release_at?: unknown } | null;
    if (!hold) return NextResponse.json({ error: "الطلب غير موجود." }, { status: 404, headers: NO_STORE });
    const releaseAt = typeof hold.release_at === "string" ? hold.release_at : null;
    // Both: the database's verdict, and the moment still ahead by this clock.
    return NextResponse.json({ held: hold.held === true && isHeld(releaseAt, Date.now()), releaseAt, installed: true }, { headers: NO_STORE });
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
