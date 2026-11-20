import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/access-control";
import { logAdminAction } from "@/lib/auth/adminAudit";
import { createServiceClient } from "@/lib/supabase/server";
import { isMissingColumnError } from "@/lib/library/optionalColumn";
import { isMigrationMissing } from "@/lib/library/securityLockAdmin";
import { peopleFor } from "@/lib/library/monitorAdminServer";
import {
  PUBLIC_VIEW_COLUMNS,
  PUBLIC_VIEW_SELECT,
  parseProtectionPatch,
  publicViewSettingsFromRow,
  type PublicViewSettings,
} from "@/lib/library/publicViewCap";

/**
 * «حماية المكتبة من السحب» (batch l11; O18 / A16 and O19 / R67) — the
 * columns 20261201_30 adds to public.library_monitor_settings, and only those
 * (the older route /settings keeps its own columns, so neither depends on the
 * other's migration):
 *   - the non-subscriber daily view cap: its switch, the per-viewer and
 *     per-address numbers, each verified crawler's switch and number, each
 *     visitor agent's number;
 *   - the sequential / parallel review rules and the staff alert addresses.
 *
 * GET — any admin (requireStaff("read")): the settings, the last 7 days'
 *       figures (library_public_view_stats), who changed them last. Before
 *       20261201_30 runs: the defaults with migrationMissing: true.
 * PUT — requireStaff("settings.write"), audited with before / after. Switching
 *       the cap ON needs `confirmEvidence: true` (G45: never a free toggle —
 *       the owner approves the evidence first); it is audited under its own
 *       action name. Changes reach the readers within a minute (60 s memo).
 */

export const dynamic = "force-dynamic";

const MIGRATION_MISSING_AR = "شغّل ملف الترحيل 20261201_30_library_scrape_guard.sql أولاً";

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;

function missing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return isMigrationMissing(error.code) || PUBLIC_VIEW_COLUMNS.some((c) => isMissingColumnError(error, c));
}

async function readRow(service: ServiceClient) {
  return service.from("library_monitor_settings").select(PUBLIC_VIEW_SELECT).eq("id", true).maybeSingle();
}

async function readStats(service: ServiceClient): Promise<unknown> {
  try {
    const { data, error } = await service.rpc("library_public_view_stats", { p_days: 7 });
    return error ? null : data ?? null;
  } catch {
    return null;
  }
}

function auditView(s: PublicViewSettings, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(keys.map((k) => [k, (s as unknown as Record<string, unknown>)[k]]));
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
          { settings: publicViewSettingsFromRow(null), stats: null, updatedAt: null, updatedBy: null, migrationMissing: true, message: MIGRATION_MISSING_AR },
          { headers: { "Cache-Control": "private, no-store" } },
        );
      }
      console.error("[admin/library-monitor/protection GET] query failed:", error.code);
      return NextResponse.json({ error: "تعذّر تحميل الإعدادات." }, { status: 500 });
    }
    const row = (data ?? null) as Record<string, unknown> | null;
    const by = typeof row?.updated_by === "string" ? row.updated_by : null;
    const people = await peopleFor(by ? [by] : []);
    return NextResponse.json(
      {
        settings: publicViewSettingsFromRow(row),
        stats: await readStats(service),
        updatedAt: typeof row?.updated_at === "string" ? row.updated_at : null,
        updatedBy: by ? people.get(by) ?? null : null,
        migrationMissing: false,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (err) {
    console.error("[admin/library-monitor/protection GET] unexpected:", err instanceof Error ? err.name : "error");
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

    const service = await createServiceClient();
    const before = await readRow(service);
    if (before.error) {
      if (missing(before.error)) return NextResponse.json({ error: MIGRATION_MISSING_AR }, { status: 503 });
      console.error("[admin/library-monitor/protection PUT] read failed:", before.error.code);
      return NextResponse.json({ error: "تعذّر تحميل الإعدادات." }, { status: 500 });
    }
    if (!before.data) return NextResponse.json({ error: MIGRATION_MISSING_AR }, { status: 503 });
    const current = publicViewSettingsFromRow(before.data as unknown as Record<string, unknown>);

    const patch = parseProtectionPatch(body, current);
    if (!patch.ok) return NextResponse.json({ error: patch.error }, { status: patch.status ?? 400 });

    const { data, error } = await service
      .from("library_monitor_settings")
      .update({ ...patch.columns, updated_at: new Date().toISOString(), updated_by: gate.userId })
      .eq("id", true)
      .select(PUBLIC_VIEW_SELECT)
      .maybeSingle();
    if (error) {
      if (missing(error)) return NextResponse.json({ error: MIGRATION_MISSING_AR }, { status: 503 });
      console.error("[admin/library-monitor/protection PUT] update failed:", error.code);
      return NextResponse.json(
        { error: error.code === "23514" ? "قيمة خارج الحدود المسموحة." : "تعذّر حفظ الإعدادات." },
        { status: error.code === "23514" ? 400 : 500 },
      );
    }
    if (!data) return NextResponse.json({ error: MIGRATION_MISSING_AR }, { status: 503 });

    const after = publicViewSettingsFromRow(data as unknown as Record<string, unknown>);
    const switchedOn = !current.enabled && after.enabled;
    await logAdminAction({
      actorId: gate.userId,
      action: switchedOn ? "library_public_view_cap_enabled" : "library_protection_settings_updated",
      targetType: "library_monitor_settings",
      targetId: "library_monitor_settings",
      before: auditView(current, patch.changed),
      after: { ...auditView(after, patch.changed), ...(switchedOn ? { evidenceConfirmed: true } : {}) },
    });

    return NextResponse.json({
      settings: after,
      updatedAt: (data as { updated_at?: string }).updated_at ?? null,
    });
  } catch (err) {
    console.error("[admin/library-monitor/protection PUT] unexpected:", err instanceof Error ? err.name : "error");
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
