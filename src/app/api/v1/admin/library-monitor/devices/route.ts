import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/access-control";
import { logAdminAction } from "@/lib/auth/adminAudit";
import { createServiceClient } from "@/lib/supabase/server";
import { isMissingDeviceSchema, parseDeviceSettingsPatch } from "@/lib/library/deviceLimit";
import { forgetLibraryDeviceSetting } from "@/lib/library/deviceLimitServer";

/**
 * «أجهزة المكتبة» — the two device-limit columns of the library settings row
 * (public.library_monitor_settings, 20261108_20; owner ٤٢٧).
 *
 * Kept OUT of /api/v1/admin/library-monitor/settings on purpose: that route
 * reads a fixed column list, and adding these two would 500 the whole
 * «نشاط المكتبة» settings screen until the migration runs.
 *
 * GET — any admin (requireStaff("read")): { enabled, limit, available }.
 *       Before 20261108_20: { enabled: false, limit: 2, available: false }.
 * PUT { enabled?, limit? } — requireStaff("settings.write"), audited. Takes
 *       effect for new reads within a minute on other server processes.
 */
export const dynamic = "force-dynamic";

const COLUMNS = "device_limit_enabled, device_limit";
const MISSING_AR = "شغّل ملف الترحيل 20261108_20_library_device_limit.sql أولاً";

function settingsOf(row: Record<string, unknown> | null): { enabled: boolean; limit: number } {
  return {
    enabled: row?.device_limit_enabled === true,
    limit: typeof row?.device_limit === "number" ? row.device_limit : 2,
  };
}

export async function GET() {
  try {
    const gate = await requireStaff("read");
    if (!gate.ok) return gate.response;
    const service = await createServiceClient();
    const { data, error } = await service.from("library_monitor_settings").select(COLUMNS).eq("id", true).maybeSingle();
    if (error) {
      if (isMissingDeviceSchema(error.code)) return NextResponse.json({ enabled: false, limit: 2, available: false });
      console.error("[admin/library-monitor/devices GET] failed:", error.code);
      return NextResponse.json({ error: "تعذّر تحميل الإعداد." }, { status: 500 });
    }
    return NextResponse.json(
      { ...settingsOf((data ?? null) as Record<string, unknown> | null), available: Boolean(data) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (err) {
    console.error("[admin/library-monitor/devices GET] unexpected:", err instanceof Error ? err.name : "error");
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const gate = await requireStaff("settings.write");
    if (!gate.ok) return gate.response;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    }
    const patch = parseDeviceSettingsPatch(body);
    if (!patch.ok) return NextResponse.json({ error: patch.error }, { status: 400 });

    const service = await createServiceClient();
    const before = await service.from("library_monitor_settings").select(COLUMNS).eq("id", true).maybeSingle();
    if (before.error && isMissingDeviceSchema(before.error.code)) {
      return NextResponse.json({ error: MISSING_AR }, { status: 503 });
    }
    const { data, error } = await service
      .from("library_monitor_settings")
      .update({ ...patch.columns, updated_at: new Date().toISOString(), updated_by: gate.userId })
      .eq("id", true)
      .select(COLUMNS)
      .maybeSingle();
    if (error) {
      if (isMissingDeviceSchema(error.code)) return NextResponse.json({ error: MISSING_AR }, { status: 503 });
      console.error("[admin/library-monitor/devices PUT] failed:", error.code);
      return NextResponse.json(
        { error: error.code === "23514" ? "قيمة خارج الحدود المسموحة." : "تعذّر حفظ الإعداد." },
        { status: error.code === "23514" ? 400 : 500 },
      );
    }
    if (!data) return NextResponse.json({ error: MISSING_AR }, { status: 503 });
    forgetLibraryDeviceSetting();

    const after = settingsOf(data as Record<string, unknown>);
    await logAdminAction({
      actorId: gate.userId,
      action: "library_device_limit_updated",
      targetType: "library_monitor_settings",
      targetId: "library_monitor_settings",
      before: settingsOf((before.data ?? null) as Record<string, unknown> | null),
      after,
    });
    return NextResponse.json({ ...after, available: true });
  } catch (err) {
    console.error("[admin/library-monitor/devices PUT] unexpected:", err instanceof Error ? err.name : "error");
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
