import { NextResponse } from "next/server";
import { assertCaseWorker } from "@/lib/auth/assertCaseWorker";
import { resolveDisplayNames } from "../../tasks/_assignees";
import { readCallerHearingFirmId, readHearingAssignableIds } from "../_shared";

/**
 * GET /api/v1/lawyer/hearings/assignees — the «المحامي المُكلَّف بالجلسة»
 * picker's options (owner N01-18).
 *
 * Response: `{ data: [{ userId, name, isSelf }], firm: boolean }`, the caller
 * first. A solo lawyer gets only himself and `firm: false` (the form then
 * hides the picker). A firm member gets every ACTIVE member of his firm in a
 * pleading role (HEARING_ASSIGNABLE_ROLES).
 *
 * Display only: POST/PATCH /api/v1/lawyer/hearings re-read the same roster
 * through the same helper (parseHearingAssignee) and refuse anyone else.
 */
export async function GET() {
  try {
    const auth = await assertCaseWorker();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const firmId = await readCallerHearingFirmId(supabase, user.id);
    const memberIds = await readHearingAssignableIds(supabase, firmId);
    const ids = [user.id, ...memberIds.filter((id) => id !== user.id)];
    const names = await resolveDisplayNames(ids);

    const data = ids.map((id) => ({ userId: id, name: names[id] ?? null, isSelf: id === user.id }));
    return NextResponse.json({ data, firm: firmId !== null });
  } catch (err) {
    console.error("[lawyer/hearings/assignees GET] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
