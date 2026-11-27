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
import {
  PHONE_SIGN_IN_REFUSAL_FLOOR_MS,
  phoneSignInLockKeys,
  phoneSignInSinkAddress,
  phoneSignInVerdict,
  phoneTargetFromRpc,
  type PhoneSignInTarget,
} from "@/lib/auth/phoneSignIn";

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
 *   503 { error }  the service client is unavailable (l16 D-31, fail closed)
 *   200 { ok: true }  signed in; the session cookies are set on this response
 *
 * The counter (20261202_20): max_failures wrong passwords inside
 * window_minutes lock the identifier for lock_minutes (platform_settings
 * 'auth_login_lockout', 5 / 15 / 15). Counted whether or not an account
 * exists, and answered with the same words, so nothing tells an attacker
 * which addresses have accounts. Only a credential failure counts. When a
 * lock starts, the account (if one exists) gets ONE e-mail through
 * sendEmail. Until the SQL has run (or if a lockout call fails) the route
 * signs in exactly as before — fail open, logged. The service client itself
 * missing is different (l16 D-31): then nothing can be counted at all, so the
 * sign-in is refused — 503 { error }.
 *
 * A Saudi mobile (batch l18, LIVE-05): GoTrue holds no phone for anyone (every
 * account signs up by e-mail), so the number is looked up here —
 * public.phone_sign_in_target (20261208_20) names the account only when
 * EXACTLY ONE account has it confirmed — and the e-mail + password sign-in
 * runs for that account's address. An unknown or shared number signs in a
 * throw-away address instead, and every refusal on this path is the one
 * wrong-password answer (src/lib/auth/phoneSignIn.ts). When the number names
 * an account, its tries are checked AND counted under the typed number's key
 * and the account address's key (phoneSignInLockKeys): one budget for the
 * account, whichever identifier is typed, and the lock e-mail reaches the
 * owner. Every refusal on the mobile path is held to
 * PHONE_SIGN_IN_REFUSAL_FLOOR_MS from the start of the request, so its time
 * does not tell a number with an account from one without.
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

/** The lock e-mail, once per lock, to the account's own address (if there is an account). True when it went out. */
async function notifyOnce(service: Rpc, key: string, id: LoginIdentifier, until: string | null): Promise<boolean> {
  try {
    const { data, error } = await service.rpc("auth_login_claim_notice", { p_key: key, ...idArgs(id) });
    if (error) {
      logRpcError("claim notice", error);
      return false;
    }
    if (typeof data !== "string" || !data.includes("@")) return false;
    const ms = until ? Date.parse(until) - Date.now() : NaN;
    const minutes = Number.isFinite(ms) && ms > 0 ? Math.ceil(ms / 60_000) : null;
    const span = minutes === null ? "مدةً قصيرة" : minutes <= 10 ? `لمدة ${toArabicDigits(String(minutes))} دقائق` : `لمدة ${toArabicDigits(String(minutes))} دقيقة`;
    const mail = loginLockedEmail(span);
    await sendEmail({ to: data, subject: mail.subject, text: mail.text, tag: "login_locked" });
    return true;
  } catch {
    console.error("[auth/sign-in] lock e-mail failed");
    return false;
  }
}

type LockAnswer = { locked: boolean; until: string | null };

/** Every key's lock state; locked when ANY key is (l18 review: one budget per account). */
async function lockStatusAll(service: Rpc, keys: readonly string[], id: LoginIdentifier): Promise<LockAnswer[]> {
  const out: LockAnswer[] = [];
  for (const k of keys) out.push(await lockStatus(service, k, id));
  return out;
}

/** One attempt recorded under every key. */
async function recordAll(service: Rpc, keys: readonly string[], id: LoginIdentifier, ok: boolean): Promise<LockAnswer[]> {
  const out: LockAnswer[] = [];
  for (const k of keys) out.push(await record(service, k, id, ok));
  return out;
}

/** The lock e-mail for the first locked key that still owes one (at most one e-mail per answer). */
async function notifyLocked(service: Rpc, keys: readonly string[], states: readonly LockAnswer[], id: LoginIdentifier): Promise<void> {
  for (let i = 0; i < keys.length; i += 1) {
    if (states[i]?.locked && (await notifyOnce(service, keys[i], id, states[i].until))) return;
  }
}

let warnedResolverMissing = false;

/** The one account that has this mobile confirmed, or null (none, shared, or the lookup failed — fail closed). */
async function phoneTarget(service: Rpc, e164: string): Promise<PhoneSignInTarget | null> {
  try {
    const { data, error } = await service.rpc("phone_sign_in_target", { p_phone: e164 });
    if (error) {
      if (MISSING.has(error.code ?? "")) {
        if (!warnedResolverMissing) console.warn("[auth/sign-in] 20261208_20 has not run — a mobile cannot sign in yet");
        warnedResolverMissing = true;
      } else {
        console.error("[auth/sign-in] phone lookup failed:", error.code);
      }
      return null;
    }
    return phoneTargetFromRpc(data);
  } catch {
    console.error("[auth/sign-in] phone lookup failed");
    return null;
  }
}

const locked = () =>
  NextResponse.json({ error: LOGIN_LOCKED_AR, code: LOGIN_LOCKED_CODE }, { status: 423, headers: NO_STORE });

export async function POST(request: Request) {
  const startedAt = Date.now();
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400, headers: NO_STORE });
  }
  const body = parseSignInBody(raw);
  if (!body.ok) return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400, headers: NO_STORE });

  const key = loginLockKey(body.id);
  // l16 D-31: fail CLOSED — without the service client the lockout can neither
  // be read nor counted, so the sign-in is refused (503) instead of letting an
  // unlimited run of password guesses through.
  let service: Rpc;
  try {
    service = await createServiceClient();
  } catch {
    console.error("[auth/sign-in] service client unavailable — sign-in refused (lockout cannot be checked)");
    return NextResponse.json(
      { error: "تعذّر تسجيل الدخول الآن. حاول مرة أخرى بعد قليل." },
      { status: 503, headers: NO_STORE },
    );
  }

  // LIVE-05: a mobile names its account here, or nobody. The lock functions
  // are told the account's address (so a lock reaches its owner by e-mail).
  // l18 review: a mobile that names an account is checked and counted under
  // its own key AND the account address's key — one budget per account.
  const target = body.id.kind === "phone" ? await phoneTarget(service, body.id.value) : null;
  const lockId: LoginIdentifier = target ? { kind: "email", value: target.email } : body.id;
  const keys = phoneSignInLockKeys(key, target ? loginLockKey({ kind: "email", value: target.email }) : null);

  // The mobile path's refusals all take at least the floor (src/lib/auth/phoneSignIn.ts).
  const refuse = async (res: NextResponse): Promise<NextResponse> => {
    if (body.id.kind === "phone") {
      const wait = startedAt + PHONE_SIGN_IN_REFUSAL_FLOOR_MS - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
    return res;
  };

  const before = await lockStatusAll(service, keys, lockId);
  if (before.some((b) => b.locked)) {
    await notifyLocked(service, keys, before, lockId);
    return refuse(locked());
  }

  const supabase = await createClient();
  const options = body.captchaToken ? { options: { captchaToken: body.captchaToken } } : {};
  // A mobile always signs in by an address: its account's, or — for a number
  // with no single account — a throw-away one, so GoTrue still checks the
  // security token and takes its usual time (src/lib/auth/phoneSignIn.ts).
  const credentials =
    body.id.kind === "email"
      ? { email: body.id.value, password: body.password, ...options }
      : { email: target?.email ?? phoneSignInSinkAddress(crypto.randomUUID()), password: body.password, ...options };
  const { data, error: gotrueError } = await supabase.auth.signInWithPassword(credentials);
  let error: unknown = gotrueError;
  let user = data?.user ?? null;
  if (body.id.kind === "phone") {
    const verdict = phoneSignInVerdict({ target, error: gotrueError, signedInUserId: user?.id ?? null });
    if (!verdict.ok) {
      if (verdict.undo) {
        try {
          await supabase.auth.signOut({ scope: "local" });
        } catch {
          console.error("[auth/sign-in] undoing a phone sign-in failed");
        }
      }
      error = verdict.error;
      user = null;
    }
  }

  if (error || !user) {
    if (isHookLockRefusal(error)) {
      const now = await lockStatusAll(service, keys, lockId);
      await notifyLocked(service, keys, now, lockId);
      return refuse(locked());
    }
    if (isCredentialFailure(error)) {
      const after = await recordAll(service, keys, lockId, false);
      if (after.some((a) => a.locked)) {
        // The attempt that reached the maximum is answered with the lock itself.
        await notifyLocked(service, keys, after, lockId);
        return refuse(locked());
      }
    }
    const e = (error ?? {}) as { message?: unknown; code?: unknown; status?: unknown };
    return refuse(NextResponse.json(
      {
        authError: {
          message: typeof e.message === "string" ? e.message : "Invalid login credentials",
          code: typeof e.code === "string" ? e.code : undefined,
          status: typeof e.status === "number" ? e.status : 400,
        },
      },
      { status: 401, headers: NO_STORE },
    ));
  }

  await recordAll(service, keys, lockId, true);
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
