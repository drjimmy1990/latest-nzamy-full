import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/access-control";
import { logAdminAction } from "@/lib/auth/adminAudit";
import { createServiceClient } from "@/lib/supabase/server";
import { isMigrationMissing } from "@/lib/library/securityLockAdmin";
import { MONITOR_MIGRATION_MISSING_AR } from "@/lib/library/monitorAdmin";
import { peopleFor } from "@/lib/library/monitorAdminServer";
import {
  MONITOR_SETTINGS_DEFAULTS,
  MONITOR_SETTINGS_SELECT,
  parseSettingsPatch,
  settingsFromRow,
} from "@/lib/library/monitorSettings";

/**
 * «نشاط المكتبة» — the one row of public.library_monitor_settings (20261031_10):
 * the library caps, the review rules, the flag action, the alerts.
 *
 * GET — any admin (requireStaff("read")). Before the migration runs it
 *       answers the defaults with migrationMissing: true.
 * PUT { field: value, … } — any subset of the fields (monitorSettings.ts),
 *       requireStaff("settings.write"), audited with the before / after
 *       values. The reader-facing quota picks a change up within a minute
 *       (the proxy remembers an allowed document for 60 s).
 */

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const gate = await requireStaff("read");
    if (!gate.ok) return gate.response;

    const service = await createServiceClient();
    const { data, error } = await service
      .from("library_monitor_settings")
      .select(MONITOR_SETTINGS_SELECT)
      .eq("id", true)
      .maybeSingle();
    if (error) {
      if (isMigrationMissing(error.code)) {
        return NextResponse.json({
          settings: { ...MONITOR_SETTINGS_DEFAULTS },
          updatedAt: null,
          updatedBy: null,
          migrationMissing: true,
          message: MONITOR_MIGRATION_MISSING_AR,
        });
      }
      console.error("[admin/library-monitor/settings GET] query failed:", error.code);
      return NextResponse.json({ error: "تعذّر تحميل الإعدادات." }, { status: 500 });
    }
    const row = (data ?? null) as Record<string, unknown> | null;
    const by = typeof row?.updated_by === "string" ? row.updated_by : null;
    const people = await peopleFor(by ? [by] : []);
    return NextResponse.json(
      {
        settings: settingsFromRow(row),
        updatedAt: typeof row?.updated_at === "string" ? row.updated_at : null,
        updatedBy: by ? people.get(by) ?? null : null,
        migrationMissing: false,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (err) {
    console.error("[admin/library-monitor/settings GET] unexpected:", err instanceof Error ? err.name : "error");
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
    const patch = parseSettingsPatch(body);
    if (!patch.ok) return NextResponse.json({ error: patch.error }, { status: 400 });

    const service = await createServiceClient();
    const { data: beforeRow } = await service
      .from("library_monitor_settings")
      .select(MONITOR_SETTINGS_SELECT)
      .eq("id", true)
      .maybeSingle();

    const { data, error } = await service
      .from("library_monitor_settings")
      .update({ ...patch.columns, updated_at: new Date().toISOString(), updated_by: gate.userId })
      .eq("id", true)
      .select(MONITOR_SETTINGS_SELECT)
      .maybeSingle();
    if (error) {
      if (isMigrationMissing(error.code)) {
        return NextResponse.json({ error: MONITOR_MIGRATION_MISSING_AR }, { status: 503 });
      }
      // 23514: a CHECK refused a value the parser let through — never expected.
      console.error("[admin/library-monitor/settings PUT] update failed:", error.code);
      return NextResponse.json({ error: error.code === "23514" ? "قيمة خارج الحدود المسموحة." : "تعذّر حفظ الإعدادات." }, { status: error.code === "23514" ? 400 : 500 });
    }
    if (!data) return NextResponse.json({ error: MONITOR_MIGRATION_MISSING_AR }, { status: 503 });

    const before = settingsFromRow((beforeRow ?? null) as Record<string, unknown> | null);
    const after = settingsFromRow(data as unknown as Record<string, unknown>);
    await logAdminAction({
      actorId: gate.userId,
      action: "library_monitor_settings_updated",
      targetType: "library_monitor_settings",
      targetId: "library_monitor_settings",
      before: Object.fromEntries(patch.changed.map((k) => [k, before[k]])),
      after: Object.fromEntries(patch.changed.map((k) => [k, after[k]])),
    });

    return NextResponse.json({ settings: after, updatedAt: (data as { updated_at?: string }).updated_at ?? null });
  } catch (err) {
    console.error("[admin/library-monitor/settings PUT] unexpected:", err instanceof Error ? err.name : "error");
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
