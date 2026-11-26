import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isValidAttachmentId } from "../../_shared";
import { isAuthUnavailable, authUnavailableResponse, frozenAccountResponse } from "@/lib/auth/apiAuth";

const MAX_REASON_LEN = 500;

/**
 * POST /api/v1/documents/[id]/hold-lift-request — «طلب رفع الحجز».
 * Body: { reason?: string (≤500 chars) }
 *
 * Owner decision س٢٠٣: the other party of a request cannot lift a hold on a
 * file that is not his; he asks. public.request_attachment_hold_lift()
 * (migration 20261206_11, SECURITY DEFINER) checks that the caller is a party
 * of the file's request, is not its owner and that the file is on hold, then
 * records the request, notifies the file's owner and the administration and
 * writes an admin audit row. It never changes the file. A second request by
 * the same person for the same file within 24 hours returns the first one.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (isAuthUnavailable(user, authError)) return authUnavailableResponse();
    if (!user) {
      return NextResponse.json({ error: "غير مصرح — يرجى تسجيل الدخول" }, { status: 401 });
    }
    const frozen = frozenAccountResponse(user);
    if (frozen) return frozen;

    const { id } = await params;
    if (!isValidAttachmentId(id)) {
      return NextResponse.json({ error: "معرف المستند غير صالح" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const rawReason = (body as { reason?: unknown } | null)?.reason;
    if (rawReason !== undefined && rawReason !== null
        && (typeof rawReason !== "string" || rawReason.length > MAX_REASON_LEN)) {
      return NextResponse.json(
        { error: `سبب الطلب غير صالح (بحد أقصى ${MAX_REASON_LEN} حرف).` },
        { status: 400 },
      );
    }

    const { data, error } = await supabase.rpc("request_attachment_hold_lift", {
      p_id: Number(id),
      p_reason: typeof rawReason === "string" ? rawReason : null,
    });

    if (error) {
      if (error.code === "P0002") {
        return NextResponse.json({ error: "المستند غير موجود" }, { status: 404 });
      }
      if (error.code === "22023") {
        const own = /owner lifts/.test(error.message ?? "");
        return NextResponse.json(
          { error: own ? "هذا ملفك، ويمكنك رفع الحجز عنه بنفسك." : "الملف ليس محجوزاً." },
          { status: 409 },
        );
      }
      if (error.code === "42501") {
        return NextResponse.json({ error: "غير مصرح — يرجى تسجيل الدخول" }, { status: 401 });
      }
      console.error("[documents hold-lift-request] rpc failed:", id, error.message, error.code);
      return NextResponse.json({ error: "تعذّر إرسال الطلب، حاول مرة أخرى." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, requestId: data });
  } catch (err) {
    console.error("[documents hold-lift-request] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر إرسال الطلب، حاول مرة أخرى." }, { status: 500 });
  }
}
