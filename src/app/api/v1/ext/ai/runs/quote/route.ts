import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { practiceKindFromRead } from "@/lib/auth/courtPracticeDecision";
import { getAiTool } from "@/lib/ai/tools";
import { resolveToolRuntime, toolAvailability, toolRoleRefusal } from "@/lib/ai/aiToolsConfig";
import { readAiToolsSetting } from "@/lib/ai/runCore";
import { pointsShort } from "@/lib/ai/pointsStanding";
import { CONSULTANT_BLOCKED_MESSAGE } from "@/lib/auth/practiceKind";
import { parseExtRunRequest } from "@/lib/ext/extRuns";
import { extError, extJson, requireExtCaller } from "../../../_extAuth";

/**
 * POST /api/v1/ext/ai/runs/quote — the price and the balance BEFORE any charge.
 *
 * Read-only: it never calls ai_start_run, never reserves, never writes. The price is the
 * registry's own (spec.price over the validated input, the turn counted from this user's own
 * runs of the conversation), so nothing here knows a number. It refuses what the run would
 * refuse first (role, Art. 18, tool off, bad input), so a quote that says "can afford" is
 * not followed by a refusal the lawyer could have been told about.
 * Not answered: daily_remaining is null (the day's count lives in ai_start_run); the run's
 * own `quota_exceeded` is the authority.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const caller = await requireExtCaller(request, "ai:run");
  if (caller instanceof NextResponse) return caller;
  const rid = caller.requestId;
  try {
    const parsed = parseExtRunRequest(await request.json().catch(() => null), { needKey: false });
    if (!parsed.ok) return extError(parsed.status, parsed.code, parsed.error, rid);
    const { tool, input, conversationId } = parsed.value;
    const spec = getAiTool(tool);
    if (!spec) return extError(422, "validation", "أداة غير مدعومة عبر هذا الاتصال", rid);

    const admin = await createServiceClient();
    const profile = await admin.from("profiles").select("user_type").eq("id", caller.userId).maybeSingle();
    const userType = typeof profile.data?.user_type === "string" ? profile.data.user_type : "";
    const practiceKind =
      userType === "lawyer" || userType === "firm"
        ? practiceKindFromRead(await admin.from("lawyer_profiles").select("practice_kind").eq("user_id", caller.userId).maybeSingle()).practiceKind
        : "advocate";
    const isAdmin = userType === "admin";

    const refused = toolRoleRefusal(spec, { userType, practiceKind });
    if (refused === "role") return extError(403, "role_refused", "هذه الأداة غير متاحة لنوع حسابك", rid);
    if (refused === "consultant_blocked") return extError(403, "consultant_blocked", CONSULTANT_BLOCKED_MESSAGE, rid);
    const runtimeCfg = resolveToolRuntime(spec, await readAiToolsSetting(admin));
    if (toolAvailability(runtimeCfg.mode, isAdmin) === "tool_off") return extError(423, "tool_off", "هذه الأداة غير متاحة حالياً", rid);

    const checked = spec.validateInput(input);
    if (!checked.ok) return extError(422, "validation", checked.error, rid);

    // The turn: this user's own earlier runs of the conversation (a draft after an analysis is free).
    let turn = 0;
    if (conversationId) {
      const prior = await admin
        .from("ai_runs")
        .select("id")
        .eq("user_id", caller.userId)
        .eq("tool", spec.id)
        .eq("conversation_id", conversationId.toLowerCase())
        .in("status", ["running", "review", "succeeded"]);
      if (prior.error) return extError(503, "unavailable", "تعذّر حساب السعر الآن — حاول بعد قليل.", rid);
      turn = prior.data?.length ?? 0;
    }
    const price = isAdmin ? 0 : spec.price(checked.input, { pages: null, turn });

    const setting = await admin.from("platform_settings").select("value").eq("key", "points_enforcement").maybeSingle();
    const enforced = !setting.error && setting.data?.value === true;
    const bal = await admin.rpc("points_balance", { p_user: caller.userId });
    if (bal.error || !Number.isSafeInteger(bal.data)) return extError(503, "unavailable", "تعذّر قراءة رصيدك الآن — حاول بعد قليل.", rid);
    const balance = bal.data as number;

    return extJson(
      200,
      {
        request_id: rid,
        tool: spec.id,
        price_points: price,
        balance,
        can_afford: !pointsShort({ enforced, exempt: isAdmin, balance, price }),
        daily_remaining: null,
        ...(price === 0 && !isAdmin ? { note: "لا رسوم على هذه الخطوة — الصياغة بعد التحليل في المحادثة نفسها بلا رسوم إضافية." } : {}),
      },
      rid,
    );
  } catch (err) {
    console.error("[ext/ai/runs/quote] failed:", (err as { name?: string } | null)?.name ?? "error");
    return extError(503, "unavailable", "تعذّر حساب السعر الآن — حاول بعد قليل.", rid);
  }
}
