import "server-only";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifiedProviderDecision, type VerifiedProviderFacts } from "./verifiedProvider";

/**
 * R9b / F11 (batch l11-sec): the server half of verifiedProvider.ts. Reads the
 * caller's verification facts with the service client (keyed by the id the
 * session's auth check verified) and returns null to go on, or the refusal to
 * return as it is. Call it right after the route's role check, before any write.
 */
export async function requireVerifiedProvider(userId: string, userType: string): Promise<NextResponse | null> {
  const decision = verifiedProviderDecision(await readFacts(userId, userType));
  if (decision.ok) return null;
  return NextResponse.json(
    decision.code ? { error: decision.error, code: decision.code } : { error: decision.error },
    { status: decision.status, headers: { "Cache-Control": "private, no-store" } },
  );
}

async function readFacts(userId: string, userType: string): Promise<VerifiedProviderFacts | null> {
  if (userType === "admin") return { userType, lawyerStatus: null, ownedFirmStatuses: [], memberFirmStatuses: [] };
  try {
    const svc = await createServiceClient();
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
