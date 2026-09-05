import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { sha256Hex } from "@/lib/services/shareSecrets";

/**
 * POST /api/v1/share/[token]/verify — owner item 174. Looked up by
 * `token_hash` (never by the plaintext `token` column — that column is no
 * longer written for new shares) and compares the submitted passcode's hash
 * against `passcode_hash` in constant time. Service-role throughout:
 * document_shares has no public select policy, on purpose — passcode
 * verification must not be doable by a plain RLS-scoped read.
 *
 * On success this mints a 300-second signed URL for the shared storage
 * object and returns it — the caller (src/app/share/[token]/page.tsx) opens
 * that URL directly rather than being handed a document_id to fetch itself,
 * since an anonymous share-link visitor has no RLS session to fetch with.
 *
 * Responses:
 *   404 { error } — no share row for this token, or its document was never
 *        attached to a storage object
 *   410 { error } — link has expired
 *   401 { error } — passcode mismatch
 *   500 { error } — the storage sign step itself failed
 *   200 { success: true, data: { title, url } } — verified (or the stored
 *        passcode_hash is null → open link)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    if (typeof token !== "string" || token.trim().length === 0) {
      return NextResponse.json({ error: "الرابط غير موجود" }, { status: 404 });
    }

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
      .select("document_path, title, passcode_hash, expires_at")
      .eq("token_hash", sha256Hex(token))
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

    // Passcode check. A null stored hash means the link is open. Both sides
    // of the compare are our own sha256Hex() output (64 lowercase hex chars)
    // so the lengths always match once we reach timingSafeEqual — the length
    // guard is still there because timingSafeEqual THROWS on a length
    // mismatch instead of returning false.
    const storedHash = share.passcode_hash as string | null;
    if (storedHash) {
      const submittedHash = Buffer.from(sha256Hex(passcode), "utf8");
      const stored = Buffer.from(storedHash, "utf8");
      const matches = submittedHash.length === stored.length && timingSafeEqual(submittedHash, stored);
      if (!matches) {
        return NextResponse.json(
          { error: "الرجاء إدخال باسكود صحيح مكون من 6 أرقام" },
          { status: 401 },
        );
      }
    }

    const documentPath = share.document_path as string | null;
    if (!documentPath) {
      return NextResponse.json({ error: "لا يوجد مستند مرتبط بهذا الرابط" }, { status: 404 });
    }

    const { data: signed, error: signError } = await supabase.storage
      .from("documents")
      .createSignedUrl(documentPath, 300);

    if (signError || !signed?.signedUrl) {
      console.error("[share verify POST] createSignedUrl failed:", signError?.message);
      return NextResponse.json({ error: "تعذر فتح المستند" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        title: share.title ?? null,
        url: signed.signedUrl,
      },
    });
  } catch (err) {
    console.error("[share verify POST] Unexpected error:", err);
    return NextResponse.json({ error: "تعذر التحقق من الرابط" }, { status: 500 });
  }
}
