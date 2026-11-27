import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requireApiUser } from "@/lib/auth/apiAuth";
import {
  FLOATING_FREE_QUESTION_TOOL,
  FREE_QUESTION_TOOL,
  freeQuestionStatusWith,
  freeQuestionToolOf,
  parseFreeQuestionTool,
} from "@/lib/ai/freeQuestion";
import { readAiToolsSetting } from "@/lib/ai/runCore";
import { resolveToolRuntime, toolAvailability } from "@/lib/ai/aiToolsConfig";
import { AI_TOOLS } from "@/lib/ai/tools";
import { readLibraryAccountAccess } from "@/lib/library/accountAccessServer";
import { enforceLibraryDevice } from "@/lib/library/deviceLimitServer";

/**
 * GET /api/v1/ai/free-question — owner ٣٠ (18 Nov 2026, batch l7): the signed-in
 * user's free library-assistant questions, given ONCE per account (10 for a
 * lawyer, 5 for an individual; platform_settings free_questions_by_account_type).
 * `{ available, left, total }`. Read-only.
 *
 * The count is the database's (ai_free_question_status, 20261127_40); any error
 * — the SQL not run yet included — answers «none left», so the library
 * assistant shows its normal price and promises nothing.
 *
 * /api/v1/ai/* gets no 401 from the proxy, so the sign-in check is here.
 *
 * ٥٨ (batch l8): none for an account whose e-mail is not verified, nor while
 * the library is locked for its type (owner item 9.7) — they come back when
 * it reopens. ai_free_question_status (20261128_20) applies the same two rules.
 *
 * Register 4 / 36 (batch l9, 20261129_60): `?tool=quick-answer` asks for the
 * general assistant's questions (an individual's), the default
 * `library-assistant` for the library's (everyone else's). The answer is
 * NONE when the tool asked is not the account's own free tool; the library
 * lock applies only to the library assistant's.
 *
 * Q121 (batch l12): an individual's tool comes from the setting
 * free_question_tool_by_account_type (quick-answer by default; `?tool=assistant`
 * when it is switched to «المساعد المتقدم»).
 *
 * Q181 (batch l13): `?tool=floating` — «مساعد نظامي», the individual's default.
 * The window offers a free answer only on this reply, so it is NONE unless
 * the run would really go through: the tool is open for users (ai_tools mode)
 * and points_enforcement is on (off, the runs route does not let the free
 * questions open the library's tier rule, and no use is counted).
 *
 * l19 review (B2, owner ٢٣٣): device-checked like a run (the account rule;
 * switch off = no effect, fail-open). A refused device gets the 403 refusal,
 * which every caller reads as «no free questions».
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "private, no-store" };
const NONE = { available: false, left: 0, total: 0 };

/** Q181: would a floating run start for a user now? Any read error → no. */
async function floatingRunsNow(admin: Awaited<ReturnType<typeof createServiceClient>>): Promise<boolean> {
  try {
    const enforcement = await admin.from("platform_settings").select("value").eq("key", "points_enforcement").maybeSingle();
    if (enforcement.error || (enforcement.data as { value?: unknown } | null)?.value !== true) return false;
    const runtime = resolveToolRuntime(AI_TOOLS[FLOATING_FREE_QUESTION_TOOL], await readAiToolsSetting(admin));
    return toolAvailability(runtime.mode, false) === "ok";
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const auth = await requireApiUser(supabase, { error: "سجّل الدخول لاستخدام أدوات الذكاء الاصطناعي" });
    if (auth instanceof NextResponse) return auth;
    const deviceRefusal = await enforceLibraryDevice(auth.user.id, true);
    if (deviceRefusal) return deviceRefusal;
    if (!auth.user.email_confirmed_at) return NextResponse.json(NONE, { headers: NO_STORE });
    const asked = parseFreeQuestionTool(new URL(request.url).searchParams.get("tool") ?? FREE_QUESTION_TOOL);
    if (!asked) return NextResponse.json(NONE, { headers: NO_STORE });
    const admin = await createServiceClient();
    const { data: profile } = await admin.from("profiles").select("user_type").eq("id", auth.user.id).maybeSingle();
    if (asked !== (await freeQuestionToolOf(admin, profile?.user_type))) return NextResponse.json(NONE, { headers: NO_STORE });
    if (asked === FREE_QUESTION_TOOL && !(await readLibraryAccountAccess(auth.user.id)).allowed) {
      return NextResponse.json(NONE, { headers: NO_STORE });
    }
    if (asked === FLOATING_FREE_QUESTION_TOOL && !(await floatingRunsNow(admin))) return NextResponse.json(NONE, { headers: NO_STORE });
    const status = await freeQuestionStatusWith(admin, auth.user.id);
    return NextResponse.json(status, { headers: NO_STORE });
  } catch (err) {
    console.error("[ai/free-question] GET failed:", (err as { name?: string } | null)?.name ?? "error");
    return NextResponse.json(NONE, { headers: NO_STORE });
  }
}
