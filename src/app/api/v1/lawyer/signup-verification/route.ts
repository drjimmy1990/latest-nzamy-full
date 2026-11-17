import { NextRequest, NextResponse } from "next/server";
import { evaluate } from "@/lib/lawyerSignup/service";
import { NO_STORE, signupFailure, signupGate } from "@/lib/lawyerSignup/routeGate";

/**
 * GET /api/v1/lawyer/signup-verification — the signed-in lawyer's own
 * verification state (owner decisions ٢٠–٢١; migration 20261124_70).
 *
 * Re-checks the registry for the licence on his file, records the decision,
 * and — only with LAWYER_INSTANT_APPROVAL=on and every condition met —
 * approves him. The answer never carries the registry mobile (last two digits
 * only), a code, or the reasons (those are for the admin queue).
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const gate = await signupGate(request, "state", { perUser: 60, perIp: 120, windowMs: 10 * 60_000 });
  if (!gate.ok) return gate.response;
  try {
    return NextResponse.json(await evaluate(gate.svc, gate.user), { headers: NO_STORE });
  } catch (err) {
    return signupFailure("GET", err);
  }
}
