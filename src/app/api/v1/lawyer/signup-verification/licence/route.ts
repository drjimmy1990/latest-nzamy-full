import { NextRequest, NextResponse } from "next/server";
import { evaluate, storeLicenceImage } from "@/lib/lawyerSignup/service";
import { MULTIPART_ALLOWANCE, NO_STORE, signupFailure, signupGate } from "@/lib/lawyerSignup/routeGate";
import { LICENCE_ERRORS, LICENCE_MAX_BYTES } from "@/lib/services/licenceUpload";

/**
 * POST /api/v1/lawyer/signup-verification/licence — the licence photo
 * (decision ٢٠: mandatory). multipart/form-data: `file` (JPG/PNG/WEBP/PDF,
 * ≤ 5 MB, checked by its first bytes) and optional `fullName` (the four-part
 * name as on the licence).
 *
 * The file goes through the server to the PRIVATE bucket lawyer-licences
 * (<uid>/…, service role). The AI pre-check runs when switched on
 * (LAWYER_LICENCE_AI=on + GEMINI_API_KEY): inline, nothing kept at the
 * provider. Answer: the new state (GET's shape). Never a path or a link.
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const gate = await signupGate(request, "licence", { perUser: 10, perIp: 20, windowMs: 60 * 60_000 });
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
      return NextResponse.json({ error: "تعذّرت قراءة الملف المرفوع. أعد المحاولة." }, { status: 400, headers: NO_STORE });
    }
    const file = form.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "لم يُرفق ملف. اختر صورة الترخيص أولاً." }, { status: 400, headers: NO_STORE });
    }
    const rawName = form.get("fullName");
    const fullName = typeof rawName === "string" && rawName.trim() !== "" ? rawName.trim().slice(0, 160) : null;
    // No shape check here: the form asks for four Arabic words (or the
    // registry's own spelling), and the database compares the name with the
    // registry — a name that does not match only holds the account.
    const stored = await storeLicenceImage(gate.svc, gate.user, file, "signup", fullName);
    if (!stored.ok) return NextResponse.json({ error: stored.error }, { status: stored.status, headers: NO_STORE });
    return NextResponse.json(await evaluate(gate.svc, gate.user, { fullName }), { headers: NO_STORE });
  } catch (err) {
    return signupFailure("licence POST", err);
  }
}
