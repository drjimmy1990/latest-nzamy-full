import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isAuthUnavailable, authUnavailableResponse, frozenAccountResponse } from "@/lib/auth/apiAuth";
import { cleanOtpInput } from "@/lib/lawyerSignup/otpCode";
import {
  deviceCodePepper,
  deviceCodeVerifyMessageAr,
  hashDeviceCode,
  type DeviceCodeVerifyState,
} from "@/lib/library/deviceLimit";
import { currentDeviceHash, currentSessionId, forgetLibraryDevices } from "@/lib/library/deviceLimitServer";

/**
 * POST /api/v1/library/devices/verify — check the e-mail code of THIS browser
 * (owner ٤٠; 20261127_60 library_device_code_verify). Body: { code }.
 *
 * Five attempts per code. On success the device is verified and becomes the
 * open one: every OTHER session of the account is ended (the library is
 * never open on two devices at once), this session stays. The user and the
 * device come from the session and the httpOnly cookie — the body carries
 * the code only.
 *
 *   200 { verified: true, sessionsEnded }
 *   400 { error } wrong / expired / too many / no code / not pending / full
 */
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };
const STATES: ReadonlySet<string> = new Set(["verified", "wrong", "expired", "too_many", "no_code", "not_pending", "full"]);

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (isAuthUnavailable(user, error)) return authUnavailableResponse();
    if (!user) return NextResponse.json({ error: "يرجى تسجيل الدخول" }, { status: 401, headers: NO_STORE });
    const frozen = frozenAccountResponse(user);
    if (frozen) return frozen;

    const body = (await request.json().catch(() => null)) as { code?: unknown } | null;
    const code = cleanOtpInput(body?.code);
    if (!code) {
      return NextResponse.json({ error: "أدخل الرمز المكوّن من ستة أرقام." }, { status: 400, headers: NO_STORE });
    }
    const pepper = deviceCodePepper(process.env);
    const hash = await currentDeviceHash();
    if (!pepper || !hash) {
      return NextResponse.json(
        { error: deviceCodeVerifyMessageAr("not_pending", null) },
        { status: 400, headers: NO_STORE },
      );
    }

    const service = await createServiceClient();
    const { data, error: rpcError } = await service.rpc("library_device_code_verify", {
      p_user: user.id,
      p_device_hash: hash,
      p_code_hash: hashDeviceCode(pepper, user.id, hash, code),
      p_session: await currentSessionId(),
    });
    if (rpcError) {
      console.error("[library devices verify] failed:", rpcError.code ?? "no-code");
      return NextResponse.json({ error: "تعذّر التحقق من الرمز الآن. حاول بعد قليل." }, { status: 503, headers: NO_STORE });
    }
    const answer = (data ?? {}) as { state?: string; attempts_left?: number; sessions_ended?: number };
    const state = (STATES.has(answer.state ?? "") ? answer.state : "not_pending") as DeviceCodeVerifyState;
    if (state !== "verified") {
      return NextResponse.json(
        {
          error: deviceCodeVerifyMessageAr(state, typeof answer.attempts_left === "number" ? answer.attempts_left : null),
          code: state,
        },
        { status: 400, headers: NO_STORE },
      );
    }
    forgetLibraryDevices(user.id);
    return NextResponse.json(
      { verified: true, sessionsEnded: typeof answer.sessions_ended === "number" ? answer.sessions_ended : 0 },
      { headers: NO_STORE },
    );
  } catch (err) {
    console.error("[library devices verify] unexpected:", err instanceof Error ? err.name : "error");
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500, headers: NO_STORE });
  }
}
