import { NextResponse, type NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requireApiUser } from "@/lib/auth/apiAuth";
import { recordOfferEvent, type OfferEventKind } from "@/lib/offers/offersServer";

/**
 * POST /api/v1/offers/[id]/events  { kind: "impression" | "dismiss" | "click" }
 *
 * The popup and the offer cards report what the user did, for the admin's
 * stats (owner item 5: ظهور / إغلاق / نقر). A "dismiss" also stamps
 * offer_dismissals, which keeps the popup away for the offer's return delay
 * (default 3 days). Purchases are not reported here: the server counts paid
 * orders of the offer's plan.
 *
 * Only an ACTIVE offer records anything (404 otherwise). The same
 * impression / click from the same user counts once per short window
 * (offersServer DEDUPE_MS). Service client: the tables have no session grant.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const KINDS: readonly OfferEventKind[] = ["impression", "dismiss", "click"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!UUID.test(id)) return NextResponse.json({ error: "عرض غير معروف" }, { status: 404 });
    let kind: unknown;
    try {
      kind = ((await request.json()) as { kind?: unknown } | null)?.kind;
    } catch {
      kind = undefined;
    }
    if (!KINDS.includes(kind as OfferEventKind)) {
      return NextResponse.json({ error: "نوع الحدث غير معروف" }, { status: 400 });
    }

    const supabase = await createClient();
    const auth = await requireApiUser(supabase, { error: "سجّل الدخول" });
    if (auth instanceof NextResponse) return auth;

    const db = await createServiceClient();
    const recorded = await recordOfferEvent(db, auth.user.id, id.toLowerCase(), kind as OfferEventKind, new Date());
    if (!recorded) return NextResponse.json({ error: "العرض غير متاح" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[offers events POST] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "تعذّر الحفظ الآن" }, { status: 503 });
  }
}
