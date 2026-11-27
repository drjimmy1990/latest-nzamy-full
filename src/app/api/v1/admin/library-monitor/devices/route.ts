import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/access-control";
import { logAdminAction } from "@/lib/auth/adminAudit";
import { createServiceClient } from "@/lib/supabase/server";
import { isMissingAccountDeviceSchema, parseAccountSwitchPatch } from "@/lib/devices/accountDevice";
import { forgetLibraryDeviceSetting } from "@/lib/library/deviceLimitServer";

/**
 * «حد الأجهزة للحساب كله» — batch l19, owner ٢٣٣ (LIVE-17): one mobile + one
 * computer per account across the whole platform. The switch is
 * public.library_monitor_settings.account_device_limit_enabled (20261209_40);
 * the number is fixed (1 + 1), so there is nothing else to set. The old
 * library-only columns (device_limit_enabled / device_limit, owner ٤٢٧) are no
 * longer read or written.
 *
 * Kept OUT of /api/v1/admin/library-monitor/settings on purpose: that route
 * reads a fixed column list, and adding this one would 500 the whole
 * «نشاط المكتبة» settings screen until the migration runs.
 *
 * GET — any admin (requireStaff("read")): { enabled, available }.
 *       Before 20261209_40: { enabled: false, available: false }.
 * PUT { enabled } — requireStaff("settings.write"), audited. Takes effect
 *       within 30 seconds on every server process.
 */
export const dynamic = "force-dynamic";

const COLUMNS = "account_device_limit_enabled";
// 20261209_40 not run yet — said without the file name (l16 C46).
const MISSING_AR = "هذه الميزة لم تُفعَّل بعد على الخادم، ويتولّى ذلك الفريق التقني.";
const NO_STORE = { "Cache-Control": "private, no-store" };

function enabledOf(row: Record<string, unknown> | null): boolean {
  return row?.account_device_limit_enabled === true;
}

export async function GET() {
  try {
    const gate = await requireStaff("read");
    if (!gate.ok) return gate.response;
    const service = await createServiceClient();
    const { data, error } = await service.from("library_monitor_settings").select(COLUMNS).eq("id", true).maybeSingle();
    if (error) {
      if (isMissingAccountDeviceSchema(error.code)) return NextResponse.json({ enabled: false, available: false }, { headers: NO_STORE });
      console.error("[admin/library-monitor/devices GET] failed:", error.code);
      return NextResponse.json({ error: "تعذّر تحميل الإعداد." }, { status: 500 });
    }
    return NextResponse.json(
      { enabled: enabledOf((data ?? null) as Record<string, unknown> | null), available: Boolean(data) },
      { headers: NO_STORE },
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
    const patch = parseAccountSwitchPatch(body);
    if (!patch.ok) return NextResponse.json({ error: patch.error }, { status: 400 });

    const service = await createServiceClient();
    const before = await service.from("library_monitor_settings").select(COLUMNS).eq("id", true).maybeSingle();
    if (before.error && isMissingAccountDeviceSchema(before.error.code)) {
      return NextResponse.json({ error: MISSING_AR }, { status: 503 });
    }
    const { data, error } = await service
      .from("library_monitor_settings")
      .update({ account_device_limit_enabled: patch.enabled, updated_at: new Date().toISOString(), updated_by: gate.userId })
      .eq("id", true)
      .select(COLUMNS)
      .maybeSingle();
    if (error) {
      if (isMissingAccountDeviceSchema(error.code)) return NextResponse.json({ error: MISSING_AR }, { status: 503 });
      console.error("[admin/library-monitor/devices PUT] failed:", error.code);
      return NextResponse.json({ error: "تعذّر حفظ الإعداد." }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: MISSING_AR }, { status: 503 });
    forgetLibraryDeviceSetting();

    const after = { enabled: enabledOf(data as Record<string, unknown>) };
    await logAdminAction({
      actorId: gate.userId,
      action: "account_device_limit_updated",
      targetType: "library_monitor_settings",
      targetId: "library_monitor_settings",
      before: { enabled: enabledOf((before.data ?? null) as Record<string, unknown> | null) },
      after,
    });
    return NextResponse.json({ ...after, available: true }, { headers: NO_STORE });
  } catch (err) {
    console.error("[admin/library-monitor/devices PUT] unexpected:", err instanceof Error ? err.name : "error");
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
