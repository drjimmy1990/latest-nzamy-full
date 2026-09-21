import type { NextRequest } from "next/server";
import { answerInvitation } from "../../../_answer";

/**
 * POST /api/v1/me/invitations/{kind}/{id}/decline — the invited person says no.
 *
 * Sets `status = 'removed'` and leaves `accepted_at` null, through the
 * caller's OWN RLS-scoped client. `removed` rather than a DELETE for the same
 * reason the roster routes use it: the row stays, so the company keeps a
 * record and can re-invite later (`POST /api/v1/{business,firm}/members`).
 *
 *   200 `{ data: { id, kind, status: "removed" } }`
 *   401 / 403 / 404 / 500 — see `../accept/route.ts`.
 */
export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ kind: string; id: string }> },
) {
  return answerInvitation(context.params, "decline");
}
