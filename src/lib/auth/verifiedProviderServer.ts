import "server-only";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifiedProviderDecision, type VerifiedProviderFacts } from "./verifiedProvider";
import { readVerifiedProviderFacts } from "./verifiedProviderRead";

/**
 * R9b / F11 (batch l11-sec): the server half of verifiedProvider.ts. Reads the
 * caller's verification facts with the service client (keyed by the id the
 * session's auth check verified) and returns null to go on, or the refusal to
 * return as it is. Call it right after the route's role check, before any write.
 * The reads themselves are verifiedProviderRead.ts (batch l16: the AI run path
 * shares them).
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
    return await readVerifiedProviderFacts(await createServiceClient(), userId, userType);
  } catch (err) {
    console.error("[verifiedProvider] read threw:", err instanceof Error ? err.name : "error");
    return null;
  }
}
