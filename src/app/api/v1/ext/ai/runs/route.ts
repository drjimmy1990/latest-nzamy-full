import { after, NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { practiceKindFromRead } from "@/lib/auth/courtPracticeDecision";
import { callN8n } from "@/lib/ai/n8nClient";
import { embedQueryWithin, graphRagEnabled } from "@/lib/ai/graphRagSwitch";
import { retrieveLibrary } from "@/lib/ai/retrieval";
import { withGraphCallLog } from "@/lib/ai/graphCallLog";
import { startRunWith, type RunActor } from "@/lib/ai/runCore";
import { progressSink } from "@/lib/ai/progressEvents";
import { namespacedKey, parseExtRunRequest, toExtStartReply } from "@/lib/ext/extRuns";
import { extError, extJson, requireExtCaller } from "../../_extAuth";
import { extLibraryAccess } from "../../_extLibraryAccess";

/**
 * POST /api/v1/ext/ai/runs — start a run for a bearer-token caller (the MCP server).
 *
 * A thin adapter over startRunWith, the path the website uses: the same role / Art. 18 /
 * tool-mode / daily-limit / charge / refund / n8n steps. No second pipeline, no price here.
 * Differences from /api/v1/ai/runs, all deliberate: token auth (_extAuth), the library gate
 * keyed by the token's user (_extLibraryAccess), an allowlist of tools (extRuns.ts), no files
 * and no case loader (v1), the idempotency key namespaced by token, and the contract's flat
 * snake_case replies. A repeat of the same key answers 200 with charged_points 0.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function callbackUrl(): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "") ?? "";
  return /^https:\/\//.test(site) ? `${site}/api/v1/ai/callback` : "";
}

export async function POST(request: NextRequest) {
  const caller = await requireExtCaller(request, "ai:run");
  if (caller instanceof NextResponse) return caller;
  const rid = caller.requestId;
  try {
    const parsed = parseExtRunRequest(await request.json().catch(() => null), { needKey: true });
    if (!parsed.ok) return extError(parsed.status, parsed.code, parsed.error, rid);
    const { tool, input, idempotencyKey, conversationId } = parsed.value;

    const admin = await createServiceClient();
    const profile = await admin.from("profiles").select("user_type, display_name").eq("id", caller.userId).maybeSingle();
    const userType = typeof profile.data?.user_type === "string" ? profile.data.user_type : "";
    // Art. 18: same read and same fail-open-to-advocate rule as /api/v1/ai/runs.
    const practice =
      userType === "lawyer" || userType === "firm"
        ? practiceKindFromRead(await admin.from("lawyer_profiles").select("practice_kind").eq("user_id", caller.userId).maybeSingle()).practiceKind
        : "advocate";
    const actor: RunActor = {
      userId: caller.userId,
      userType,
      practiceKind: practice,
      displayName: typeof profile.data?.display_name === "string" ? profile.data.display_name : null,
    };

    const graphOn = graphRagEnabled();
    const reply = await startRunWith(
      admin,
      {
        callbackUrl: callbackUrl(),
        n8n: (call) => callN8n({ ...call, baseUrl: process.env.N8N_AI_BASE_URL, key: process.env.NZAMY_AI_KEY }),
        libraryAccess: (toolId) => extLibraryAccess(caller.userId, toolId),
        ...(graphOn ? { embedQuery: (text: string) => embedQueryWithin(text) } : {}),
        retrieve: (queries, limits, pin, opts) =>
          retrieveLibrary(admin, queries, limits, pin, undefined, graphOn ? withGraphCallLog(opts ?? { useGraph: true }, admin, "ai_run") : undefined),
        progress: progressSink(admin, (work) => after(work)),
        defer: (task) => after(task),
      },
      actor,
      {
        tool,
        input,
        idempotencyKey: namespacedKey(caller.tokenId, idempotencyKey),
        ...(conversationId ? { conversationId } : {}),
      },
    );
    const out = toExtStartReply(reply, rid);
    return extJson(out.status, out.body, rid);
  } catch (err) {
    console.error("[ext/ai/runs] POST failed:", (err as { name?: string } | null)?.name ?? "error");
    return extError(503, "unavailable", "تعذّر بدء الأداة الآن — حاول بعد قليل.", rid);
  }
}
