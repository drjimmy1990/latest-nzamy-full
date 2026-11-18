import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/access-control";
import { logAdminAction } from "@/lib/auth/adminAudit";
import { PAYABLE_ITEMS } from "@/lib/payments/catalog";
import { OFFER_COLUMNS, offerInputToColumns, type OfferRow } from "@/lib/offers/offerRules";
import { isMissingTable } from "@/lib/offers/offersServer";

/**
 * PATCH /api/v1/admin/offers/[id] — edit an offer, or stop / restart it at
 * once with `{ status: "paused" }` / `{ status: "active" }` (owner item 5:
 * «إيقاف فوري»). Only the fields sent are written. The founder row keeps its
 * audience, seats and plan (offerInputToColumns refuses them; a CHECK in
 * 20261128_50 holds them too). The write is conditional on the row's
 * updated_at, so two admins editing at once get a 409, not a silent
 * overwrite. settings.write, one audit row with the changed fields.
 */

export const dynamic = "force-dynamic";

const PLAN_REFS = new Set(Object.keys(PAYABLE_ITEMS));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireStaff("settings.write");
    if (!gate.ok) return gate.response;
    const { id } = await params;
    if (!UUID.test(id)) return NextResponse.json({ error: "غير موجود" }, { status: 404 });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "صيغة الطلب غير صالحة" }, { status: 400 });
    }

    const db = await createServiceClient();
    const current = await db.from("offers").select(OFFER_COLUMNS).eq("id", id).maybeSingle();
    if (current.error) {
      if (isMissingTable(current.error.code)) {
        return NextResponse.json({ error: "نظام العروض غير مفعّل بعد (لم يُنفَّذ ملف SQL 20261128_50)." }, { status: 503 });
      }
      console.error("[admin/offers PATCH] read failed:", current.error.code, current.error.message);
      return NextResponse.json({ error: "تعذّر قراءة العرض." }, { status: 500 });
    }
    if (!current.data) return NextResponse.json({ error: "غير موجود" }, { status: 404 });
    const row = current.data as unknown as OfferRow;

    const input = offerInputToColumns(body, row, PLAN_REFS);
    if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });

    const { data, error } = await db
      .from("offers")
      .update({ ...input.values, updated_by: gate.userId })
      .eq("id", id)
      .eq("updated_at", row.updated_at)
      .select(OFFER_COLUMNS);
    if (error) {
      if (error.code === "23514") return NextResponse.json({ error: "قيمة غير مقبولة في أحد الحقول." }, { status: 400 });
      console.error("[admin/offers PATCH] update failed:", error.code, error.message);
      return NextResponse.json({ error: "تعذّر حفظ العرض." }, { status: 500 });
    }
    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json({ error: "عدّل مشرف آخر هذا العرض للتو — أعد تحميل الصفحة." }, { status: 409 });
    }

    const changed = Object.keys(input.values);
    const prior = row as unknown as Record<string, unknown>;
    await logAdminAction({
      actorId: gate.userId,
      action: input.values.status === "paused" && changed.length === 1 ? "offer_stopped" : "offer_updated",
      targetType: "offer",
      targetId: id,
      before: Object.fromEntries(changed.map((k) => [k, prior[k] ?? null])),
      after: input.values,
      metadata: { slug: row.slug },
    });
    return NextResponse.json({ success: true, data: data[0] });
  } catch (err) {
    console.error("[admin/offers PATCH] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "تعذّر حفظ العرض." }, { status: 500 });
  }
}
