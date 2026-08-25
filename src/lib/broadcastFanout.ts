/**
 * broadcastFanout.ts — deliver an admin broadcast as real in-app notifications.
 * ─────────────────────────────────────────────────────────────────────────
 * Called after a broadcast row is written with status 'sent' (either created
 * that way, or PATCHed into it). Queries `profiles` for the matching
 * audience and writes one `notifications` row per recipient via
 * recordNotification (service-role, best-effort, never throws — see
 * src/lib/notify.ts).
 *
 * audience → profiles.user_type: the admin broadcasts UI audience values are
 * currently the SAME strings as profiles.user_type (see
 * supabase/migrations/20260603_phase1_001_profiles.sql), except 'all' which
 * means "every user" rather than a user_type filter. Kept as an explicit map
 * (rather than passing audience straight into .eq()) so a future audience
 * value that does NOT match a user_type 1:1 can be redirected here without
 * touching the two call sites.
 */
import { createServiceClient } from "@/lib/supabase/server";
import { recordNotification } from "@/lib/notify";

const AUDIENCE_TO_USER_TYPE: Record<string, string> = {
  individual: "individual",
  lawyer: "lawyer",
  government: "government",
  ngo: "ngo",
  corporate: "corporate",
};

// Sequential chunking keeps concurrent inserts bounded (matches the pattern
// asked for in the fix spec) rather than firing thousands of inserts at once.
const CHUNK_SIZE = 50;

export interface BroadcastFanoutInput {
  id: string;
  title: string;
  body?: string | null;
  audience?: string | null;
}

/**
 * Best-effort: never throws. Call this AFTER the broadcast DB write that
 * marks it 'sent' has already succeeded — a fan-out failure must never fail
 * the admin's create/send request.
 */
export async function fanOutBroadcast(broadcast: BroadcastFanoutInput): Promise<void> {
  try {
    const admin = await createServiceClient();
    const audience = broadcast.audience || "all";

    let query = admin.from("profiles").select("id");
    if (audience !== "all") {
      const userType = AUDIENCE_TO_USER_TYPE[audience];
      if (!userType) {
        console.error(`[broadcastFanout] unknown audience "${audience}" — skipping fan-out`);
        return;
      }
      query = query.eq("user_type", userType);
    }

    const { data: profiles, error } = await query;
    if (error) {
      console.error("[broadcastFanout] profiles lookup failed:", error.message);
      return;
    }

    const ids = (profiles ?? []).map((p) => p.id as string).filter(Boolean);

    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
      const chunk = ids.slice(i, i + CHUNK_SIZE);
      await Promise.all(
        chunk.map((userId) =>
          recordNotification({
            userId,
            title: broadcast.title,
            body: broadcast.body ?? undefined,
            href: "/notifications",
          }),
        ),
      );
    }
  } catch (e) {
    // Notifications are non-critical — log and swallow (mirrors notify.ts).
    console.error("[broadcastFanout] unexpected error:", e);
  }
}
