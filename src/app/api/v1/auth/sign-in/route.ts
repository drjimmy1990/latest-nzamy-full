import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/sendEmail";
import { toArabicDigits } from "@/lib/services/arabicCount";
import {
  LOGIN_LOCKED_AR,
  LOGIN_LOCKED_CODE,
  isCredentialFailure,
  isHookLockRefusal,
  loginLockedEmail,
  parseSignInBody,
  type LoginIdentifier,
} from "@/lib/auth/loginLockout";
import { loginLockKey } from "@/lib/auth/loginLockoutKey";

/**
 * POST /api/v1/auth/sign-in — the password sign-in with a per-account lockout
 * (owner file 10 ب23, batch l12-access).
 *
 * Body: { email | phone (E.164), password, captchaToken? } — what the login
 * page used to hand supabase.auth.signInWithPassword in the browser. The
 * Turnstile token is passed on to GoTrue, which still checks it.
 *
 *   423 { code: "login_locked", error }  the identifier (or its account) is locked
 *   401 { authError: { message, code, status } }  GoTrue refused — the page
 *        translates it exactly as before (translateAuthError, context "login")
 *   400 { error }  a body without an identifier / password
 *   200 { ok: true }  signed in; the session cookies are set on this response
 *
 * The counter (20261202_20): max_failures wrong passwords inside
 * window_minutes lock the identifier for lock_minutes (platform_settings
 * 'auth_login_lockout', 5 / 15 / 15). Counted whether or not an account
 * exists, and answered with the same words, so nothing tells an attacker
 * which addresses have accounts. Only a credential failure counts. When a
 * lock starts, the account (if one exists) gets ONE e-mail through
 * sendEmail. Until the SQL has run (or if a lockout call fails) the route
 * signs in exactly as before — fail open, logged.
 *
 * A script that calls GoTrue directly skips this route (Turnstile still
 * applies there). The GoTrue hook in the same migration would close that,
 * but it stays OFF: GoTrue calls it only for existing accounts, so it would
 * tell real addresses from unknown ones (the owner decides that trade).
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const MISSING = new Set(["42883", "PGRST202", "42P01", "PGRST205"]);
let warnedMissing = false;

type Rpc = Awaited<ReturnType<typeof createServiceClient>>;

function idArgs(id: LoginIdentifier) {
  return { p_email: id.kind === "email" ? id.value : null, p_phone: id.kind === "phone" ? id.value : null };
}

function logRpcError(where: string, error: { code?: string } | null) {
  if (!error) return;
  if (MISSING.has(error.code ?? "")) {
    if (!warnedMissing) console.warn("[auth/sign-in] 20261202_20 has not run — signing in without the lockout");
    warnedMissing = true;
    return;
  }
  console.error(`[auth/sign-in] ${where} failed:`, error.code);
}

async function lockStatus(service: Rpc, key: string, id: LoginIdentifier): Promise<{ locked: boolean; until: string | null }> {
  try {
    const { data, error } = await service.rpc("auth_login_lock_status", { p_key: key, ...idArgs(id) });
    if (error) {
      logRpcError("lock status", error);
      return { locked: false, until: null };
    }
    const d = data as { locked?: unknown; locked_until?: unknown } | null;
    return { locked: d?.locked === true, until: typeof d?.locked_until === "string" ? d.locked_until : null };
  } catch {
    return { locked: false, until: null };
  }
}

async function record(service: Rpc, key: string, id: LoginIdentifier, ok: boolean): Promise<{ locked: boolean; until: string | null }> {
  try {
    const { data, error } = await service.rpc("auth_login_record", { p_key: key, ...idArgs(id), p_ok: ok });
    if (error) {
      logRpcError("record", error);
      return { locked: false, until: null };
    }
    const d = data as { locked?: unknown; locked_until?: unknown } | null;
    return { locked: d?.locked === true, until: typeof d?.locked_until === "string" ? d.locked_until : null };
  } catch {
    return { locked: false, until: null };
  }
}

/** The lock e-mail, once per lock, to the account's own address (if there is an account). */
async function notifyOnce(service: Rpc, key: string, id: LoginIdentifier, until: string | null): Promise<void> {
  try {
    const { data, error } = await service.rpc("auth_login_claim_notice", { p_key: key, ...idArgs(id) });
    if (error) {
      logRpcError("claim notice", error);
      return;
    }
    if (typeof data !== "string" || !data.includes("@")) return;
    const ms = until ? Date.parse(until) - Date.now() : NaN;
    const minutes = Number.isFinite(ms) && ms > 0 ? Math.ceil(ms / 60_000) : null;
    const span = minutes === null ? "مدةً قصيرة" : minutes <= 10 ? `لمدة ${toArabicDigits(String(minutes))} دقائق` : `لمدة ${toArabicDigits(String(minutes))} دقيقة`;
    const mail = loginLockedEmail(span);
    await sendEmail({ to: data, subject: mail.subject, text: mail.text, tag: "login_locked" });
  } catch {
    console.error("[auth/sign-in] lock e-mail failed");
  }
}

const locked = () =>
  NextResponse.json({ error: LOGIN_LOCKED_AR, code: LOGIN_LOCKED_CODE }, { status: 423, headers: NO_STORE });

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400, headers: NO_STORE });
  }
  const body = parseSignInBody(raw);
  if (!body.ok) return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400, headers: NO_STORE });

  const key = loginLockKey(body.id);
  let service: Rpc | null = null;
  try {
    service = await createServiceClient();
  } catch {
    console.error("[auth/sign-in] service client unavailable — signing in without the lockout");
  }

  if (service) {
    const before = await lockStatus(service, key, body.id);
    if (before.locked) {
      await notifyOnce(service, key, body.id, before.until);
      return locked();
    }
  }

  const supabase = await createClient();
  const options = body.captchaToken ? { options: { captchaToken: body.captchaToken } } : {};
  const credentials =
    body.id.kind === "email"
      ? { email: body.id.value, password: body.password, ...options }
      : { phone: body.id.value, password: body.password, ...options };
  const { data, error } = await supabase.auth.signInWithPassword(credentials);

  if (error || !data?.user) {
    if (service && isHookLockRefusal(error)) {
      const now = await lockStatus(service, key, body.id);
      await notifyOnce(service, key, body.id, now.until);
      return locked();
    }
    if (service && isCredentialFailure(error)) {
      const after = await record(service, key, body.id, false);
      if (after.locked) {
        // The attempt that reached the maximum is answered with the lock itself.
        await notifyOnce(service, key, body.id, after.until);
        return locked();
      }
    }
    const e = (error ?? {}) as { message?: unknown; code?: unknown; status?: unknown };
    return NextResponse.json(
      {
        authError: {
          message: typeof e.message === "string" ? e.message : "Invalid login credentials",
          code: typeof e.code === "string" ? e.code : undefined,
          status: typeof e.status === "number" ? e.status : 400,
        },
      },
      { status: 401, headers: NO_STORE },
    );
  }

  if (service) await record(service, key, body.id, true);
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
