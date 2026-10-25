import { NextResponse, type NextRequest } from "next/server";
import { assertCaseWorker } from "@/lib/auth/assertCaseWorker";
import { generateShareToken, sha256Hex } from "@/lib/services/shareSecrets";
import { trackingPath } from "@/lib/tracking/trackingView";
import { DEFAULT_TRACKING_LIFETIME, isMissingRpcError, isTrackingLifetime } from "@/lib/tracking/trackingLinkState";
import {
  MAX_ACTIVE_TRACKING_LINKS,
  NO_PHONE_AR,
  NO_STAGE_AR,
  NO_STORE,
  TRACKING_LINK_SELECT,
  TRACKING_LINK_SELECT_V2,
  isMissingV2Column,
  readTrackingLinks,
  toTrackingLinkDto,
  type TrackingLinkRow,
} from "./_shared";

/**
 * /api/v1/cases/[id]/tracking-links — the lawyer's side of the client
 * tracking link (N3.6, owner §٤٥ axis 6; public.case_tracking_links,
 * 20261025_32; v2 = D2, owner ٢٧٦, 20261026_62). Session client: RLS lists a
 * case's links to the people who work on it, and refuses a link on a case the
 * caller does not work on, or under a firm that is not the case's
 * (case_row_scope_ok), or from a member who may not issue one
 * (can_issue_tracking_link — checked here first too).
 *
 * GET  → { data: TrackingLinkDto[], canIssue, v2, hasPhone } newest first.
 *        `state` comes from public.case_tracking_link_states (SQL knows when a
 *        stage has ended). `hasPhone` (null on v1) says whether the case file
 *        has a client mobile the link can be opened with.
 * POST { lifetime: "7d" | "30d" | "90d" | "stage" } → { data, path } — `path`
 *        (/track/<token>) is the ONLY time the token exists outside the
 *        client's hands: only its sha256 is stored. Refused (409) when the
 *        case file has no client mobile (the link could never be opened), or
 *        for "stage" when the case has no open stage.
 *
 * Before 20261026_62 (v1 database): no lifetime, no states, no phone check —
 * the v1 behaviour, and `v2: false` so the screen hides what cannot work.
 * Nothing leaks from it: the public /track page fails closed on that
 * database (every link «unavailable») until 20261026_62 runs.
 */

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertCaseWorker();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const { id } = await context.params;

    const [links, issue] = await Promise.all([
      readTrackingLinks(supabase, id),
      supabase.rpc("can_issue_tracking_link", { p_request: id }),
    ]);
    if (!links.ok) {
      return NextResponse.json({ error: "تعذّر تحميل روابط المتابعة." }, { status: 500, headers: NO_STORE });
    }
    if (issue.error) console.error("[tracking-links GET] authority check failed:", issue.error.message, issue.error.code);
    const canIssue = issue.data === true;

    let hasPhone: boolean | null = null;
    if (links.v2 && canIssue) {
      const phone = await supabase.rpc("case_tracking_has_phone", { p_request: id });
      if (phone.error) {
        if (!isMissingRpcError(phone.error, "case_tracking_has_phone")) {
          console.error("[tracking-links GET] phone check failed:", phone.error.message, phone.error.code);
        }
      } else {
        hasPhone = phone.data === true;
      }
    }
    return NextResponse.json(
      {
        data: links.rows.map((r) => toTrackingLinkDto(r, user.id, links.states.get(r.id))),
        canIssue,
        v2: links.v2,
        hasPhone,
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    console.error("[tracking-links GET] unexpected:", err);
    return NextResponse.json({ error: "تعذّر تحميل روابط المتابعة." }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertCaseWorker();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const { id } = await context.params;
    if (!id || id.length > 200) return NextResponse.json({ error: "معرّف القضية غير صالح." }, { status: 400, headers: NO_STORE });

    const body = (await request.json().catch(() => null)) as { lifetime?: unknown } | null;
    const lifetime = body?.lifetime === undefined || body?.lifetime === null ? DEFAULT_TRACKING_LIFETIME : body.lifetime;
    if (!isTrackingLifetime(lifetime)) {
      return NextResponse.json({ error: "اختر مدة الرابط: ٧ أيام أو ٣٠ أو ٩٠ يوماً أو حتى انتهاء المرحلة." }, { status: 400, headers: NO_STORE });
    }

    const { data: caseRow, error: caseError } = await supabase
      .from("service_requests").select("id, firm_id").eq("id", id).maybeSingle();
    if (caseError) {
      console.error("[tracking-links POST] case read failed:", caseError.message, caseError.code);
      return NextResponse.json({ error: "تعذّر التحقق من القضية." }, { status: 500, headers: NO_STORE });
    }
    if (!caseRow) return NextResponse.json({ error: "القضية غير موجودة." }, { status: 404, headers: NO_STORE });

    // Who may hand the case to a guest (20261025_32 §0b): the lead, the filer,
    // the case team, the firm owner, or a member whose firm role may open the
    // firm's cases — not every active member. The insert policy re-checks it;
    // this only answers early and plainly.
    const { data: mayIssue, error: issueError } = await supabase.rpc("can_issue_tracking_link", { p_request: id });
    if (issueError) {
      console.error("[tracking-links POST] authority check failed:", issueError.message, issueError.code);
      return NextResponse.json({ error: "تعذّر التحقق من صلاحيتك على القضية." }, { status: 500, headers: NO_STORE });
    }
    if (mayIssue !== true) {
      return NextResponse.json(
        { error: "إنشاء رابط المتابعة متاح للمحامي المسؤول وفريق القضية ومن يملك صلاحية قضايا المكتب." },
        { status: 403, headers: NO_STORE },
      );
    }

    // The client opens the link with the last 4 digits of his mobile on the
    // case file (٢٧٦). No number → the link could never be opened: refuse.
    let v2 = true;
    const phone = await supabase.rpc("case_tracking_has_phone", { p_request: id });
    if (phone.error) {
      if (isMissingRpcError(phone.error, "case_tracking_has_phone")) {
        v2 = false;
      } else {
        console.error("[tracking-links POST] phone check failed:", phone.error.message, phone.error.code);
        return NextResponse.json({ error: "تعذّر التحقق من رقم جوال الموكل." }, { status: 500, headers: NO_STORE });
      }
    } else if (phone.data !== true) {
      return NextResponse.json({ error: NO_PHONE_AR, code: "no_phone" }, { status: 409, headers: NO_STORE });
    }

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
        { error: `لهذه القضية ${MAX_ACTIVE_TRACKING_LINKS} روابط غير ملغاة (النشطة والموقوفة مؤقتاً) — ألغِ رابطاً قديماً إلغاءً نهائياً قبل إنشاء جديد.` },
        { status: 409, headers: NO_STORE },
      );
    }

    const token = generateShareToken();
    const base = {
      case_request_id: id,
      owner_user_id: user.id,
      firm_id: (caseRow as { firm_id: string | null }).firm_id ?? null,
      token_hash: sha256Hex(token),
    };
    let { data, error } = v2
      ? await supabase.from("case_tracking_links").insert({ ...base, lifetime }).select(TRACKING_LINK_SELECT_V2).single()
      : await supabase.from("case_tracking_links").insert(base).select(TRACKING_LINK_SELECT).single();
    if (error && v2 && isMissingV2Column(error)) {
      ({ data, error } = await supabase.from("case_tracking_links").insert(base).select(TRACKING_LINK_SELECT).single());
    }
    if (error || !data) {
      console.error("[tracking-links POST] insert failed:", error?.message, error?.code);
      if (String(error?.message ?? "").includes("tracking_link_no_stage")) {
        return NextResponse.json({ error: NO_STAGE_AR, code: "no_stage" }, { status: 409, headers: NO_STORE });
      }
      const status = error?.code === "42501" ? 403 : 500;
      return NextResponse.json(
        { error: status === 403 ? "لا يمكنك إنشاء رابط متابعة لقضية لا تعمل عليها." : "تعذّر إنشاء الرابط." },
        { status, headers: NO_STORE },
      );
    }
    return NextResponse.json(
      { data: toTrackingLinkDto(data as unknown as TrackingLinkRow, user.id), path: trackingPath(token) },
      { status: 201, headers: NO_STORE },
    );
  } catch (err) {
    console.error("[tracking-links POST] unexpected:", err);
    return NextResponse.json({ error: "تعذّر إنشاء الرابط." }, { status: 500, headers: NO_STORE });
  }
}
