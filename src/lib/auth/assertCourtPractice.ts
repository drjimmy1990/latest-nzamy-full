import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isPlatformAdmin } from "@/lib/access-control";
import { CONSULTANT_BLOCKED_MESSAGE } from "@/lib/auth/practiceKind";
import { courtPracticeDecision, practiceKindFromRead } from "@/lib/auth/courtPracticeDecision";

/**
 * assertCourtPractice — Art. 18 of نظام المحاماة on the server: a legal
 * consultant (مستشار قانوني) does not plead or manage hearings, so the write
 * handlers of the court APIs (hearings, case stages, deadlines) refuse him.
 * Reads stay open; the pages are locked separately.
 *
 * Call it in a write handler after the auth check and before the body is
 * parsed or anything is written:
 *
 *   const refused = await assertCourtPractice(supabase, user.id);
 *   if (refused) return refused;
 *
 * Returns a 403 `{ error: CONSULTANT_BLOCKED_MESSAGE }` for a consultant who
 * is not a platform admin, and `null` for everyone else.
 *
 * Reads `lawyer_profiles.practice_kind` through the route's own request
 * client: authenticated holds a column grant on `user_id` and `practice_kind`
 * (20261016_10, 20261019_20) and the "lawyers read own profile" policy admits
 * the caller's own row whatever its verification status, so no service-role
 * read is needed. The admin check (a service-role read inside
 * isPlatformAdmin) runs only when the row says consultant.
 *
 * Fails open to "advocate" on a missing column (before 20261019_20 runs —
 * logged once), a missing row (firm accounts have none) and any other read
 * error, so the column can never lock real lawyers out. See
 * courtPracticeDecision.ts.
 */

let loggedMissingColumn = false;

export async function assertCourtPractice(supabase: SupabaseClient, userId: string): Promise<NextResponse | null> {
  let result: unknown;
  try {
    result = await supabase.from("lawyer_profiles").select("practice_kind").eq("user_id", userId).maybeSingle();
  } catch (err) {
    console.error("[assertCourtPractice] practice_kind read threw; treating as advocate:", err instanceof Error ? err.message : err);
    return null;
  }

  const read = practiceKindFromRead(result);
  if (read.missingColumn) {
    if (!loggedMissingColumn) {
      loggedMissingColumn = true;
      console.warn("[assertCourtPractice] lawyer_profiles.practice_kind is missing (run 20261019_20); every lawyer is treated as an advocate");
    }
  } else if (read.readFailed) {
    const error = (result as { error?: { code?: string; message?: string } }).error;
    console.error("[assertCourtPractice] practice_kind read failed; treating as advocate:", error?.code, error?.message);
  }

  if (read.practiceKind !== "consultant") return null;

  const isAdmin = await isPlatformAdmin(userId);
  if (courtPracticeDecision({ practiceKind: read.practiceKind, isAdmin }) === "allow") return null;
  return NextResponse.json({ error: CONSULTANT_BLOCKED_MESSAGE }, { status: 403 });
}
