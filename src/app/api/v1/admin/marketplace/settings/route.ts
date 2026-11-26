import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/access-control";
import { logAdminAction } from "@/lib/auth/adminAudit";
import {
  COMMISSION_SETTING_KEY,
  MARKET_SETTING_KEY,
  MARKET_SQL_MISSING_AR,
  applyMarketPatch,
  readMarketPatch,
} from "@/lib/marketplace/marketSettings";
import { readMarketSettings } from "@/lib/marketplace/marketSettingsServer";
import { COMMISSION_MAX_PCT, COMMISSION_MIN_PCT, validCommissionPct } from "@/lib/pricing/commission";

/**
 * GET   /api/v1/admin/marketplace/settings — the market switch, the way a
 *       lawyer's ask is accepted, the approval window, the commission rates
 *       (orders.manage).
 * PATCH same — { open?, acceptMode?, approvalMinutes?, commission?: {founderOrEnterprise, subscriber, free} }
 *       (settings.write, one audit row).
 *
 * l12 Q130a / Q151: the window (default 30 min, RAW[66]) and «فوري» are a
 * setting, never code. Opening a closed market stamps a new opened_at so old
 * requests are not flooded in. Commission rates stay inside the Terms' 5–15 %
 * and are shown only: nothing is collected through the platform.
 * Both rows are created by 20261202_70 — before it runs the route says so (409).
 */
export async function GET() {
  const gate = await requireStaff("read");
  if (!gate.ok) return gate.response;
  const admin = await createServiceClient();
  const read = await readMarketSettings(admin);
  return NextResponse.json({ data: { ...read.settings, commission: read.rates, installed: read.installed } });
}

export async function PATCH(request: NextRequest) {
  try {
    const gate = await requireStaff("settings.write");
    if (!gate.ok) return gate.response;

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    }
    const parsed = readMarketPatch(body);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    let commission: { founderOrEnterprise: number; subscriber: number; free: number } | null = null;
    if (body.commission !== undefined) {
      const c = body.commission && typeof body.commission === "object" ? (body.commission as Record<string, unknown>) : {};
      const f = validCommissionPct(c.founderOrEnterprise);
      const s = validCommissionPct(c.subscriber);
      const fr = validCommissionPct(c.free);
      if (f === null || s === null || fr === null) {
        return NextResponse.json(
          { error: `كل نسبة عمولة عدد صحيح من ${COMMISSION_MIN_PCT} إلى ${COMMISSION_MAX_PCT} (حدود الشروط والأحكام).` },
          { status: 400 },
        );
      }
      commission = { founderOrEnterprise: f, subscriber: s, free: fr };
    }

    const admin = await createServiceClient();
    const before = await readMarketSettings(admin);
    if (!before.installed) return NextResponse.json({ error: MARKET_SQL_MISSING_AR }, { status: 409 });

    const nowIso = new Date().toISOString();
    const nextMarket = applyMarketPatch(before.settings, parsed.patch, nowIso);
    const marketWrite = await admin
      .from("platform_settings")
      .update({ value: nextMarket, updated_by: gate.userId, updated_at: nowIso })
      .eq("key", MARKET_SETTING_KEY);
    if (marketWrite.error) {
      console.error("[admin/marketplace/settings PATCH] market write failed:", marketWrite.error.code);
      return NextResponse.json({ error: "تعذّر حفظ الإعداد" }, { status: 500 });
    }
    if (commission) {
      const commissionWrite = await admin
        .from("platform_settings")
        .update({ value: commission, updated_by: gate.userId, updated_at: nowIso })
        .eq("key", COMMISSION_SETTING_KEY);
      if (commissionWrite.error) {
        console.error("[admin/marketplace/settings PATCH] commission write failed:", commissionWrite.error.code);
        return NextResponse.json({ error: "تعذّر حفظ نسب العمولة" }, { status: 500 });
      }
    }

    await logAdminAction({
      actorId: gate.userId,
      action: "marketplace_settings_set",
      targetType: "platform_setting",
      targetId: MARKET_SETTING_KEY,
      before: { ...before.settings, commission: before.rates },
      after: { ...nextMarket, commission: commission ?? before.rates },
    });

    const after = await readMarketSettings(admin);
    return NextResponse.json({ data: { ...after.settings, commission: after.rates, installed: after.installed } });
  } catch (err) {
    console.error("[admin/marketplace/settings PATCH] unexpected:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "تعذّر حفظ الإعداد" }, { status: 500 });
  }
}
