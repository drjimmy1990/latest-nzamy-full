import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/v1/share/[token]/verify — Server-side passcode verification for a
 * secure document share link. Fixes the client-only "any 6 digits" hole: the
 * passcode is compared against the stored value on the server (service-role,
 * since document_shares has no public select policy).
 *
 * Responses:
 *   404 { error } — no share row for this token
 *   410 { error } — link has expired
 *   401 { error } — passcode mismatch
 *   200 { success: true, data: { title, document_id } } — verified (or the
 *        stored passcode is null → open link)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;

    let passcode = "";
    try {
      const body = await request.json();
      if (body && typeof body.passcode === "string") {
        passcode = body.passcode;
      }
    } catch {
      // No / invalid JSON body — treat as empty passcode.
    }

    const supabase = await createServiceClient();
    const { data: share, error } = await supabase
      .from("document_shares")
      .select("token, document_id, title, passcode, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (error) {
      console.error("[share verify POST] Supabase error:", error.message, error.code);
      return NextResponse.json({ error: "تعذر التحقق من الرابط" }, { status: 404 });
    }

    if (!share) {
      return NextResponse.json({ error: "الرابط غير موجود" }, { status: 404 });
    }

    // Expiry check.
    if (share.expires_at) {
      const expiresAt = new Date(share.expires_at as string).getTime();
      if (!Number.isNaN(expiresAt) && expiresAt < Date.now()) {
        return NextResponse.json({ error: "انتهت صلاحية هذا الرابط" }, { status: 410 });
      }
    }

    // Passcode check. A null stored passcode means the link is open.
    const storedPasscode = share.passcode;
    if (storedPasscode != null && storedPasscode !== "") {
      if (passcode !== storedPasscode) {
        return NextResponse.json(
          { error: "الرجاء إدخال باسكود صحيح مكون من 6 أرقام" },
          { status: 401 },
        );
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        title: share.title ?? null,
        document_id: share.document_id ?? null,
      },
    });
  } catch (err) {
    console.error("[share verify POST] Unexpected error:", err);
    return NextResponse.json({ error: "تعذر التحقق من الرابط" }, { status: 500 });
  }
}
