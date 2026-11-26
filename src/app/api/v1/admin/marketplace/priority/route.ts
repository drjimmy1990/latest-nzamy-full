import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/access-control";
import { logAdminAction } from "@/lib/auth/adminAudit";
import {
  PRIORITY_MINUTES_KEY,
  PRIORITY_SQL_MISSING_AR,
  WORKING_HOURS_KEY,
  parsePriorityMinutes,
  parseWorkingHours,
  readPriorityPatch,
  type PriorityMinutes,
  type WorkingHours,
} from "@/lib/marketplace/marketPriority";

/**
 * GET   /api/v1/admin/marketplace/priority — «نافذة أولوية نظامي» (owner س٢٣,
 *       batch l16): the minutes (0 / 15 / 30 / 60) and the working hours they
 *       are counted in (orders.manage).
 * PATCH same — { minutes?, workingHours?: { days, start, end } } (settings.write,
 *       one audit row).
 *
 * A new value applies to requests created from then on: each request's
 * release moment is stamped when it is created (20261206_40). Both rows are
 * created by that file — before it runs the route says so (409), because an
 * UPDATE of a missing row would change nothing and look saved.
 */

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;

interface PriorityRead {
  minutes: PriorityMinutes;
  workingHours: WorkingHours;
  installed: boolean;
}

async function readPriority(admin: ServiceClient): Promise<PriorityRead> {
  const { data, error } = await admin.from("platform_settings").select("key, value").in("key", [PRIORITY_MINUTES_KEY, WORKING_HOURS_KEY]);
  if (error) throw new Error(`priority read failed: ${error.code ?? "no-code"}`);
  const rows = (data ?? []) as Array<{ key?: string; value?: unknown }>;
  const minutes = rows.find((r) => r.key === PRIORITY_MINUTES_KEY);
  const hours = rows.find((r) => r.key === WORKING_HOURS_KEY);
  return {
    minutes: parsePriorityMinutes(minutes?.value),
    workingHours: parseWorkingHours(hours?.value),
    installed: Boolean(minutes && hours),
  };
}

export async function GET() {
  const gate = await requireStaff("orders.manage");
  if (!gate.ok) return gate.response;
  try {
    const admin = await createServiceClient();
    return NextResponse.json({ data: await readPriority(admin) });
  } catch (err) {
    console.error("[admin/marketplace/priority GET]", err instanceof Error ? err.message : "error");
    return NextResponse.json({ error: "تعذّر تحميل إعداد الأولوية." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const gate = await requireStaff("settings.write");
    if (!gate.ok) return gate.response;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    }
    const parsed = readPriorityPatch(body);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const admin = await createServiceClient();
    const before = await readPriority(admin);
    if (!before.installed) return NextResponse.json({ error: PRIORITY_SQL_MISSING_AR }, { status: 409 });

    const nowIso = new Date().toISOString();
    const writes: Array<[string, unknown]> = [];
    if (parsed.patch.minutes !== undefined) writes.push([PRIORITY_MINUTES_KEY, parsed.patch.minutes]);
    if (parsed.patch.workingHours !== undefined) writes.push([WORKING_HOURS_KEY, parsed.patch.workingHours]);
    for (const [key, value] of writes) {
      const { error } = await admin.from("platform_settings").update({ value, updated_by: gate.userId, updated_at: nowIso }).eq("key", key);
      if (error) {
        console.error("[admin/marketplace/priority PATCH] write failed:", key, error.code);
        return NextResponse.json({ error: "تعذّر حفظ الإعداد" }, { status: 500 });
      }
    }

    const after = await readPriority(admin);
    await logAdminAction({
      actorId: gate.userId,
      action: "marketplace_priority_set",
      targetType: "platform_setting",
      targetId: PRIORITY_MINUTES_KEY,
      before: { minutes: before.minutes, workingHours: before.workingHours },
      after: { minutes: after.minutes, workingHours: after.workingHours },
    });
    return NextResponse.json({ data: after });
  } catch (err) {
    console.error("[admin/marketplace/priority PATCH]", err instanceof Error ? err.message : "error");
    return NextResponse.json({ error: "تعذّر حفظ الإعداد" }, { status: 500 });
  }
}
