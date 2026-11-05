import { after, NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requireApiUser } from "@/lib/auth/apiAuth";
import { practiceKindFromRead } from "@/lib/auth/courtPracticeDecision";
import { callN8n } from "@/lib/ai/n8nClient";
import { retrieveLibrary } from "@/lib/ai/retrieval";
import { resolveAiFiles } from "@/lib/ai/aiFiles";
import { aiTextFilesConfig, pastedFileUrlFrom } from "@/lib/ai/textFilesConfig";
import { startRunWith, type RouteReply, type RunActor } from "@/lib/ai/runCore";
import { progressSink } from "@/lib/ai/progressEvents";
import { runForViewer, viewerIsAdmin } from "@/lib/ai/runVisibility";
import { libraryGate } from "@/lib/library-gate";
import { libraryAiAccess } from "@/app/api/ai/_libraryAiAccess";
import { libraryRunAccess, libraryRunCreated } from "@/lib/ai/libraryRunAccess";
import { libraryReadQuotaHit } from "@/lib/library/readQuotaServer";
import { recordLibraryActivity } from "@/lib/library/activityMeterServer";

/**
 * /api/v1/ai/runs — the AI tools (docs/plans/2026-10-26-ai-services-n8n-plan.md
 * §1, §2.4).
 *
 * POST  start a run: { tool, variant?, input, fileIds?, conversationId?, idempotencyKey }.
 *       This route signs the user in and refuses a frozen account
 *       (requireApiUser); startRunWith (src/lib/ai/runCore.ts) does the rest
 *       of the checks, the charge, the n8n call and the settlement.
 *       Fast tool: 200 { runId, status, output, citations, chargedPoints }.
 *       Job tool:  202 { runId, status: "running" } as soon as it is charged,
 *       before its searches and the n8n call — poll GET …/runs/<id>. A failure
 *       after the 202 is the run's error_code, refunded.
 * GET   the user's last 50 runs (?tool= to filter), own rows through RLS.
 *
 * /api/v1/ai/* is not in PROTECTED_API_PREFIXES, so the proxy adds no 401 or
 * freeze check: both happen here. Nor does the proxy's library lock reach
 * this path (one path, every tool): a run of the library's own AI checks the
 * lock here, before the charge (libraryAccessFor).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "private, no-store" };
const SIGN_IN = { error: "سجّل الدخول لاستخدام أدوات الذكاء الاصطناعي" };

/**
 * A library tool's gate: the library's closed switch (admins pass), then the
 * assistant's rule, Pro or higher or a platform admin (owner ٢٠٦ / ٢٠٧ / ٢٠٩),
 * the same two checks the deleted free route /api/ai/library-chat made.
 */
async function libraryAccess(): Promise<RouteReply | null> {
  const refused = (await libraryGate()) ?? (await libraryAiAccess());
  if (!refused) return null;
  const body = (await refused.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: refused.status, body: { ...body, code: body.libraryClosed ? "library_closed" : "library_tier" } };
}

/**
 * The gate above, then, for the library's own AI (readQuota.isLibraryAiTool),
 * what the proxy does on the library's other reads: a reader under a library
 * lock gets the lock's 423 and its message (readQuota.quotaRefusal),
 * uncharged. The lock check fails open and exempts admins, as in the proxy
 * (readQuotaServer.ts). The branches are src/lib/ai/libraryRunAccess.ts.
 */
function libraryAccessFor(userId: string) {
  return libraryRunAccess({
    gate: libraryAccess,
    lockRow: () => libraryReadQuotaHit(userId, null, { memoLockCheck: true }),
    now: () => Date.now(),
  });
}

/** «نشاط المكتبة»: a library-AI call is tallied once its run is created (task 2 review M1). */
function libraryRunCreatedFor(userId: string) {
  return libraryRunCreated(() => recordLibraryActivity(userId, "ai"));
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
    // Off unless NZAMY_AI_TEXT_FILES is on: .docx, .txt, .md and pasted text are
    // then refused before any charge (aiFiles.ts, runCore.ts).
    const textFiles = aiTextFilesConfig({
      NZAMY_AI_TEXT_FILES: process.env.NZAMY_AI_TEXT_FILES,
      NZAMY_AI_KEY: process.env.NZAMY_AI_KEY,
      NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    });
    const reply = await startRunWith(
      admin,
      {
        callbackUrl: callbackUrl(),
        n8n: (call) => callN8n({ ...call, baseUrl: process.env.N8N_AI_BASE_URL, key: process.env.NZAMY_AI_KEY }),
        libraryAccess: libraryAccessFor(user.id),
        onRunCreated: libraryRunCreatedFor(user.id),
        retrieve: (queries, limits, pin) => retrieveLibrary(admin, queries, limits, pin),
        resolveFiles: (userId, fileIds, rules) => resolveAiFiles(admin, userId, fileIds, rules, new Date(), textFiles ? { textFiles } : {}),
        ...(textFiles ? { pastedFileUrl: pastedFileUrlFrom(textFiles) } : {}),
        progress: progressSink(admin, (work) => after(work)),
        // A job run answers 202 before its searches; n8n is called after the reply.
        defer: (task) => after(task),
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
    // A stored review run's output (review mode is retired; Wave 3 releases
    // or refunds those rows) is held from its owner, never from an admin. The
    // profile is read only when such a row is there, and fails closed.
    const rows = data ?? [];
    const isAdmin = rows.some((r) => r.status === "review") && (await viewerIsAdmin(supabase, auth.user.id));
    const runs = rows.map((r) => runForViewer(r, isAdmin));
    return NextResponse.json({ runs }, { headers: NO_STORE });
  } catch (err) {
    console.error("[ai/runs] GET threw:", err);
    return NextResponse.json({ error: "تعذّر تحميل السجل" }, { status: 503, headers: NO_STORE });
  }
}
