import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isAuthUnavailable, authUnavailableResponse, frozenAccountResponse } from "@/lib/auth/apiAuth";
import { isPracticeKind } from "@/lib/auth/claimKinds";

/**
 * /api/v1/onboarding/practice-kind — R9 (owner TODO 17 Nov 2026), migration
 * 20261126_50.
 *
 * A lawyer who reached `lawyer` through the Google claim BEFORE R9 was never
 * asked «محامٍ مترافع أم مستشار قانوني؟»: his lawyer_profiles row reads the
 * column default 'advocate' with practice_kind_confirmed_at NULL. The lawyer
 * dashboard sends him to /onboarding/practice-kind, which uses this route.
 *
 * GET  → { needsChoice: boolean }  (false for every non-lawyer and every
 *        lawyer who answered — the register form's cards, or the claim)
 * POST { practiceKind: 'advocate' | 'consultant' } → { ok: true, practiceKind }
 *      Once only: the write is a compare-and-swap on
 *      practice_kind_confirmed_at IS NULL. Changing an answered kind stays an
 *      admin action (the column has no session grant at all).
 *
 * Service client for the read and the write (the column carries no session
 * privilege), keyed on the session's own id — never an id from the body.
 */

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };
const LOG = "[onboarding/practice-kind]";

/** profiles.user_type of the session (its own row, RLS-scoped). */
async function readIsLawyer(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: profile, error } = await supabase.from("profiles").select("user_type").eq("id", userId).maybeSingle();
  if (error) console.error(`${LOG} profile read failed:`, error.message, error.code);
  return { failed: !!error, isLawyer: profile?.user_type === "lawyer" };
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (isAuthUnavailable(user, authError)) return authUnavailableResponse();
    if (!user) return NextResponse.json({ error: "غير مصرح — يرجى تسجيل الدخول." }, { status: 401 });
    const s = { user, ...(await readIsLawyer(supabase, user.id)) };
    if (!s.isLawyer) return NextResponse.json({ needsChoice: false }, { headers: NO_STORE });
    const service = await createServiceClient();
    const { data, error } = await service
      .from("lawyer_profiles")
      .select("practice_kind_confirmed_at")
      .eq("user_id", s.user.id)
      .maybeSingle();
    if (error) {
      // 42703: 20261126_50 has not run — nobody can be asked yet; never block the dashboard.
      if (error.code !== "42703") console.error(`${LOG} GET read failed:`, error.message, error.code);
      return NextResponse.json({ needsChoice: false, unavailable: true }, { headers: NO_STORE });
    }
    const needsChoice = !!data && (data as { practice_kind_confirmed_at: string | null }).practice_kind_confirmed_at === null;
    return NextResponse.json({ needsChoice }, { headers: NO_STORE });
  } catch (err) {
    console.error(`${LOG} GET unexpected:`, err);
    return NextResponse.json({ needsChoice: false, unavailable: true }, { headers: NO_STORE });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (isAuthUnavailable(user, authError)) return authUnavailableResponse();
    if (!user) return NextResponse.json({ error: "غير مصرح — يرجى تسجيل الدخول." }, { status: 401 });
    const frozen = frozenAccountResponse(user);
    if (frozen) return frozen;
    const body = (await request.json().catch(() => null)) as { practiceKind?: unknown } | null;
    const practiceKind = body?.practiceKind;
    if (!isPracticeKind(practiceKind)) {
      return NextResponse.json({ error: "اختر: محامٍ أو مستشار قانوني." }, { status: 400 });
    }
    const s = { user, ...(await readIsLawyer(supabase, user.id)) };
    if (s.failed) return NextResponse.json({ error: "تعذّر قراءة بيانات حسابك." }, { status: 500 });
    if (!s.isLawyer) {
      return NextResponse.json({ error: "هذا السؤال لحسابات المحامين فقط." }, { status: 403 });
    }
    const service = await createServiceClient();
    const { data, error } = await service
      .from("lawyer_profiles")
      .update({ practice_kind: practiceKind, practice_kind_confirmed_at: new Date().toISOString() })
      .eq("user_id", s.user.id)
      .is("practice_kind_confirmed_at", null)
      .select("practice_kind");
    if (error) {
      console.error(`${LOG} POST write failed:`, error.message, error.code);
      return NextResponse.json({ error: "تعذّر حفظ صفتك المهنية. حاول مرة أخرى." }, { status: 500 });
    }
    if ((data?.length ?? 0) !== 1) {
      return NextResponse.json(
        { error: "صفتك المهنية محددة مسبقاً. لتغييرها تواصل مع إدارة المنصّة." },
        { status: 409 },
      );
    }
    // The trace is the row itself: practice_kind_confirmed_at is the moment he
    // answered (admin_audit_events is written by adminAudit.ts and the claim only).
    return NextResponse.json({ ok: true, practiceKind });
  } catch (err) {
    console.error(`${LOG} POST unexpected:`, err);
    return NextResponse.json({ error: "تعذّر حفظ صفتك المهنية. حاول مرة أخرى." }, { status: 500 });
  }
}
