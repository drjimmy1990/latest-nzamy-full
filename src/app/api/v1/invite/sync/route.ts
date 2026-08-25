import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rateLimit";

/**
 * POST /api/v1/invite/sync — persist client-generated invite codes.
 *
 * src/lib/invitationStore.ts ("use client") generates NZM-INV-XXXX codes into
 * localStorage only — they never existed in `public.invitations`, so
 * /invite/[code] and POST /api/v1/invite/[code]/accept always 404'd on a
 * friend's browser ("رابط الدعوة غير صالح"). This route lets the owning,
 * now-authenticated client sync its locally-generated codes into the real
 * table so they become acceptable invites.
 *
 * Body: { codes: string[] }  — max 20 codes per request, each must match
 * CODE_RE. Requires an authenticated session (the inviter). Idempotent:
 * existing codes are left completely untouched (ON CONFLICT (code) DO
 * NOTHING) — a re-sync must never reset an already-accepted/expired/revoked
 * invitation back to 'pending'.
 *
 * invitations columns (supabase/migrations/20260706_content_and_ops.sql):
 *   code, inviter_id, invitee_email, invitee_phone, trial_days (default 14),
 *   tier, status (pending/accepted/expired/revoked), accepted_by,
 *   accepted_at, expires_at, created_at.
 *
 * Column choices for a freshly-synced invite (see final task report for the
 * full rationale):
 *   - status = 'pending' (explicit, though it is also the column default)
 *   - tier = null → /invite/[code]/accept already treats a null tier as
 *     'pro', which is the existing default for library colleague invites.
 *   - trial_days left UNSET → DB default (14). The client's local
 *     invitationStore promises 30/60/90 days based on the buyer's plan, but
 *     this endpoint's request body is intentionally just { codes } (no
 *     client-supplied trial length), so a caller cannot self-grant an
 *     arbitrary trial by tampering with the request. Follow-up: thread the
 *     plan-derived duration through server-side (e.g. resolved from the
 *     caller's own subscription) if the 14-day default is too short.
 *   - expires_at = now + 365 days, matching the "invitations valid for 1
 *     year" comment in invitationStore.ts so the server enforces the same
 *     window already advertised to the user.
 */

const CODE_RE = /^NZM-INV-[A-Z0-9-]{3,24}$/;
const MAX_CODES = 20;
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "غير مصرح — يرجى تسجيل الدخول" }, { status: 401 });
    }

    const rl = rateLimit(`invite-sync:${user.id}`, { limit: 10, windowMs: 60_000 });
    if (!rl.ok) {
      return NextResponse.json(
        { error: "طلبات كثيرة جداً — حاول لاحقاً" },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
      );
    }

    let body: { codes?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    }

    const rawCodes = Array.isArray(body.codes) ? body.codes : [];
    if (rawCodes.length === 0) {
      return NextResponse.json({ error: "لا توجد أكواد لمزامنتها" }, { status: 400 });
    }
    if (rawCodes.length > MAX_CODES) {
      return NextResponse.json(
        { error: `الحد الأقصى ${MAX_CODES} كوداً لكل طلب` },
        { status: 400 },
      );
    }

    const codes = Array.from(
      new Set(
        rawCodes
          .filter((c): c is string => typeof c === "string")
          .map((c) => c.trim().toUpperCase()),
      ),
    );

    const invalid = codes.filter((c) => !CODE_RE.test(c));
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: "صيغة كود الدعوة غير صالحة", invalid },
        { status: 400 },
      );
    }

    if (codes.length === 0) {
      return NextResponse.json({ success: true, data: { synced: 0 } });
    }

    const expiresAt = new Date(Date.now() + ONE_YEAR_MS).toISOString();

    const admin = await createServiceClient();
    const rows = codes.map((code) => ({
      code,
      inviter_id: user.id,
      status: "pending",
      tier: null,
      expires_at: expiresAt,
    }));

    const { error } = await admin
      .from("invitations")
      .upsert(rows, { onConflict: "code", ignoreDuplicates: true });

    if (error) {
      console.error("[invite/sync] Supabase error:", error.message, error.details, error.hint, error.code);
      return NextResponse.json({ error: "تعذّرت مزامنة أكواد الدعوة" }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: { synced: codes.length } });
  } catch (err) {
    console.error("[invite/sync] Unexpected error:", err);
    return NextResponse.json({ error: "حدث خطأ أثناء مزامنة الدعوات" }, { status: 500 });
  }
}
