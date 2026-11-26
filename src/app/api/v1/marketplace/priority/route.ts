import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requireApiUser } from "@/lib/auth/apiAuth";
import {
  PRIORITY_MINUTES_KEY,
  WORKING_HOURS_KEY,
  parsePriorityMinutes,
  parseWorkingHours,
} from "@/lib/marketplace/marketPriority";

/**
 * GET /api/v1/marketplace/priority — what the client's request form discloses
 * about «نافذة أولوية نظامي» (owner س٢٣, batch l16): { minutes, workingHours,
 * installed }. Signed-in callers only; only these two settings are read (with
 * the service client, keyed — nothing else of platform_settings).
 * Before 20261206_40 runs: installed false and minutes 0, so the form
 * discloses nothing that is not applied.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const supabase = await createClient();
    const auth = await requireApiUser(supabase, { error: "سجّل الدخول أولاً" });
    if (auth instanceof NextResponse) return auth;
    const admin = await createServiceClient();
    const { data, error } = await admin.from("platform_settings").select("key, value").in("key", [PRIORITY_MINUTES_KEY, WORKING_HOURS_KEY]);
    if (error) {
      console.error("[marketplace/priority GET] read failed:", error.code);
      return NextResponse.json({ minutes: 0, workingHours: parseWorkingHours(null), installed: false }, { headers: NO_STORE });
    }
    const rows = (data ?? []) as Array<{ key?: string; value?: unknown }>;
    const minutes = rows.find((r) => r.key === PRIORITY_MINUTES_KEY);
    const hours = rows.find((r) => r.key === WORKING_HOURS_KEY);
    const installed = Boolean(minutes && hours);
    return NextResponse.json(
      {
        minutes: installed ? parsePriorityMinutes(minutes?.value) : 0,
        workingHours: parseWorkingHours(hours?.value),
        installed,
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    console.error("[marketplace/priority GET] threw:", err instanceof Error ? err.name : "error");
    return NextResponse.json({ minutes: 0, workingHours: parseWorkingHours(null), installed: false }, { headers: NO_STORE });
  }
}
