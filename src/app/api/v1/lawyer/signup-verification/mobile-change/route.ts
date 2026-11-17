import { NextRequest, NextResponse } from "next/server";
import { evaluate, recordMobileChange, storeLicenceImage } from "@/lib/lawyerSignup/service";
import { MULTIPART_ALLOWANCE, NO_STORE, signupFailure, signupGate } from "@/lib/lawyerSignup/routeGate";
import { LICENCE_ERRORS, LICENCE_MAX_BYTES } from "@/lib/services/licenceUpload";
import { normalizeSaudiMobile, saudiMobileMessage } from "@/lib/services/saudiMobile";

/**
 * POST /api/v1/lawyer/signup-verification/mobile-change — «رقمي تغيّر»
 * (decision ٢١). multipart: `mobile` (his new Saudi mobile) + `file` (the
 * licence photo). The photo gets the AI pre-check, then the account goes to a
 * HUMAN: no code is ever sent to the new number as proof of identity. The new
 * number is stored for the admin (server-only column), never echoed back.
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const gate = await signupGate(request, "mobile-change", { perUser: 5, perIp: 10, windowMs: 60 * 60_000 });
  if (!gate.ok) return gate.response;
  try {
    const rawLength = (request.headers.get("content-length") ?? "").trim();
    if (!/^\d+$/.test(rawLength)) {
      return NextResponse.json({ error: "تعذّر قبول الملف — أعد المحاولة" }, { status: 411, headers: NO_STORE });
    }
    if (Number(rawLength) > LICENCE_MAX_BYTES + MULTIPART_ALLOWANCE) {
      return NextResponse.json({ error: LICENCE_ERRORS.tooLarge }, { status: 413, headers: NO_STORE });
    }
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: "تعذّرت قراءة البيانات. أعد المحاولة." }, { status: 400, headers: NO_STORE });
    }
    const mobile = normalizeSaudiMobile(form.get("mobile"));
    if (!mobile.ok) return NextResponse.json({ error: saudiMobileMessage(mobile) }, { status: 400, headers: NO_STORE });
    const file = form.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "أرفق صورة الترخيص." }, { status: 400, headers: NO_STORE });
    }
    const stored = await storeLicenceImage(gate.svc, gate.user, file, "mobile_change", null);
    if (!stored.ok) return NextResponse.json({ error: stored.error }, { status: stored.status, headers: NO_STORE });
    await recordMobileChange(gate.svc, gate.user, mobile.e164);
    return NextResponse.json(await evaluate(gate.svc, gate.user), { headers: NO_STORE });
  } catch (err) {
    return signupFailure("mobile-change", err);
  }
}
