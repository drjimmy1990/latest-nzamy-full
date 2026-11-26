import { NextRequest, NextResponse } from "next/server";
import { readPhoneStatus } from "@/lib/phoneOtp/service";
import { NO_STORE, phoneOtpFailure, phoneOtpGate } from "@/lib/phoneOtp/routeGate";

/**
 * GET /api/v1/auth/phone-otp/status — the signed-in user's WhatsApp code
 * state (batch l15): { required, verified, masked, hasPhone, available,
 * sentBefore, lastSentAt, home }. Read by the register pages right after
 * sign-up and by /verify-phone. Never the number itself — the last four
 * digits only. Open to a held account (the proxy lets it through).
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const gate = await phoneOtpGate(request, "status", { perUser: 60, perIp: 240, windowMs: 10 * 60_000 });
  if (!gate.ok) return gate.response;
  try {
    return NextResponse.json(await readPhoneStatus(gate.svc, gate.user), { headers: NO_STORE });
  } catch (err) {
    return phoneOtpFailure("status", err);
  }
}
