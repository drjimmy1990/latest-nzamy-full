import { NextResponse } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { readActiveFirmMemberIds, readCallerFirmId, resolveDisplayNames } from "../_assignees";

/**
 * GET /api/v1/lawyer/tasks/assignees — the «المحامي المُكلَّف» picker's
 * options (owner item 59).
 *
 * Response: `{ data: [{ userId, name, isSelf }] }`, the caller first.
 *   - A solo lawyer (no active firm membership) gets only themself, and the
 *     forms hide the picker: there is nobody else to choose.
 *   - A firm member gets every ACTIVE member of their firm.
 *
 * This list is for display only. POST/PATCH /api/v1/lawyer/tasks re-read the
 * same roster through the same helpers (./_assignees) and refuse anyone else
 * with 400 «المحامي المُكلَّف غير صالح», whatever a client sends. `name` is
 * null when a member has no display name; the form labels them itself rather
 * than printing an id.
 */
export async function GET() {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const firmId = await readCallerFirmId(supabase, user.id);
    const memberIds = await readActiveFirmMemberIds(supabase, firmId);
    const ids = [user.id, ...memberIds.filter((id) => id !== user.id)];
    const names = await resolveDisplayNames(ids);

    const data = ids.map((id) => ({ userId: id, name: names[id] ?? null, isSelf: id === user.id }));
    return NextResponse.json({ data });
  } catch (err) {
    console.error("[lawyer/tasks/assignees GET] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
