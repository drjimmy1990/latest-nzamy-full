import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/access-control";
import { logAdminAction } from "@/lib/auth/adminAudit";
import { createServiceClient } from "@/lib/supabase/server";
import { isMigrationMissing } from "@/lib/library/securityLockAdmin";
import {
  LIMIT_SELECT,
  MONITOR_MIGRATION_MISSING_AR,
  parseUserLimitBody,
  toLimitDto,
  type LimitRow,
} from "@/lib/library/monitorAdmin";
import { peopleFor, userIdByEmail } from "@/lib/library/monitorAdminServer";

/**
 * «نشاط المكتبة» — per-user library limits (public.library_user_limits,
 * 20261031_10). They win over the settings for that reader: lower them for a
 * suspicious account, or RAISE them for an office whose work needs more.
 *
 * GET  — every row (admin and automatic slow-down), newest first. requireStaff("read").
 * POST { email | userId, dailyDocs?, hourlyDocs?, until?, note } — set or
 *      replace the reader's limit (replaces an automatic slow-down too).
 *      requireStaff("settings.write"), audited with the before / after row.
 */

export const dynamic = "force-dynamic";
const MAX_ROWS = 200;

export async function GET() {
  try {
    const gate = await requireStaff("read");
    if (!gate.ok) return gate.response;

    const service = await createServiceClient();
    const { data, error } = await service
      .from("library_user_limits")
      .select(LIMIT_SELECT)
      .order("set_at", { ascending: false })
      .limit(MAX_ROWS);
    if (error) {
      if (isMigrationMissing(error.code)) {
        return NextResponse.json({ data: [], migrationMissing: true, message: MONITOR_MIGRATION_MISSING_AR });
      }
      console.error("[admin/library-monitor/user-limits GET] query failed:", error.code);
      return NextResponse.json({ error: "تعذّر تحميل الحدود الخاصة." }, { status: 500 });
    }
    const rows = (data ?? []) as LimitRow[];
    const people = await peopleFor(rows.flatMap((r) => [r.user_id, r.set_by ?? ""]));
    const now = Date.now();
    return NextResponse.json(
      { data: rows.map((r) => toLimitDto(r, people, now)), migrationMissing: false },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (err) {
    console.error("[admin/library-monitor/user-limits GET] unexpected:", err instanceof Error ? err.name : "error");
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const gate = await requireStaff("settings.write");
    if (!gate.ok) return gate.response;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    }
    const parsed = parseUserLimitBody(body, Date.now());
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const input = parsed.value;

    let userId = input.userId;
    if (!userId && input.email) {
      const found = await userIdByEmail(input.email);
      if (!found.ok) return NextResponse.json({ error: found.error }, { status: found.status });
      userId = found.userId;
    }
    if (!userId) return NextResponse.json({ error: "اكتب بريد المستخدم أو معرّفه." }, { status: 400 });

    const service = await createServiceClient();
    const { data: beforeRow } = await service.from("library_user_limits").select(LIMIT_SELECT).eq("user_id", userId).maybeSingle();

    const { data, error } = await service
      .from("library_user_limits")
      .upsert(
        {
          user_id: userId,
          daily_docs: input.dailyDocs,
          hourly_docs: input.hourlyDocs,
          until: input.until,
          source: "admin",
          note: input.note,
          set_by: gate.userId,
          set_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      )
      .select(LIMIT_SELECT)
      .maybeSingle();
    if (error) {
      if (isMigrationMissing(error.code)) return NextResponse.json({ error: MONITOR_MIGRATION_MISSING_AR }, { status: 503 });
      console.error("[admin/library-monitor/user-limits POST] upsert failed:", error.code);
      return NextResponse.json({ error: "تعذّر حفظ الحد الخاص." }, { status: 500 });
    }
    const row = data as LimitRow | null;
    if (!row) return NextResponse.json({ error: "تعذّر حفظ الحد الخاص." }, { status: 500 });

    await logAdminAction({
      actorId: gate.userId,
      action: "library_user_limit_set",
      targetType: "library_user_limit",
      targetId: row.user_id,
      before: beforeRow ?? null,
      after: row,
    });

    const people = await peopleFor([row.user_id, gate.userId]);
    return NextResponse.json({ data: toLimitDto(row, people, Date.now()) }, { status: 201 });
  } catch (err) {
    console.error("[admin/library-monitor/user-limits POST] unexpected:", err instanceof Error ? err.name : "error");
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
