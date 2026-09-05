import { NextRequest, NextResponse } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { isValidAttachmentId } from "../documents/_shared";
import { generateShareToken, generatePasscode, sha256Hex } from "@/lib/services/shareSecrets";

/**
 * POST /api/v1/share — owner item 174. Mints a real `document_shares` row
 * for an attachment the caller can already read, so the link
 * `/share/<token>` returned to the browser actually resolves (it used to
 * 404 always: useContractsState.generateShareLink/the StepApproval panels
 * only ever built a token in React state, and nothing inserted a row — see
 * shareService.ts and 20260909_document_shares_hashes.sql).
 *
 * Body: { attachmentId: string, title?: string, expiresInHours?: number
 *         (1-720, default 72), withPasscode?: boolean (default true) }
 *
 * The plaintext token/passcode this route generates exist ONLY in this
 * response — the row stores `token_hash`/`passcode_hash` (sha256) and
 * leaves the old plaintext `token`/`passcode` columns NULL. There is no way
 * to recover the passcode later: the panel that calls this must show it
 * once and say so.
 *
 * Any signed-in account may share a document it can read — this is not
 * role-gated beyond "authenticated" (assertRole() with no allow-list).
 */
export async function POST(request: NextRequest) {
  try {
    const gate = await assertRole();
    if (!gate.ok) return gate.response;
    const { supabase, user } = gate;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "بيانات الطلب غير صالحة" }, { status: 400 });
    }
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "بيانات الطلب غير صالحة" }, { status: 400 });
    }
    const b = body as Record<string, unknown>;

    // attachments.id is a bigserial, not a uuid — same guard every other
    // /api/v1/documents/** route uses (documents/_shared.ts).
    const attachmentId = typeof b.attachmentId === "string" ? b.attachmentId : "";
    if (!isValidAttachmentId(attachmentId)) {
      return NextResponse.json({ error: "معرف المستند غير صالح" }, { status: 400 });
    }

    let title: string | null = null;
    if (b.title !== undefined) {
      if (typeof b.title !== "string") {
        return NextResponse.json({ error: "عنوان المشاركة غير صالح" }, { status: 400 });
      }
      const trimmed = b.title.trim().slice(0, 200);
      title = trimmed.length > 0 ? trimmed : null;
    }

    let expiresInHours = 72;
    if (b.expiresInHours !== undefined) {
      const n = Number(b.expiresInHours);
      if (!Number.isInteger(n) || n < 1 || n > 720) {
        return NextResponse.json(
          { error: "مدة صلاحية الرابط يجب أن تكون بين ساعة و٧٢٠ ساعة (٣٠ يوماً)" },
          { status: 400 },
        );
      }
      expiresInHours = n;
    }

    let withPasscode = true;
    if (b.withPasscode !== undefined) {
      if (typeof b.withPasscode !== "boolean") {
        return NextResponse.json({ error: "بيانات الطلب غير صالحة" }, { status: 400 });
      }
      withPasscode = b.withPasscode;
    }

    // RLS-scoped read IS the authorization check: attachments_select_policy
    // (20260616_production_readiness_fixes.sql) grants SELECT to the row's
    // owner OR a participant of the service request it is attached to — an
    // empty result covers "does not exist", "not yours" and "deleted" alike,
    // which is why deleted_at is filtered here rather than reported as a
    // separate 409: RLS itself has no notion of the bin.
    const { data: attachment, error: fetchError } = await supabase
      .from("attachments")
      .select("id, file_name, storage_path")
      .eq("id", attachmentId)
      .is("deleted_at", null)
      .maybeSingle();

    if (fetchError) {
      console.error("[share POST] attachments fetch failed:", fetchError.message, fetchError.code);
      return NextResponse.json({ error: "تعذّر تحميل المستند" }, { status: 500 });
    }
    if (!attachment) {
      return NextResponse.json({ error: "المستند غير موجود" }, { status: 404 });
    }
    const storagePath = String(attachment.storage_path ?? "");
    if (!storagePath) {
      return NextResponse.json({ error: "لا يوجد ملف مرتبط بهذا المستند" }, { status: 409 });
    }

    const token = generateShareToken();
    const passcode = withPasscode ? generatePasscode() : null;
    const tokenHash = sha256Hex(token);
    const passcodeHash = passcode ? sha256Hex(passcode) : null;
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();

    // The RLS-scoped client, on purpose: document_shares_owner_write
    // (20260706_content_and_ops.sql) already grants INSERT with
    // owner_id = auth.uid(), so that policy is the authority for who may
    // create a share row — a service-role insert would just bypass it for
    // no reason. `token`/`passcode` are omitted, so the row gets NULL in
    // both (20260909 migration dropped the NOT NULL on `token`).
    const { data: created, error: insertError } = await supabase
      .from("document_shares")
      .insert({
        owner_id: user.id,
        document_id: String(attachment.id),
        document_path: storagePath,
        title: title ?? attachment.file_name ?? null,
        token_hash: tokenHash,
        passcode_hash: passcodeHash,
        expires_at: expiresAt,
      })
      .select("id")
      .single();

    if (insertError || !created) {
      console.error("[share POST] document_shares insert failed:", insertError?.message, insertError?.code);
      const code = insertError?.code;
      if (code === "23505") {
        return NextResponse.json({ error: "تعذّر إنشاء رابط فريد — حاول مجدداً" }, { status: 409 });
      }
      if (code === "23514") return NextResponse.json({ error: "بيانات المشاركة غير صالحة" }, { status: 400 });
      if (code === "23503") return NextResponse.json({ error: "المشاركة تشير إلى سجلّ غير موجود" }, { status: 400 });
      if (code === "42501") return NextResponse.json({ error: "غير مصرح لك بهذا الإجراء" }, { status: 403 });
      return NextResponse.json({ error: "تعذّر إنشاء رابط المشاركة" }, { status: 500 });
    }

    // The plaintext token/passcode below exist nowhere else — not in this
    // route's own database write, not in any log line above. This response
    // is the one and only time either value is recoverable.
    return NextResponse.json(
      { url: `/share/${token}`, passcode, expiresAt },
      { status: 201 },
    );
  } catch (err) {
    console.error("[share POST] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر إنشاء رابط المشاركة" }, { status: 500 });
  }
}
