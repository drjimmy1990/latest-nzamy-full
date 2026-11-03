import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/access-control";
import { createServiceClient } from "@/lib/supabase/server";
import { isMigrationMissing } from "@/lib/library/securityLockAdmin";
import {
  MONITOR_MIGRATION_MISSING_AR,
  activitySince,
  num,
  type TopRow,
} from "@/lib/library/monitorAdmin";
import { peopleFor } from "@/lib/library/monitorAdminServer";

/**
 * «نشاط المكتبة» — the top library readers (public.library_activity_top,
 * 20261031_10), today (since Riyadh midnight) or over the last 7 days, with
 * each reader's open review flag, open library lock and own limit, so the
 * panel can act on a row. Any admin (requireStaff("read")).
 *
 * GET ?range=today|week
 */

export const dynamic = "force-dynamic";
const TOP = 50;

export async function GET(request: NextRequest) {
  try {
    const gate = await requireStaff("read");
    if (!gate.ok) return gate.response;

    const { range, since } = activitySince(new URL(request.url).searchParams.get("range"), Date.now());
    const service = await createServiceClient();
    const { data, error } = await service.rpc("library_activity_top", { p_since: since, p_limit: TOP });
    if (error) {
      if (isMigrationMissing(error.code)) {
        return NextResponse.json({ range, since, data: [], migrationMissing: true, message: MONITOR_MIGRATION_MISSING_AR });
      }
      console.error("[admin/library-monitor/activity GET] top failed:", error.code);
      return NextResponse.json({ error: "تعذّر تحميل النشاط." }, { status: 500 });
    }
    const rows = (Array.isArray(data) ? data : []) as TopRow[];
    const ids = rows.map((r) => r.user_id);

    const [people, flags, locks, limits] = await Promise.all([
      peopleFor(ids),
      ids.length
        ? service.from("library_review_flags").select("user_id, reference").in("user_id", ids).is("cleared_at", null)
        : Promise.resolve({ data: [], error: null }),
      ids.length
        ? service.from("library_security_locks").select("user_id, reference").in("user_id", ids).is("lifted_at", null)
        : Promise.resolve({ data: [], error: null }),
      ids.length
        ? service.from("library_user_limits").select("user_id, daily_docs, hourly_docs, until, source").in("user_id", ids)
        : Promise.resolve({ data: [], error: null }),
    ]);
    const byUser = <T extends { user_id: string }>(res: { data: unknown }) =>
      new Map(((res.data ?? []) as T[]).map((r) => [r.user_id, r]));
    const flagOf = byUser<{ user_id: string; reference: string }>(flags);
    const lockOf = byUser<{ user_id: string; reference: string }>(locks);
    const limitOf = byUser<{ user_id: string; daily_docs: number | null; hourly_docs: number | null; until: string | null; source: string }>(limits);
    const now = Date.now();

    return NextResponse.json(
      {
        range,
        since,
        migrationMissing: false,
        data: rows.map((r) => {
          const person = people.get(r.user_id);
          const limit = limitOf.get(r.user_id);
          const limitActive = !!limit && (limit.until === null || Date.parse(limit.until) > now);
          return {
            userId: r.user_id,
            user: { name: person?.name ?? null, email: person?.email ?? null },
            userType: person?.userType ?? null,
            requests: num(r.requests),
            docs: num(r.docs),
            searches: num(r.searches),
            aiCalls: num(r.ai_calls),
            activeHours: num(r.active_hours),
            lastHour: r.last_hour,
            flagReference: flagOf.get(r.user_id)?.reference ?? null,
            lockReference: lockOf.get(r.user_id)?.reference ?? null,
            limit: limitActive
              ? { dailyDocs: limit!.daily_docs, hourlyDocs: limit!.hourly_docs, until: limit!.until, source: limit!.source }
              : null,
          };
        }),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (err) {
    console.error("[admin/library-monitor/activity GET] unexpected:", err instanceof Error ? err.name : "error");
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
