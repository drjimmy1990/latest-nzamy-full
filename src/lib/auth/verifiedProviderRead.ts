/**
 * verifiedProviderRead.ts — the reads behind verifiedProvider.ts, on a client
 * the caller hands in (the service client, keyed by the id the session's auth
 * check verified). Split out of verifiedProviderServer.ts (batch l16, owner
 * س٢١٤) so the AI run path (runCore.ts, toolStatus.ts) can ask the same
 * question under `node --test`: no `server-only`, relative imports only.
 *
 * Any failed read answers null, which verifiedProviderDecision turns into a
 * 503 — fail closed.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { VerifiedProviderFacts } from "./verifiedProvider.ts";

export async function readVerifiedProviderFacts(
  svc: SupabaseClient,
  userId: string,
  userType: string,
): Promise<VerifiedProviderFacts | null> {
  if (userType === "admin") return { userType, lawyerStatus: null, ownedFirmStatuses: [], memberFirmStatuses: [] };
  try {
    const [lawyer, owned, members] = await Promise.all([
      svc.from("lawyer_profiles").select("verification_status").eq("user_id", userId).maybeSingle(),
      svc.from("firm_profiles").select("verification_status").eq("owner_user_id", userId),
      svc.from("firm_members").select("firm_id").eq("user_id", userId).eq("status", "active"),
    ]);
    if (lawyer.error || owned.error || members.error) {
      const e = lawyer.error ?? owned.error ?? members.error;
      console.error("[verifiedProvider] read failed:", e?.code ?? "no-code");
      return null;
    }
    const firmIds = ((members.data ?? []) as Array<{ firm_id: string | null }>)
      .map((m) => m.firm_id)
      .filter((id): id is string => typeof id === "string");
    let memberFirmStatuses: (string | null)[] = [];
    if (firmIds.length > 0) {
      const firms = await svc.from("firm_profiles").select("verification_status").in("id", firmIds);
      if (firms.error) {
        console.error("[verifiedProvider] member firm read failed:", firms.error.code ?? "no-code");
        return null;
      }
      memberFirmStatuses = ((firms.data ?? []) as Array<{ verification_status: string | null }>).map((f) => f.verification_status);
    }
    return {
      userType,
      lawyerStatus: (lawyer.data as { verification_status?: string | null } | null)?.verification_status ?? null,
      ownedFirmStatuses: ((owned.data ?? []) as Array<{ verification_status: string | null }>).map((f) => f.verification_status),
      memberFirmStatuses,
    };
  } catch (err) {
    console.error("[verifiedProvider] read threw:", err instanceof Error ? err.name : "error");
    return null;
  }
}
