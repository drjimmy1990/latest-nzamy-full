import { NextResponse, NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { createServiceClient } from "@/lib/supabase/server";
import { LICENCE_ERRORS, LICENCE_MAX_BYTES, safeLicenceName, validateLicenceUpload } from "@/lib/services/licenceUpload";

/**
 * POST /api/v1/lawyer/licence-image — a lawyer or legal consultant uploads an
 * image (or PDF) of his licence; admins open it from the verification queue
 * (owner answer ٢١٩, ruling P12; GET /api/v1/admin/verifications signs it).
 *
 * The upload goes through the server rather than from the browser to Storage:
 * the `documents` bucket's Storage policies were set by hand and their live
 * state is unknown, and `lawyer_profiles.licence_image_path` is writable by the
 * service role only (20261019_20). So the file is checked here, put at
 * `${userId}/licence/<timestamp>-<safeName>.<ext>` with the service client,
 * and the path is saved on the caller's own row.
 *
 * Body: multipart/form-data with one field, `file`. Response: `{ ok: true }` —
 * the path, and any link to it, never go back to the browser.
 *
 * Deploy order: before 20261019_20 runs the column does not exist; the update
 * fails with 42703/PGRST204, the uploaded object is removed and the answer is
 * 503 «الخدمة غير متاحة مؤقتاً» (logged once), never 500.
 *
 * Ops: this is the app's first upload that passes through the app server. The
 * reverse proxy in front of Next.js must accept a body of about 6 MB
 * (nginx `client_max_body_size 6m;` — its default is 1 MB).
 */

const AR = {
  notLawyer: "رفع صورة الترخيص متاح لحساب المحامي أو المستشار القانوني فقط.",
  badForm: "تعذّرت قراءة الملف المرفوع. أعد المحاولة.",
  noFile: "لم يُرفق ملف. اختر صورة الترخيص أولاً.",
  noRow: "لا يوجد ملف مهني مرتبط بحسابك، فلا يمكن حفظ صورة الترخيص.",
  uploadFailed: "تعذّر رفع صورة الترخيص. أعد المحاولة.",
  saveFailed: "تعذّر حفظ صورة الترخيص. أعد المحاولة.",
  unavailable: "الخدمة غير متاحة مؤقتاً",
  unexpected: "خطأ غير متوقع",
} as const;

/** Multipart boundaries and headers on top of the file itself. */
const MULTIPART_ALLOWANCE = 64 * 1024;

let loggedMissingColumn = false;

function isMissingColumn(error: { code?: string } | null | undefined): boolean {
  return error?.code === "42703" || error?.code === "PGRST204";
}

export async function POST(request: NextRequest) {
  try {
    const auth = await assertRole(["lawyer"]);
    if (!auth.ok) return auth.response;
    const { user, userType } = auth;
    // assertRole always admits a platform admin, who has no lawyer_profiles row.
    if (userType !== "lawyer") {
      return NextResponse.json({ error: AR.notLawyer }, { status: 403 });
    }

    // Refuse an obviously oversized body before buffering it.
    const declaredLength = Number(request.headers.get("content-length") ?? "");
    if (Number.isFinite(declaredLength) && declaredLength > LICENCE_MAX_BYTES + MULTIPART_ALLOWANCE) {
      return NextResponse.json({ error: LICENCE_ERRORS.tooLarge }, { status: 413 });
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: AR.badForm }, { status: 400 });
    }
    const file = form.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: AR.noFile }, { status: 400 });
    }

    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const check = validateLicenceUpload({ size: file.size, type: file.type, head });
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: check.status });
    }

    const service = await createServiceClient();
    const path = `${user.id}/licence/${Date.now()}-${safeLicenceName(file.name)}.${check.ext}`;

    const { error: uploadError } = await service.storage
      .from("documents")
      .upload(path, await file.arrayBuffer(), { contentType: check.contentType, upsert: false });
    if (uploadError) {
      console.error("[lawyer/licence-image POST] upload failed:", uploadError.message);
      return NextResponse.json({ error: AR.uploadFailed }, { status: 500 });
    }

    const { data: updated, error: updateError } = await service
      .from("lawyer_profiles")
      .update({ licence_image_path: path })
      .eq("user_id", user.id)
      .select("user_id");

    if (updateError || !updated || updated.length === 0) {
      // Never leave an object no row points at.
      const { error: removeError } = await service.storage.from("documents").remove([path]);
      if (removeError) {
        console.error("[lawyer/licence-image POST] cleanup failed; orphaned object left behind:", removeError.message);
      }

      if (isMissingColumn(updateError)) {
        if (!loggedMissingColumn) {
          loggedMissingColumn = true;
          console.warn("[lawyer/licence-image POST] lawyer_profiles.licence_image_path is missing (run 20261019_20); uploads answer 503");
        }
        return NextResponse.json({ error: AR.unavailable }, { status: 503 });
      }
      if (updateError) {
        console.error("[lawyer/licence-image POST] update failed:", updateError.code, updateError.message);
        return NextResponse.json({ error: AR.saveFailed }, { status: 500 });
      }
      return NextResponse.json({ error: AR.noRow }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[lawyer/licence-image POST] Unexpected error:", err);
    return NextResponse.json({ error: AR.unexpected }, { status: 500 });
  }
}
