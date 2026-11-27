/**
 * grantPointsTopupServer.ts — LIVE-10 (batch l19): the call behind an admin
 * library grant's points top-up (the rule and the wording: ./grantPointsTopup.ts;
 * the SQL: 20261209_50 library_grant_points_topup). Service client; the
 * caller is an admin route that has already granted the library.
 *
 * Never throws and never fails the grant: a missing function (the SQL not run
 * yet) or any error answers a status the route records, and the grant stands.
 */
import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { grantTopupFunctionMissing, parseGrantPointsTopup, type GrantPointsTopup } from "./grantPointsTopup";

export async function topUpLibraryGrantPoints(grantId: string | null | undefined): Promise<GrantPointsTopup> {
  if (typeof grantId !== "string" || grantId.length === 0) return { status: "skipped", points: 0, minPoints: null };
  try {
    const service = await createServiceClient();
    const { data, error } = await service.rpc("library_grant_points_topup", { p_grant: grantId });
    if (error) {
      if (grantTopupFunctionMissing(error.code)) return { status: "not_installed", points: 0, minPoints: null };
      console.error("[library grant top-up] failed:", error.code ?? "no-code");
      return { status: "failed", points: 0, minPoints: null };
    }
    const topup = parseGrantPointsTopup(data);
    if (topup.status === "failed") console.error("[library grant top-up] unexpected answer");
    return topup;
  } catch (err) {
    console.error("[library grant top-up] threw:", err instanceof Error ? err.name : "error");
    return { status: "failed", points: 0, minPoints: null };
  }
}
