/**
 * trackingSnapshot.server.ts — SERVER ONLY (service role, node:crypto).
 *
 * The one read behind /track/[token] (N3.6). The token's shape is checked
 * before anything touches the database; the database is asked only for the
 * snapshot of the hashed token (public.case_tracking_snapshot, 20261025_32,
 * which also refuses revoked links and links whose maker no longer works on
 * the case); and the answer passes the whitelist serializer before the page
 * sees it. Unknown, revoked and malformed tokens are all the same "none"; a
 * database failure is "error", so a live link is never told it was revoked.
 */

import { createServiceClient } from "@/lib/supabase/server";
import { sha256Hex } from "@/lib/services/shareSecrets";
import { isTrackingToken, toTrackingView, type TrackingView } from "@/lib/tracking/trackingView";

export type TrackingRead = { state: "ok"; view: TrackingView } | { state: "none" } | { state: "error" };

export async function readTrackingView(token: string): Promise<TrackingRead> {
  if (!isTrackingToken(token)) return { state: "none" };
  try {
    const service = await createServiceClient();
    const { data, error } = await service.rpc("case_tracking_snapshot", { p_token_hash: sha256Hex(token) });
    if (error) {
      console.error("[track] snapshot failed:", error.message, error.code);
      return { state: "error" };
    }
    const view = toTrackingView(data);
    return view ? { state: "ok", view } : { state: "none" };
  } catch (err) {
    console.error("[track] snapshot threw:", err instanceof Error ? err.message : err);
    return { state: "error" };
  }
}
