import type { NextRequest } from "next/server";
import { answerInvitation } from "../../../_answer";

/**
 * POST /api/v1/me/invitations/{kind}/{id}/accept — the invited person joins.
 *
 * `{kind}` is `business` or `firm`; `{id}` is the `*_members` row id the
 * listing at `GET /api/v1/me/invitations` returned. Sets `status = 'active'`
 * and stamps `accepted_at`, through the caller's OWN RLS-scoped client — see
 * `../../../_answer.ts` for why there is no service client here and what the
 * database refuses on its own.
 *
 *   200 `{ data: { id, kind, status: "active" } }`
 *   401  not signed in
 *   403  RLS refused (42501)
 *   404  no invitation with that id is waiting for this caller's answer
 *   500  the write failed
 */
export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ kind: string; id: string }> },
) {
  return answerInvitation(context.params, "accept");
}
