import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/access-control";
import { logAdminAction } from "@/lib/auth/adminAudit";
import { createServiceClient } from "@/lib/supabase/server";
import {
  founderCampaignSettingIssue,
  founderCapacityLiteralIssue,
  mergeFounderCampaignSetting,
} from "@/lib/pricing/campaigns";
import {
  founderAdminSummaryFromRpc,
  founderCapacityFloorIssue,
  parseFounderSalePatch,
} from "@/lib/membership/founderAdmin";

/**
 * PATCH /api/v1/admin/founder/sale — «إيقاف البيع مؤقتًا / استئناف البيع» and
 * the seat count (P3 Task 10, ruling R2).
 *
 * Body: { salePaused?: boolean, capacity?: number }, at least one (R25: a
 * capacity save sends no salePaused, so it cannot undo a concurrent pause).
 * requireStaff("settings.write") first. Only the posted keys are MERGED into
 * platform_settings['founder_campaign'] (the dates and library_days are kept)
 * with Task 8's helpers — the raw capacity literal (digits only), the merge,
 * and the same validator as /api/v1/admin/settings. A capacity (when sent)
 * below the seats already taken (active + live reserved,
 * founder_seat_summary()) is a 400. Audited with the value before and after.
 *
 * The read-merge-write is not atomic (as on the settings page): two admins
 * saving at the same instant could lose one change. A seat reserved between
 * the floor check and the write only makes the SQL read the campaign as full.
 */

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  try {
    const gate = await requireStaff("settings.write");
    if (!gate.ok) return gate.response;

    let raw: string;
    let body: unknown;
    try {
      raw = await request.text();
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    }
    const literal = founderCapacityLiteralIssue(raw);
    if (literal) return NextResponse.json({ error: literal }, { status: 400 });
    const parsed = parseFounderSalePatch(body);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const { patch } = parsed;

    const service = await createServiceClient();

    // The stored value: a failed read refuses the write (merging into nothing
    // would wipe the campaign dates).
    const { data: stored, error: storedError } = await service
      .from("platform_settings")
      .select("value")
      .eq("key", "founder_campaign")
      .maybeSingle();
    if (storedError) {
      console.error("[admin/founder/sale] founder_campaign read failed:", storedError.code);
      return NextResponse.json({ error: "تعذّر قراءة إعداد الحملة الحالي — لم يُحفظ شيء، حاول مجددًا" }, { status: 503 });
    }
    if (!stored) {
      return NextResponse.json(
        { error: "إعداد الحملة (founder_campaign) غير موجود — اضبط تواريخ الحملة من إعدادات المنصة أولًا" },
        { status: 400 },
      );
    }

    if (patch.capacity !== undefined) {
      const { data: summaryData, error: summaryError } = await service.rpc("founder_seat_summary");
      const summary = summaryError ? null : founderAdminSummaryFromRpc(summaryData);
      if (!summary) {
        console.error("[admin/founder/sale] founder_seat_summary failed:", summaryError?.code ?? "malformed");
        return NextResponse.json({ error: "تعذّر قراءة المقاعد المحجوزة الآن — لم يُحفظ شيء" }, { status: 503 });
      }
      const floor = founderCapacityFloorIssue(patch.capacity, summary);
      if (floor) return NextResponse.json({ error: floor }, { status: 400 });
    }

    const before = (stored as { value: unknown }).value ?? null;
    const toStore = mergeFounderCampaignSetting(before, patch);
    const invalid = founderCampaignSettingIssue(toStore);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

    const { data, error } = await service
      .from("platform_settings")
      .upsert({ key: "founder_campaign", value: toStore, updated_at: new Date().toISOString() }, { onConflict: "key" })
      .select("value")
      .single();
    if (error) {
      console.error("[admin/founder/sale] write failed:", error.code);
      return NextResponse.json({ error: "تعذّر حفظ الإعداد — حاول مجددًا" }, { status: 500 });
    }

    await logAdminAction({
      actorId: gate.userId,
      action: "founder_sale_updated",
      targetType: "platform_setting",
      targetId: "founder_campaign",
      before: { value: before },
      after: { value: toStore },
    });

    return NextResponse.json({ success: true, value: (data as { value: unknown } | null)?.value ?? toStore });
  } catch (err) {
    console.error("[admin/founder/sale] unexpected:", err instanceof Error ? err.name : "error");
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
