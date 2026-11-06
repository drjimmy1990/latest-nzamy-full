import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/access-control";
import { logAdminAction } from "@/lib/auth/adminAudit";
import { catalogRowUpdate } from "@/lib/pricing/catalogAdminRules";
import type { AdminPricingCatalogRow } from "@/lib/pricingRepository";

/**
 * PATCH /api/v1/admin/pricing-catalog/[serviceId] — an admin edits one row of
 * public.admin_pricing_catalog (S6-T7). Body (all optional, at least one):
 *   basePrice?: number    — base_price, 0..1,000,000, at most 2 decimals
 *   priceMode?: string    — price_mode, one of ClientServicePriceMode
 *   priceNote?: string    — metadata.priceNote, at most 200 characters
 *   enabled?: boolean     — enabled; false also sets metadata.adminHidden
 *
 * Gate: requireStaff("settings.write") before the first query. The row is read
 * first and catalogRowUpdate (src/lib/pricing/catalogAdminRules.ts) decides
 * the write from its CURRENT metadata — never a blind replace. A legacy row
 * (enabled = false, no adminHidden: customers see the code entry) is realigned
 * to the code entry in the same write, so the 20260518 seed's stale values
 * never reach customers. The update is conditional on the updated_at that was
 * read: a concurrent edit is a 409, not a lost update. Each success is audited.
 *
 * No create and no delete: rows come from migrations. R19: human-service ids
 * only — the AI tool `contract-review` is never priced here.
 */

const SERVICE_ID = /^[a-z0-9][a-z0-9-]{0,79}$/;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ serviceId: string }> },
) {
  try {
    const { serviceId } = await params;

    const gate = await requireStaff("settings.write");
    if (!gate.ok) return gate.response;

    if (typeof serviceId !== "string" || !SERVICE_ID.test(serviceId)) {
      return NextResponse.json({ error: "البند غير موجود" }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    }

    const adminClient = await createServiceClient();

    const { data: existing, error: fetchError } = await adminClient
      .from("admin_pricing_catalog")
      .select("*")
      .eq("service_id", serviceId)
      .maybeSingle();

    if (fetchError) {
      console.error("[admin/pricing-catalog PATCH] read failed:", fetchError.code, fetchError.message);
      return NextResponse.json({ error: "تعذّر قراءة البند — لم يتغيّر شيء." }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ error: "البند غير موجود" }, { status: 404 });
    }

    const row = existing as AdminPricingCatalogRow & { updated_at?: string };
    const decision = catalogRowUpdate(row, body);
    if (!decision.ok) {
      return NextResponse.json({ error: decision.error }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {
      ...decision.update,
      updated_at: new Date().toISOString(),
    };

    // updated_at is NOT NULL; a row read without it would silently lose the
    // race protection below, so it is a failure, never an unconditional write.
    if (typeof row.updated_at !== "string" || row.updated_at === "") {
      console.error("[admin/pricing-catalog PATCH] row has no updated_at; refusing an unconditional write:", serviceId);
      return NextResponse.json({ error: "تعذّر حفظ البند — لم يتغيّر شيء." }, { status: 500 });
    }

    const { data: updated, error } = await adminClient
      .from("admin_pricing_catalog")
      .update(updateData)
      .eq("service_id", serviceId)
      .eq("updated_at", row.updated_at)
      .select("*");

    if (error) {
      console.error("[admin/pricing-catalog PATCH] Supabase error:", error.code, error.message, error.details, error.hint);
      return NextResponse.json({ error: "تعذّر حفظ البند — لم يتغيّر شيء." }, { status: 500 });
    }
    if (!Array.isArray(updated) || updated.length === 0) {
      return NextResponse.json(
        { error: "تغيّر هذا البند منذ فتح الصفحة — أعد التحميل ثم عدّل." },
        { status: 409 },
      );
    }

    const changed = Object.keys(updateData).filter((k) => k !== "updated_at");
    const prior = existing as Record<string, unknown>;
    const current = updated[0] as Record<string, unknown>;
    await logAdminAction({
      actorId: gate.userId,
      action: "pricing_catalog_updated",
      targetType: "pricing_catalog",
      targetId: serviceId,
      before: Object.fromEntries(changed.map((k) => [k, prior[k] ?? null])),
      after: Object.fromEntries(changed.map((k) => [k, current[k] ?? null])),
      metadata: { audience: prior.audience ?? null, legacyRealigned: decision.legacyRealigned },
    });

    return NextResponse.json({ success: true, data: current });
  } catch (err) {
    console.error("[admin/pricing-catalog PATCH] Unexpected error:", err);
    return NextResponse.json({ error: "حدث خطأ أثناء تحديث البند" }, { status: 500 });
  }
}
