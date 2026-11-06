import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/access-control";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/admin/pricing-catalog — every row of public.admin_pricing_catalog
 * (S6-T7), for /dashboard/admin/pricing. Any staff role may read
 * (requireStaff("read"), before the first query); the edit is gated on
 * [serviceId]/route.ts (settings.write).
 *
 * Every row, enabled or not, both audiences: the screen shows what the
 * customer sees for each (customerViewOf in src/lib/pricing/catalogAdminRules.ts).
 * A failed read is a 500, never `{ data: [] }` — an empty price list on an
 * admin money screen is a decision-grade claim.
 *
 * There is no POST and no DELETE: rows come from migrations.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const gate = await requireStaff("read");
    if (!gate.ok) return gate.response;

    const adminClient = await createServiceClient();
    const { data, error } = await adminClient
      .from("admin_pricing_catalog")
      .select("*")
      .order("category_id", { ascending: true })
      .order("service_id", { ascending: true });

    if (error || !Array.isArray(data)) {
      console.error("[admin/pricing-catalog GET] Supabase error:", error?.code, error?.message);
      return NextResponse.json({ error: "تعذّر تحميل قائمة الأسعار." }, { status: 500 });
    }

    return NextResponse.json({ data, total: data.length });
  } catch (err) {
    console.error("[admin/pricing-catalog GET] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر تحميل قائمة الأسعار." }, { status: 500 });
  }
}
