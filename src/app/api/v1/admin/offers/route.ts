import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/access-control";
import { logAdminAction } from "@/lib/auth/adminAudit";
import { PAYABLE_ITEMS } from "@/lib/payments/catalog";
import { OFFER_COLUMNS, offerInputToColumns } from "@/lib/offers/offerRules";
import { adminOffers, isMissingTable } from "@/lib/offers/offersServer";

/**
 * «العروض» admin API (owner item 5) — backs /dashboard/admin/offers.
 *
 *   GET  → { migrationMissing, offers: AdminOfferDto[], statsError, planRefs }
 *          every offer with whether it is open now (server clock, seats,
 *          the founder campaign for the founder row) and its stats:
 *          impressions / dismissals / clicks (offer_event_counts()) and
 *          purchases (paid orders of its plan_ref). Any staff role may read.
 *   POST → create one offer (settings.write, audited). The founder link
 *          (campaign_id) and the reserved requires_invite_code are never set
 *          from here.
 *
 * Service client: the tables have no session privilege (20261128_50).
 */

export const dynamic = "force-dynamic";

const PLAN_REFS = new Set(Object.keys(PAYABLE_ITEMS));

function planRefOptions() {
  return Object.values(PAYABLE_ITEMS)
    .filter((i) => i.onSale)
    .map((i) => ({ id: i.id, labelAr: i.labelAr }));
}

export async function GET() {
  try {
    const gate = await requireStaff("read");
    if (!gate.ok) return gate.response;
    const db = await createServiceClient();
    const result = await adminOffers(db, new Date());
    if (result.migrationMissing) {
      return NextResponse.json({ migrationMissing: true, offers: [], statsError: false, planRefs: planRefOptions() });
    }
    return NextResponse.json({ ...result, planRefs: planRefOptions() });
  } catch (err) {
    console.error("[admin/offers GET] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "تعذّر تحميل العروض." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const gate = await requireStaff("settings.write");
    if (!gate.ok) return gate.response;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "صيغة الطلب غير صالحة" }, { status: 400 });
    }
    const input = offerInputToColumns(body, null, PLAN_REFS);
    if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });

    const db = await createServiceClient();
    const { data, error } = await db
      .from("offers")
      .insert({ ...input.values, created_by: gate.userId, updated_by: gate.userId })
      .select(OFFER_COLUMNS)
      .single();
    if (error) {
      if (isMissingTable(error.code)) {
        return NextResponse.json({ error: "نظام العروض غير مفعّل بعد (لم يُنفَّذ ملف SQL 20261128_50)." }, { status: 503 });
      }
      if (error.code === "23514") return NextResponse.json({ error: "قيمة غير مقبولة في أحد الحقول." }, { status: 400 });
      console.error("[admin/offers POST] insert failed:", error.code, error.message);
      return NextResponse.json({ error: "تعذّر حفظ العرض." }, { status: 500 });
    }

    const row = data as unknown as { id: string };
    await logAdminAction({
      actorId: gate.userId,
      action: "offer_created",
      targetType: "offer",
      targetId: row.id,
      before: null,
      after: input.values,
    });
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err) {
    console.error("[admin/offers POST] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "تعذّر حفظ العرض." }, { status: 500 });
  }
}
