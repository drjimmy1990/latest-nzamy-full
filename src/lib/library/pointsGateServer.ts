/**
 * pointsGateServer.ts — the reads behind the 50-point library gate (owner
 * register 14 item 48; the rule is ./pointsGate.ts). Service client; every
 * caller passes the id of the user it has already authenticated.
 *
 *   - readLibraryMinPoints(): platform_settings 'library_min_points_to_browse'
 *     ({"points": 50}). Read on every call (never memoised): an admin's change
 *     applies to the next request (G39). A missing row or a failed read → 50.
 *   - readLibraryPointsBalance(userId): points_balance(user) + the founder's
 *     library credits (membership_credits 'library_question', not ended,
 *     remaining × 5). null when the balance cannot be read — the gate then
 *     never locks (fail open). A missing credits table counts 0 credits.
 *
 * Works before 20261129_40 runs: the setting row missing reads as 50, and
 * points_balance / membership_credits are older (20261022_20 / 20261101_10).
 */
import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import {
  LIBRARY_MIN_POINTS_DEFAULT,
  LIBRARY_MIN_POINTS_SETTING,
  libraryCreditPoints,
  parseLibraryMinPoints,
} from "./pointsGate";

const MISSING = new Set(["42P01", "PGRST205", "42883", "PGRST202"]);

export async function readLibraryMinPoints(): Promise<number> {
  try {
    const service = await createServiceClient();
    const { data, error } = await service
      .from("platform_settings")
      .select("value")
      .eq("key", LIBRARY_MIN_POINTS_SETTING)
      .maybeSingle();
    if (error) {
      console.error("[library-points-gate] setting read failed:", error.code);
      return LIBRARY_MIN_POINTS_DEFAULT;
    }
    return parseLibraryMinPoints((data as { value?: unknown } | null)?.value);
  } catch (err) {
    console.error("[library-points-gate] setting read threw:", err instanceof Error ? err.name : "error");
    return LIBRARY_MIN_POINTS_DEFAULT;
  }
}

export async function readLibraryPointsBalance(userId: string): Promise<number | null> {
  try {
    const service = await createServiceClient();
    const [points, credits] = await Promise.all([
      service.rpc("points_balance", { p_user: userId }),
      service
        .from("membership_credits")
        .select("remaining")
        .eq("user_id", userId)
        .eq("kind", "library_question")
        .gt("remaining", 0)
        .gt("ends_at", new Date().toISOString()),
    ]);
    if (points.error || !Number.isSafeInteger(points.data)) {
      if (points.error) console.error("[library-points-gate] balance read failed:", points.error.code);
      return null;
    }
    let creditPoints = 0;
    if (credits.error) {
      if (!MISSING.has(credits.error.code ?? "")) {
        console.error("[library-points-gate] founder credits read failed:", credits.error.code);
        return null;
      }
    } else {
      creditPoints = libraryCreditPoints((credits.data ?? []) as Array<{ remaining?: unknown }>);
    }
    return (points.data as number) + creditPoints;
  } catch (err) {
    console.error("[library-points-gate] balance read threw:", err instanceof Error ? err.name : "error");
    return null;
  }
}
