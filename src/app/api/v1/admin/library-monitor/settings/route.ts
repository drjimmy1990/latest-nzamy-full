import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/access-control";
import { logAdminAction } from "@/lib/auth/adminAudit";
import { createServiceClient } from "@/lib/supabase/server";
import { isMigrationMissing } from "@/lib/library/securityLockAdmin";
import { MONITOR_MIGRATION_MISSING_AR } from "@/lib/library/monitorAdmin";
import { peopleFor } from "@/lib/library/monitorAdminServer";
import { isMissingColumnError } from "@/lib/library/optionalColumn";
import {
  MONITOR_SETTINGS_DEFAULTS,
  MONITOR_SETTINGS_SELECT,
  MONITOR_SETTINGS_SELECT_V1,
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
 *
 * auto_lock_hours (20261103_10, owner q362) may not exist yet — the deploy
 * and the SQL can come in either order. GET then reads with
 * MONITOR_SETTINGS_SELECT_V1 and answers autoLockHours 24 with
 * autoLockMigrationMissing: true; PUT refuses a patch that names it (503,
 * the file to run) and saves any other patch with the V1 select.
 */

export const dynamic = "force-dynamic";

const AUTO_LOCK_COLUMN = "auto_lock_hours";
const AUTO_LOCK_MIGRATION_MISSING_AR = "شغّل ملف الترحيل 20261103_10_library_auto_lock_hours.sql أولاً";

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;
interface SettingsRead {
  row: Record<string, unknown> | null;
  error: { code?: string; message?: string } | null;
  /** True when the row was read without auto_lock_hours (20261103_10 not applied yet). */
  autoLockMigrationMissing: boolean;
}

/** The settings row with auto_lock_hours; before 20261103_10, read once more without it. */
async function readSettingsRow(service: ServiceClient): Promise<SettingsRead> {
  const read = (select: string) =>
    service.from("library_monitor_settings").select(select).eq("id", true).maybeSingle();
  const full = await read(MONITOR_SETTINGS_SELECT);
  if (!isMissingColumnError(full.error, AUTO_LOCK_COLUMN)) {
    return { row: (full.data ?? null) as Record<string, unknown> | null, error: full.error, autoLockMigrationMissing: false };
  }
  const v1 = await read(MONITOR_SETTINGS_SELECT_V1);
  return { row: (v1.data ?? null) as Record<string, unknown> | null, error: v1.error, autoLockMigrationMissing: true };
}

export async function GET() {
  try {
    const gate = await requireStaff("read");
    if (!gate.ok) return gate.response;

    const service = await createServiceClient();
    const read = await readSettingsRow(service);
    if (read.error) {
      if (isMigrationMissing(read.error.code)) {
        return NextResponse.json({
          settings: { ...MONITOR_SETTINGS_DEFAULTS },
          updatedAt: null,
          updatedBy: null,
          migrationMissing: true,
          autoLockMigrationMissing: true,
          message: MONITOR_MIGRATION_MISSING_AR,
        });
      }
      console.error("[admin/library-monitor/settings GET] query failed:", read.error.code);
      return NextResponse.json({ error: "تعذّر تحميل الإعدادات." }, { status: 500 });
    }
    const row = read.row;
    const by = typeof row?.updated_by === "string" ? row.updated_by : null;
    const people = await peopleFor(by ? [by] : []);
    return NextResponse.json(
      {
        settings: settingsFromRow(row),
        updatedAt: typeof row?.updated_at === "string" ? row.updated_at : null,
        updatedBy: by ? people.get(by) ?? null : null,
        migrationMissing: false,
        autoLockMigrationMissing: read.autoLockMigrationMissing,
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
    const beforeRead = await readSettingsRow(service);
    const namesAutoLock = AUTO_LOCK_COLUMN in patch.columns;
    if (namesAutoLock && beforeRead.autoLockMigrationMissing) {
      return NextResponse.json({ error: AUTO_LOCK_MIGRATION_MISSING_AR }, { status: 503 });
    }

    const { data, error } = await service
      .from("library_monitor_settings")
      .update({ ...patch.columns, updated_at: new Date().toISOString(), updated_by: gate.userId })
      .eq("id", true)
      .select(beforeRead.autoLockMigrationMissing ? MONITOR_SETTINGS_SELECT_V1 : MONITOR_SETTINGS_SELECT)
      .maybeSingle();
    if (error) {
      // The column vanished between the two reads, or the patch named it: one statement, nothing saved.
      if (isMissingColumnError(error, AUTO_LOCK_COLUMN)) {
        return NextResponse.json({ error: AUTO_LOCK_MIGRATION_MISSING_AR }, { status: 503 });
      }
      if (isMigrationMissing(error.code)) {
        return NextResponse.json({ error: MONITOR_MIGRATION_MISSING_AR }, { status: 503 });
      }
      // 23514: a CHECK refused a value the parser let through — never expected.
      console.error("[admin/library-monitor/settings PUT] update failed:", error.code);
      return NextResponse.json({ error: error.code === "23514" ? "قيمة خارج الحدود المسموحة." : "تعذّر حفظ الإعدادات." }, { status: error.code === "23514" ? 400 : 500 });
    }
    if (!data) return NextResponse.json({ error: MONITOR_MIGRATION_MISSING_AR }, { status: 503 });

    const before = settingsFromRow(beforeRead.row);
    const after = settingsFromRow(data as unknown as Record<string, unknown>);
    await logAdminAction({
      actorId: gate.userId,
      action: "library_monitor_settings_updated",
      targetType: "library_monitor_settings",
      targetId: "library_monitor_settings",
      before: Object.fromEntries(patch.changed.map((k) => [k, before[k]])),
      after: Object.fromEntries(patch.changed.map((k) => [k, after[k]])),
    });

    return NextResponse.json({
      settings: after,
      updatedAt: (data as { updated_at?: string }).updated_at ?? null,
      autoLockMigrationMissing: beforeRead.autoLockMigrationMissing,
    });
  } catch (err) {
    console.error("[admin/library-monitor/settings PUT] unexpected:", err instanceof Error ? err.name : "error");
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
