import { NextResponse, type NextRequest } from "next/server";
import { assertCaseWorker } from "@/lib/auth/assertCaseWorker";
import { generateShareToken, sha256Hex } from "@/lib/services/shareSecrets";
import { trackingPath } from "@/lib/tracking/trackingView";
import {
  MAX_ACTIVE_TRACKING_LINKS,
  NO_STORE,
  TRACKING_LINK_SELECT,
  toTrackingLinkDto,
  type TrackingLinkRow,
} from "./_shared";

/**
 * /api/v1/cases/[id]/tracking-links — the lawyer's side of the client
 * tracking link (N3.6, owner §٤٥ axis 6; public.case_tracking_links,
 * 20261025_32). Session client: RLS lists a case's links to the people who
 * work on it, and refuses a link on a case the caller does not work on, or
 * under a firm that is not the case's (case_row_scope_ok).
 *
 * GET  → { data: TrackingLinkDto[] } newest first.
 * POST → { data, path } — `path` (/track/<token>) is the ONLY time the token
 *        exists outside the client's hands: only its sha256 is stored, so the
 *        screen says to copy it now; a lost link is revoked and replaced.
 */

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertCaseWorker();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const { id } = await context.params;

    const { data, error } = await supabase
      .from("case_tracking_links")
      .select(TRACKING_LINK_SELECT)
      .eq("case_request_id", id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      console.error("[tracking-links GET] failed:", error.message, error.code);
      return NextResponse.json({ error: "تعذّر تحميل روابط المتابعة." }, { status: 500, headers: NO_STORE });
    }
    return NextResponse.json(
      { data: ((data ?? []) as TrackingLinkRow[]).map((r) => toTrackingLinkDto(r, user.id)) },
      { headers: NO_STORE },
    );
  } catch (err) {
    console.error("[tracking-links GET] unexpected:", err);
    return NextResponse.json({ error: "تعذّر تحميل روابط المتابعة." }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertCaseWorker();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const { id } = await context.params;
    if (!id || id.length > 200) return NextResponse.json({ error: "معرّف القضية غير صالح." }, { status: 400, headers: NO_STORE });

    const { data: caseRow, error: caseError } = await supabase
      .from("service_requests").select("id, firm_id").eq("id", id).maybeSingle();
    if (caseError) {
      console.error("[tracking-links POST] case read failed:", caseError.message, caseError.code);
      return NextResponse.json({ error: "تعذّر التحقق من القضية." }, { status: 500, headers: NO_STORE });
    }
    if (!caseRow) return NextResponse.json({ error: "القضية غير موجودة." }, { status: 404, headers: NO_STORE });

    const { count, error: countError } = await supabase
      .from("case_tracking_links")
      .select("id", { count: "exact", head: true })
      .eq("case_request_id", id)
      .is("revoked_at", null);
    if (countError) {
      console.error("[tracking-links POST] count failed:", countError.message, countError.code);
      return NextResponse.json({ error: "تعذّر إنشاء الرابط." }, { status: 500, headers: NO_STORE });
    }
    if ((count ?? 0) >= MAX_ACTIVE_TRACKING_LINKS) {
      return NextResponse.json(
        { error: `لهذه القضية ${MAX_ACTIVE_TRACKING_LINKS} روابط فعّالة — أوقف رابطاً قديماً قبل إنشاء جديد.` },
        { status: 409, headers: NO_STORE },
      );
    }

    const token = generateShareToken();
    const { data, error } = await supabase
      .from("case_tracking_links")
      .insert({
        case_request_id: id,
        owner_user_id: user.id,
        firm_id: (caseRow as { firm_id: string | null }).firm_id ?? null,
        token_hash: sha256Hex(token),
      })
      .select(TRACKING_LINK_SELECT)
      .single();
    if (error || !data) {
      console.error("[tracking-links POST] insert failed:", error?.message, error?.code);
      const status = error?.code === "42501" ? 403 : 500;
      return NextResponse.json(
        { error: status === 403 ? "لا يمكنك إنشاء رابط متابعة لقضية لا تعمل عليها." : "تعذّر إنشاء الرابط." },
        { status, headers: NO_STORE },
      );
    }
    return NextResponse.json(
      { data: toTrackingLinkDto(data as TrackingLinkRow, user.id), path: trackingPath(token) },
      { status: 201, headers: NO_STORE },
    );
  } catch (err) {
    console.error("[tracking-links POST] unexpected:", err);
    return NextResponse.json({ error: "تعذّر إنشاء الرابط." }, { status: 500, headers: NO_STORE });
  }
}
