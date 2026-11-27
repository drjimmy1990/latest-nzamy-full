import { after, NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requireApiUser } from "@/lib/auth/apiAuth";
import { practiceKindFromRead } from "@/lib/auth/courtPracticeDecision";
import { callN8n } from "@/lib/ai/n8nClient";
import { embedQueryWithin, graphRagEnabled } from "@/lib/ai/graphRagSwitch";
import { retrieveLibrary } from "@/lib/ai/retrieval";
import { articleOpenForViewer } from "@/lib/library/articleOpenServer";
import { withGraphCallLog } from "@/lib/ai/graphCallLog";
import { resolveAiFiles } from "@/lib/ai/aiFiles";
import { aiTextFilesConfig, pastedFileUrlFrom } from "@/lib/ai/textFilesConfig";
import { startRunWith, type RouteReply, type RunActor } from "@/lib/ai/runCore";
import { readConsultantStanding } from "@/lib/auth/consultantScopeServer";
import { freeQuestionStatusWith, freeQuestionToolOf, previewOnlySources } from "@/lib/ai/freeQuestion";
import { progressSink } from "@/lib/ai/progressEvents";
import { runForViewer, viewerIsAdmin } from "@/lib/ai/runVisibility";
import { libraryGate } from "@/lib/library-gate";
import { libraryAiAccess } from "@/app/api/ai/_libraryAiAccess";
import { libraryRunAccess, libraryRunCreated } from "@/lib/ai/libraryRunAccess";
import { libraryReadQuotaHit } from "@/lib/library/readQuotaServer";
import { isLibraryAiTool } from "@/lib/library/readQuota";
import { recordLibraryActivity } from "@/lib/library/activityMeterServer";
import { assistantGuardState } from "@/lib/ai/assistantGuard";
import { loadAssistantCase, type CaseReader } from "@/lib/ai/assistantCase";
import { verifiedProviderDecision } from "@/lib/auth/verifiedProvider";
import { readVerifiedProviderFacts } from "@/lib/auth/verifiedProviderRead";

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
 * assistant's rule, Pro or higher or a platform admin (owner ٢٠٦ / ٢٠٩), the
 * same two checks the deleted free route /api/ai/library-chat made. An active
 * founder member passes for the founder plan's own tools (0.5) and the
 * library assistant; an active library subscriber for the library assistant
 * only (owner ٥ / ١٥, 17 Nov 2026). Every run is still charged.
 */
async function libraryAccess(toolId: string, freeOpensTier?: (toolId: string) => Promise<boolean>): Promise<RouteReply | null> {
  // Owner item 9.7 (batch l8): the per-account library lock applies to the
  // library assistant only, never to the drafter, contract review, legal
  // opinion or the other lawyers' tools that also read the library.
  // Register 4 / 36 (batch l9): an individual's free questions are on
  // quick-answer, so while he has some left they open its Pro rule (the
  // library's closed switch still applies) — otherwise a free-tier individual
  // could never use them. Once they are gone the Pro rule is back.
  // Q121 (batch l12): the same for every account's OWN free tool — a
  // lawyer's 10 on the library assistant open its professional-plan rule
  // too (the per-account library lock still applies first). Its sources
  // stay the locked 100-character preview without the library.
  // Q121 (l12): the tier rule first; the free questions are asked only when it
  // refuses, so the opener knows the run is rescued by them (preview only).
  const gateRefused = await libraryGate({ accountLock: isLibraryAiTool(toolId) });
  const tierRefused = gateRefused ? null : await libraryAiAccess(toolId);
  const refused = gateRefused ?? (tierRefused && freeOpensTier && (await freeOpensTier(toolId)) ? null : tierRefused);
  if (!refused) return null;
  const body = (await refused.json().catch(() => ({}))) as Record<string, unknown>;
  const code = typeof body.code === "string" ? body.code : body.libraryClosed ? "library_closed" : "library_tier";
  return { status: refused.status, body: { ...body, code } };
}

/**
 * The gate above, then, for the library's own AI (readQuota.isLibraryAiTool),
 * what the proxy does on the library's other reads: a reader under a library
 * lock gets the lock's 423 and its message (readQuota.quotaRefusal),
 * uncharged. The lock check fails open and exempts admins, as in the proxy
 * (readQuotaServer.ts). The branches are src/lib/ai/libraryRunAccess.ts.
 */
function libraryAccessFor(userId: string, freeOpensTier?: (toolId: string) => Promise<boolean>) {
  return libraryRunAccess({
    gate: (toolId) => libraryAccess(toolId, freeOpensTier),
    lockRow: () => libraryReadQuotaHit(userId, null, { memoLockCheck: true }),
    now: () => Date.now(),
  });
}

/**
 * Owner ٨ / ١٥ / ١٨ (SQL 20261124_10): does the user hold founder library
 * points — a 'library_question' credit with questions left, not past its end?
 * The seat being active is checked again by ai_start_run_with_credit (a
 * revoked seat answers no_credit and the run is charged points). Any read
 * error, the table or kind missing, answers false: points as usual.
 */
async function founderLibraryCredit(admin: Awaited<ReturnType<typeof createServiceClient>>, userId: string): Promise<boolean> {
  const { data, error } = await admin
    .from("membership_credits")
    .select("id")
    .eq("user_id", userId)
    .eq("kind", "library_question")
    .gt("remaining", 0)
    .gt("ends_at", new Date().toISOString())
    .limit(1);
  if (error) {
    if (error.code !== "42P01" && error.code !== "PGRST205") {
      console.error("[ai/runs] founder library credit read failed:", error.code);
    }
    return false;
  }
  return Array.isArray(data) && data.length > 0;
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
    const admin = await createServiceClient();
    // Q121 (batch l12): the account's free-question tool (an individual's from
    // the setting free_question_tool_by_account_type; everyone else: the
    // library assistant).
    const freeTool = await freeQuestionToolOf(admin, userType);
    // Q121: set when the account's free questions opened the library
    // assistant (no plan or grant of its own): its sources are then the locked
    // 100-character preview — also for a paid fallback if the last free
    // question was taken meanwhile.
    let previewOnly = false;
    const actor: RunActor = {
      userId: user.id,
      userType,
      practiceKind: practice,
      displayName: typeof profile?.display_name === "string" ? profile.display_name : null,
      freeQuestionTool: freeTool,
      // Owner decision (22-23 Nov 2026): a consultant's firm membership, read for a consultant only.
      ...(practice === "consultant" ? { firmMember: (await readConsultantStanding(supabase, user.id)).firmMember } : {}),
    };

    const graphOn = graphRagEnabled();
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
        // Register 4 / 36 (l9) + Q121 (l12): an e-mail-verified account with
        // free questions left passes its OWN free tool's Pro rule — the
        // individual's quick-answer, the lawyer's library assistant (any read
        // error: no).
        // Only while points_enforcement is on: when it is off,
        // ai_start_free_question starts a plain run and spends none of the
        // allowance, so the opener would never close.
        libraryAccess: libraryAccessFor(user.id, async (toolId) => {
          if (toolId !== freeTool) return false;
          if (!user.email_confirmed_at) return false;
          try {
            const enforcement = await admin.from("platform_settings").select("value").eq("key", "points_enforcement").maybeSingle();
            if (enforcement.error || (enforcement.data as { value?: unknown } | null)?.value !== true) return false;
            const opens = (await freeQuestionStatusWith(admin, user.id)).available;
            if (opens && isLibraryAiTool(toolId)) previewOnly = true;
            return opens;
          } catch {
            return false;
          }
        }),
        onRunCreated: libraryRunCreatedFor(user.id),
        // The founder's 100 library points (20 questions) pay for library-assistant first.
        founderLibraryCredit: (userId) => founderLibraryCredit(admin, userId),
        // Owner ٣٠ (l7): the account's free questions, once (10 lawyer on the library
        // assistant / 5 individual on quick-answer — register 4 / 36, l9; runCore
        // asks only on the account's own free tool).
        // ٥٨ (batch l8): only for an e-mail-verified account (the SQL checks it
        // too, with the library being open for the account's type).
        freeQuestions: async (userId) =>
          Boolean(user.email_confirmed_at) && (await freeQuestionStatusWith(admin, userId)).available,
        // GraphRAG only behind NZAMY_GRAPH_RAG=on (graphRagSwitch): off, the
        // run never embeds the question and never calls the graph.
        ...(graphOn ? { embedQuery: (text: string) => embedQueryWithin(text) } : {}),
        // Each graph call leaves one row in library_graph.call_log (20261121_10):
        // path, time, fallback reason; never the question. Not awaited.
        // Owner ٢٣٦ (l18 review): «اشرح لي» pins an article — dropped when that
        // article is locked to the caller (the law route's rule, on the
        // article's own law), so its text is never the run's first source.
        retrieve: async (queries, limits, pin, opts) => {
          let usedPin = pin;
          if (pin?.articleId && !(await articleOpenForViewer(admin, user.id, pin.articleId))) {
            const { articleId: _locked, ...rest } = pin;
            void _locked;
            usedPin = rest;
          }
          const r = await retrieveLibrary(
            admin,
            queries,
            limits,
            usedPin,
            undefined,
            graphOn ? withGraphCallLog(opts ?? { useGraph: true }, admin, "ai_run") : undefined,
          );
          return previewOnly ? previewOnlySources(r) : r;
        },
        resolveFiles: (userId, fileIds, rules) => resolveAiFiles(admin, userId, fileIds, rules, new Date(), textFiles ? { textFiles } : {}),
        // T17a: «قضية محددة» — the caller's OWN case, read on HIS RLS client
        // (never the service role), own rows only (assistantCase.ts).
        loadCase: async (userId, caseId) =>
          (await loadAssistantCase(supabase as unknown as CaseReader, userId, caseId)) as Record<string, unknown> | null,
        ...(textFiles ? { pastedFileUrl: pastedFileUrlFrom(textFiles) } : {}),
        progress: progressSink(admin, (work) => after(work)),
        // A job run answers 202 before its searches; n8n is called after the reply.
        defer: (task) => after(task),
        // Owner ١٣ / ٢٢: the anti-extraction block and per-minute counters (per process).
        promptGuard: assistantGuardState,
        // Owner س٢١٤ (batch l16): a drafting tool runs only for a verified
        // licence — the contracts / invoices rule (verifiedProvider.ts), read
        // with the service client for the id requireApiUser verified.
        verifiedProvider: async (userId, type) => verifiedProviderDecision(await readVerifiedProviderFacts(admin, userId, type)),
      },
      actor,
      body,
    );
    return NextResponse.json(reply.body, { status: reply.status, headers: NO_STORE });
  } catch (err) {
    console.error("[ai/runs] POST failed:", (err as { name?: string } | null)?.name ?? "error");
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
