import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requireApiUser } from "@/lib/auth/apiAuth";
import { practiceKindFromRead } from "@/lib/auth/courtPracticeDecision";
import { callN8n } from "@/lib/ai/n8nClient";
import { retrieveLibrary } from "@/lib/ai/retrieval";
import { startRunWith, type RouteReply, type RunActor } from "@/lib/ai/runCore";
import { libraryGate } from "@/lib/library-gate";
import { libraryAiAccess } from "@/app/api/ai/_libraryAiAccess";

/**
 * /api/v1/ai/runs — the AI tools (docs/plans/2026-10-26-ai-services-n8n-plan.md
 * §1, §2.4).
 *
 * POST  start a run: { tool, variant?, input, fileIds?, conversationId?, idempotencyKey }.
 *       This route signs the user in and refuses a frozen account
 *       (requireApiUser); startRunWith (src/lib/ai/runCore.ts) does the rest
 *       of the checks, the charge, the n8n call and the settlement.
 *       Fast tool: 200 { runId, status, output, citations, chargedPoints }.
 *       Job tool:  202 { runId, status: "running" } — poll GET …/runs/<id>.
 * GET   the user's last 50 runs (?tool= to filter), own rows through RLS.
 *
 * /api/v1/ai/* is not in PROTECTED_API_PREFIXES, so the proxy adds no 401 or
 * freeze check: both happen here.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "private, no-store" };
const SIGN_IN = { error: "سجّل الدخول لاستخدام أدوات الذكاء الاصطناعي" };

/**
 * A library tool's gate: the library's closed switch (admins pass), then the
 * assistant's rule, Pro or higher or a platform admin (owner ٢٠٦ / ٢٠٧ / ٢٠٩),
 * the same two checks as /api/ai/library-chat.
 */
async function libraryAccess(): Promise<RouteReply | null> {
  const refused = (await libraryGate()) ?? (await libraryAiAccess());
  if (!refused) return null;
  const body = (await refused.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: refused.status, body: { ...body, code: body.libraryClosed ? "library_closed" : "library_tier" } };
}

function callbackUrl(): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "") ?? "";
  return /^https:\/\//.test(site) ? `${site}/api/v1/ai/callback` : "";
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const auth = await requireApiUser(supabase, SIGN_IN);
    if (auth instanceof NextResponse) return auth;
    const { user } = auth;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "طلب غير صالح", code: "invalid_body" }, { status: 400, headers: NO_STORE });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("user_type, display_name")
      .eq("id", user.id)
      .maybeSingle();
    const userType = typeof profile?.user_type === "string" ? profile.user_type : "";
    // Art. 18: the same read and the same fail-open-to-advocate rule as
    // assertCourtPractice (a firm account has no lawyer_profiles row).
    const practice =
      userType === "lawyer" || userType === "firm"
        ? practiceKindFromRead(
            await supabase.from("lawyer_profiles").select("practice_kind").eq("user_id", user.id).maybeSingle(),
          ).practiceKind
        : "advocate";
    const actor: RunActor = {
      userId: user.id,
      userType,
      practiceKind: practice,
      displayName: typeof profile?.display_name === "string" ? profile.display_name : null,
    };

    const admin = await createServiceClient();
    const reply = await startRunWith(
      admin,
      {
        callbackUrl: callbackUrl(),
        n8n: (call) => callN8n({ ...call, baseUrl: process.env.N8N_AI_BASE_URL, key: process.env.NZAMY_AI_KEY }),
        libraryAccess,
        retrieve: (queries, limits) => retrieveLibrary(admin, queries, limits),
      },
      actor,
      body,
    );
    return NextResponse.json(reply.body, { status: reply.status, headers: NO_STORE });
  } catch (err) {
    console.error("[ai/runs] POST failed:", err);
    return NextResponse.json({ error: "تعذّر بدء الأداة الآن — حاول بعد قليل" }, { status: 503, headers: NO_STORE });
  }
}

const RUN_COLUMNS =
  "id, tool, variant, class, status, price_points, charged_points, charged, conversation_id, output, citations, error_code, progress_step, created_at, finished_at, refunded_at";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const auth = await requireApiUser(supabase, SIGN_IN);
    if (auth instanceof NextResponse) return auth;

    let query = supabase
      .from("ai_runs")
      .select(RUN_COLUMNS)
      .eq("user_id", auth.user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    const tool = request.nextUrl.searchParams.get("tool");
    if (tool && /^[a-z0-9-]{1,40}$/.test(tool)) query = query.eq("tool", tool);
    const { data, error } = await query;
    if (error) {
      console.error("[ai/runs] GET failed:", error.code, error.message);
      return NextResponse.json({ error: "تعذّر تحميل السجل" }, { status: 503, headers: NO_STORE });
    }
    // A review run's draft is for staff until it is approved.
    const runs = (data ?? []).map((r) => (r.status === "review" ? { ...r, output: null, citations: [] } : r));
    return NextResponse.json({ runs }, { headers: NO_STORE });
  } catch (err) {
    console.error("[ai/runs] GET threw:", err);
    return NextResponse.json({ error: "تعذّر تحميل السجل" }, { status: 503, headers: NO_STORE });
  }
}
