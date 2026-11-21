import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/access-control";
import { logAdminAction } from "@/lib/auth/adminAudit";
import { createServiceClient } from "@/lib/supabase/server";
import { isMissingColumnError } from "@/lib/library/optionalColumn";
import { isMigrationMissing } from "@/lib/library/securityLockAdmin";
import {
  LIST_CAP_COLUMNS,
  LIST_CAP_SELECT,
  listCapSettingsFromRow,
  parseListCapPatch,
  type ListCapSettings,
} from "@/lib/library/publicListCap";

/**
 * «حد تصفح القوائم لغير المشترك» (batch l12, Q100a) — the five columns
 * 20261202_50 adds to public.library_monitor_settings, and only those (the
 * l11 protection route keeps its own, so neither depends on the other's
 * migration).
 *
 * GET — any admin (requireStaff("read")): the settings and the last 7 days'
 *       figures (library_public_list_stats). Before 20261202_50 runs: the
 *       defaults with migrationMissing: true.
 * PUT — { list: {enabled?, daily?, weekly?, addressDaily?, addressWeekly?},
 *       confirmEvidence? } requireStaff("settings.write"), audited with before
 *       / after. Switching the cap ON needs confirmEvidence: true (the owner
 *       approves the evidence first, question ١٥٨) and is audited under its
 *       own action. Changes reach the readers within a minute (60 s memo).
 */

export const dynamic = "force-dynamic";

const MIGRATION_MISSING_AR = "شغّل ملف الترحيل 20261202_50_l12_rules.sql أولاً";
const NO_STORE = { "Cache-Control": "private, no-store" };

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;

function missing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return isMigrationMissing(error.code) || LIST_CAP_COLUMNS.some((c) => isMissingColumnError(error, c));
}

async function readRow(service: ServiceClient) {
  return service.from("library_monitor_settings").select(`updated_at, ${LIST_CAP_SELECT}`).eq("id", true).maybeSingle();
}

async function readStats(service: ServiceClient): Promise<unknown> {
  try {
    const { data, error } = await service.rpc("library_public_list_stats", { p_days: 7 });
    return error ? null : data ?? null;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const gate = await requireStaff("read");
    if (!gate.ok) return gate.response;
    const service = await createServiceClient();
    const { data, error } = await readRow(service);
    if (error) {
      if (missing(error)) {
        return NextResponse.json(
          { settings: listCapSettingsFromRow(null), stats: null, migrationMissing: true, message: MIGRATION_MISSING_AR },
          { headers: NO_STORE },
        );
      }
      console.error("[admin/library-monitor/list-cap GET] query failed:", error.code);
      return NextResponse.json({ error: "تعذّر تحميل الإعدادات." }, { status: 500 });
    }
    return NextResponse.json(
      {
        settings: listCapSettingsFromRow((data ?? null) as Record<string, unknown> | null),
        stats: await readStats(service),
        migrationMissing: false,
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    console.error("[admin/library-monitor/list-cap GET] unexpected:", err instanceof Error ? err.name : "error");
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}

function auditView(s: ListCapSettings): Record<string, unknown> {
  return { ...s };
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
    const b = (body && typeof body === "object" ? body : {}) as { list?: unknown; confirmEvidence?: unknown };

    const service = await createServiceClient();
    const before = await readRow(service);
    if (before.error) {
      if (missing(before.error)) return NextResponse.json({ error: MIGRATION_MISSING_AR }, { status: 503 });
      console.error("[admin/library-monitor/list-cap PUT] read failed:", before.error.code);
      return NextResponse.json({ error: "تعذّر تحميل الإعدادات." }, { status: 500 });
    }
    if (!before.data) return NextResponse.json({ error: MIGRATION_MISSING_AR }, { status: 503 });
    const current = listCapSettingsFromRow(before.data as unknown as Record<string, unknown>);

    const patch = parseListCapPatch(b.list, current, b.confirmEvidence === true);
    if (!patch.ok) return NextResponse.json({ error: patch.error }, { status: patch.status ?? 400 });

    const { data, error } = await service
      .from("library_monitor_settings")
      .update({ ...patch.columns, updated_at: new Date().toISOString(), updated_by: gate.userId })
      .eq("id", true)
      .select(`updated_at, ${LIST_CAP_SELECT}`)
      .maybeSingle();
    if (error) {
      if (missing(error)) return NextResponse.json({ error: MIGRATION_MISSING_AR }, { status: 503 });
      console.error("[admin/library-monitor/list-cap PUT] update failed:", error.code);
      return NextResponse.json(
        { error: error.code === "23514" ? "قيمة خارج الحدود المسموحة." : "تعذّر حفظ الإعدادات." },
        { status: error.code === "23514" ? 400 : 500 },
      );
    }
    if (!data) return NextResponse.json({ error: MIGRATION_MISSING_AR }, { status: 503 });

    const after = listCapSettingsFromRow(data as unknown as Record<string, unknown>);
    const switchedOn = !current.enabled && after.enabled;
    await logAdminAction({
      actorId: gate.userId,
      action: switchedOn ? "library_public_list_cap_enabled" : "library_list_cap_settings_updated",
      targetType: "library_monitor_settings",
      targetId: "library_monitor_settings",
      before: auditView(current),
      after: { ...auditView(after), ...(switchedOn ? { evidenceConfirmed: true } : {}) },
      metadata: { changed: patch.changed },
    });

    return NextResponse.json({ settings: after }, { headers: NO_STORE });
  } catch (err) {
    console.error("[admin/library-monitor/list-cap PUT] unexpected:", err instanceof Error ? err.name : "error");
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
