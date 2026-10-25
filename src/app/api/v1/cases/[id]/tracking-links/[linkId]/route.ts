import { NextResponse, type NextRequest } from "next/server";
import { assertCaseWorker } from "@/lib/auth/assertCaseWorker";
import { isMissingRpcError, isTrackingLifetime } from "@/lib/tracking/trackingLinkState";
import { NO_STAGE_AR, NO_STORE, TRACKING_LINK_SELECT, readTrackingLinks, toTrackingLinkDto, type TrackingLinkRow } from "../_shared";

/**
 * PATCH /api/v1/cases/[id]/tracking-links/[linkId]
 *   { action: "revoke" }                 (or the v1 body { revoke: true })
 *   { action: "pause" }
 *   { action: "resume", lifetime: "7d" | "30d" | "90d" | "stage" }
 *
 * Owner ٢٧٦: a link is paused, never deleted, and re-activated on the SAME
 * URL with a new lifetime; a permanent cancel (revoke) stays.
 *
 * Revoke: the link's maker or anyone who may issue a link on the case;
 * nobody can bring a revoked link back — the table grants sessions UPDATE on
 * revoked_at only, and its policy's WITH CHECK refuses a NULL there
 * (20261025_32). There is no DELETE.
 * Pause / resume: public.tracking_link_pause / tracking_link_resume
 * (20261026_62), SECURITY DEFINER, called with the session; they apply the
 * revoke policy's rule themselves (maker or issuer), touch only the state
 * columns, and refuse a revoked link. Before 20261026_62 they do not exist:
 * 503 with a plain message.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string; linkId: string }> }) {
  try {
    const auth = await assertCaseWorker();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const { id, linkId } = await context.params;
    if (!UUID_RE.test(linkId)) return NextResponse.json({ error: "الرابط غير موجود." }, { status: 404, headers: NO_STORE });

    const body = (await request.json().catch(() => null)) as { revoke?: unknown; action?: unknown; lifetime?: unknown } | null;
    const action = body?.revoke === true ? "revoke" : body?.action;

    if (action === "revoke") {
      const { data, error } = await supabase
        .from("case_tracking_links")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", linkId)
        .eq("case_request_id", id)
        .is("revoked_at", null)
        .select(TRACKING_LINK_SELECT)
        .maybeSingle();
      if (error) {
        console.error("[tracking-links PATCH] revoke failed:", error.message, error.code);
        return NextResponse.json({ error: "تعذّر إلغاء الرابط." }, { status: 500, headers: NO_STORE });
      }
      if (!data) return NextResponse.json({ error: "الرابط غير موجود أو ملغى من قبل." }, { status: 404, headers: NO_STORE });
      return reply(supabase, id, linkId, user.id, data as TrackingLinkRow);
    }

    if (action !== "pause" && action !== "resume") {
      return NextResponse.json({ error: "الإجراءات المتاحة: إيقاف مؤقت، إعادة تفعيل، إلغاء نهائي." }, { status: 400, headers: NO_STORE });
    }
    if (action === "resume" && !isTrackingLifetime(body?.lifetime)) {
      return NextResponse.json({ error: "اختر مدة الرابط عند إعادة تفعيله." }, { status: 400, headers: NO_STORE });
    }

    // The link must belong to this case (the RPC knows only the link id).
    const own = await readTrackingLinks(supabase, id, linkId);
    if (!own.ok) return NextResponse.json({ error: "تعذّر تحديث الرابط." }, { status: 500, headers: NO_STORE });
    if (own.rows.length === 0) return NextResponse.json({ error: "الرابط غير موجود." }, { status: 404, headers: NO_STORE });

    const fn = action === "pause" ? "tracking_link_pause" : "tracking_link_resume";
    const { data: result, error } = action === "pause"
      ? await supabase.rpc("tracking_link_pause", { p_link: linkId })
      : await supabase.rpc("tracking_link_resume", { p_link: linkId, p_lifetime: body?.lifetime });
    if (error) {
      if (isMissingRpcError(error, fn)) {
        return NextResponse.json(
          { error: "الإيقاف المؤقت وإعادة التفعيل يحتاجان تحديث قاعدة البيانات (20261026_62). الإلغاء النهائي متاح." },
          { status: 503, headers: NO_STORE },
        );
      }
      console.error(`[tracking-links PATCH] ${fn} failed:`, error.message, error.code);
      return NextResponse.json({ error: "تعذّر تحديث الرابط." }, { status: 500, headers: NO_STORE });
    }
    switch (result) {
      case "ok":
        break;
      case "revoked":
        return NextResponse.json({ error: "هذا الرابط ملغى نهائياً ولا يمكن تفعيله — أنشئ رابطاً جديداً." }, { status: 409, headers: NO_STORE });
      case "no_stage":
        return NextResponse.json({ error: NO_STAGE_AR, code: "no_stage" }, { status: 409, headers: NO_STORE });
      case "bad_lifetime":
        return NextResponse.json({ error: "اختر مدة الرابط عند إعادة تفعيله." }, { status: 400, headers: NO_STORE });
      default:
        return NextResponse.json(
          { error: "الإيقاف وإعادة التفعيل متاحان لمنشئ الرابط وللمحامي المسؤول وفريق القضية ومن يملك صلاحية قضايا المكتب." },
          { status: 403, headers: NO_STORE },
        );
    }
    return reply(supabase, id, linkId, user.id, null);
  } catch (err) {
    console.error("[tracking-links PATCH] unexpected:", err);
    return NextResponse.json({ error: "تعذّر تحديث الرابط." }, { status: 500, headers: NO_STORE });
  }
}

/** The link as it is now (v2 columns and the SQL state when available). */
async function reply(
  supabase: Parameters<typeof readTrackingLinks>[0],
  caseId: string,
  linkId: string,
  uid: string,
  fallback: TrackingLinkRow | null,
) {
  const now = await readTrackingLinks(supabase, caseId, linkId);
  const row = now.ok ? now.rows[0] : undefined;
  if (row) return NextResponse.json({ data: toTrackingLinkDto(row, uid, now.ok ? now.states.get(row.id) : null) }, { headers: NO_STORE });
  if (fallback) return NextResponse.json({ data: toTrackingLinkDto(fallback, uid) }, { headers: NO_STORE });
  return NextResponse.json({ error: "تعذّر قراءة الرابط بعد تحديثه." }, { status: 500, headers: NO_STORE });
}
