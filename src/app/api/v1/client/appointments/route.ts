import { NextResponse } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { createServiceClient } from "@/lib/supabase/server";
import { resolveCallerBusinessScope } from "@/lib/auth/businessCallerScope";
import { riyadhToday } from "@/lib/riyadhToday";
import {
  CLIENT_HEARING_COLUMNS,
  CLIENT_VISIBLE_HEARING_KINDS,
  toClientHearing,
  type ClientHearingRow,
} from "@/lib/clientCaseSummary";

/**
 * GET /api/v1/client/appointments — «المواعيد» of the company dashboard (owner
 * decision ٥), and usable by any client account.
 *
 *   hearings       upcoming client-visible hearings (judicial / client_meet) on
 *                  the caller's cases — their own requests and, for a company
 *                  member, every case filed under the company (business_id).
 *   consultations  the caller's own scheduled consultations (consultations RLS
 *                  admits the requester only, so a colleague's are not listed).
 *
 * Same two-step rule as /api/v1/client/cases/[id]/summary (owner decisions
 * ١٥/١٩): the caller's RLS client decides WHICH cases (service_requests
 * policies: requester, and the 20260914 company-member arm); the service
 * client then reads `hearings` for exactly those ids with the fixed client
 * column list — no notes, minutes, judge or title.
 */

const AR = { readFailed: "تعذّر تحميل المواعيد. حاول مرة أخرى." } as const;

const CASE_CAP = 300;
const CHUNK = 100;

export async function GET() {
  try {
    const auth = await assertRole();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const scope = await resolveCallerBusinessScope(supabase, user.id, "client/appointments", {
      withDelegation: false,
    });
    const filter = scope.businessId
      ? `requester_user_id.eq.${user.id},business_id.eq.${scope.businessId}`
      : `requester_user_id.eq.${user.id}`;

    const { data: cases, error: casesErr } = await supabase
      .from("service_requests")
      .select("id, title")
      .or(filter)
      .order("created_at", { ascending: false })
      .limit(CASE_CAP);
    if (casesErr) {
      console.error("[client/appointments] cases read failed:", casesErr.message, casesErr.code);
      return NextResponse.json({ error: AR.readFailed }, { status: 500 });
    }
    const caseRows = (cases ?? []) as { id: string; title: string | null }[];
    const titleById = new Map(caseRows.map((c) => [c.id, c.title ?? ""]));
    const today = riyadhToday();

    let hearingRows: ClientHearingRow[] = [];
    if (caseRows.length > 0) {
      const service = await createServiceClient();
      const ids = caseRows.map((c) => c.id);
      for (let i = 0; i < ids.length; i += CHUNK) {
        const { data, error } = await service
          .from("hearings")
          .select(CLIENT_HEARING_COLUMNS)
          .in("case_request_id", ids.slice(i, i + CHUNK))
          .in("kind", [...CLIENT_VISIBLE_HEARING_KINDS])
          .eq("status", "scheduled")
          .gte("hearing_date", today)
          .order("hearing_date", { ascending: true })
          .limit(200);
        if (error) {
          console.error("[client/appointments] hearings read failed:", error.message, error.code);
          return NextResponse.json({ error: AR.readFailed }, { status: 500 });
        }
        hearingRows = hearingRows.concat((data ?? []) as ClientHearingRow[]);
      }
    }

    const hearings = hearingRows
      .map((row) => ({ ...toClientHearing(row), caseTitle: titleById.get(row.case_request_id ?? "") ?? "" }))
      .sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : (a.time ?? "99") < (b.time ?? "99") ? -1 : 1));

    const { data: consultations, error: consErr } = await supabase
      .from("consultations")
      .select("id, request_id, scheduled_at, status, mode, specialty")
      .eq("requester_user_id", user.id)
      .eq("status", "scheduled")
      .gte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(100);
    if (consErr) {
      console.error("[client/appointments] consultations read failed:", consErr.message, consErr.code);
      return NextResponse.json({ error: AR.readFailed }, { status: 500 });
    }

    return NextResponse.json({
      hearings,
      consultations: (consultations ?? []).map((c) => ({
        id: c.id as string,
        requestId: (c.request_id as string | null) ?? null,
        scheduledAt: c.scheduled_at as string,
        mode: (c.mode as string | null) ?? null,
        specialty: (c.specialty as string | null) ?? null,
      })),
      // Said on screen when the case list hit the cap, instead of truncating in silence.
      casesCapped: caseRows.length >= CASE_CAP,
    });
  } catch (err) {
    console.error("[client/appointments] Unexpected error:", err);
    return NextResponse.json({ error: AR.readFailed }, { status: 500 });
  }
}
