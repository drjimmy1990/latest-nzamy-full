/**
 * phoneGateServer.ts — the proxy's half of the WhatsApp sign-up code (batch
 * l15): "is this signed-in account held until its mobile is confirmed?"
 *
 * Cheap on purpose (src/proxy.ts runs it on PROTECTED pages and /api/v1):
 *   1. the switch (platform_settings signup_phone_otp) is read at most every
 *      30 s per process; while it is off nothing else happens;
 *   2. an account created before enabled_at is never held — answered from
 *      the user getUser() already returned (created_at), no query;
 *   3. only a NEW account asks the database (public.phone_otp_gate,
 *      20261205_10), and a "not held" answer is kept 60 s per process, keyed
 *      by the verified user id. A "held" answer is never kept, so the moment
 *      the code is confirmed the next request passes.
 *
 * Failure rules, each deliberate:
 *   - the switch cannot be read: the last answer read stays in force; with no
 *     answer ever read, nobody is held (the code may run before the migration);
 *   - the gate read fails for a NEW account: held (fail closed — only accounts
 *     created after the switch-on ever reach this read; an old account is
 *     never locked out by an error).
 *
 * A plain fetch to PostgREST as the service role (as readQuotaServer.ts and
 * publicGuardServer.ts), so the proxy bundle gains no client. The key is read
 * per call and never logged. No node: imports (crypto.subtle only).
 */
import { mayBeHeld, signupPhoneOtpFrom, SIGNUP_PHONE_OTP_KEY, type SignupPhoneOtpSetting } from "./phoneOtpRules.ts";

const SETTING_TTL_MS = 30 * 1000;
const SETTING_RETRY_MS = 15 * 1000;
const PASS_TTL_MS = 60 * 1000;
const PASS_MAX = 5_000;
const TIMEOUT_MS = 1_500;
const OFF: SignupPhoneOtpSetting = { enabled: false, enabledAt: null };

let setting: { value: SignupPhoneOtpSetting; expiresAt: number } | null = null;
let settingInflight: Promise<SignupPhoneOtpSetting> | null = null;
const passes = new Map<string, number>();

function rest(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ""), key };
}

async function fetchSetting(): Promise<SignupPhoneOtpSetting | null> {
  const r = rest();
  if (!r) return null;
  try {
    const res = await fetch(`${r.url}/rest/v1/platform_settings?select=value&key=eq.${SIGNUP_PHONE_OTP_KEY}`, {
      headers: { apikey: r.key, Authorization: `Bearer ${r.key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ value?: unknown }> | null;
    return signupPhoneOtpFrom(Array.isArray(rows) && rows[0] ? rows[0].value : null);
  } catch {
    return null;
  }
}

/** The switch now (30 s per process). Never throws. */
export async function loadSignupPhoneOtpSetting(): Promise<SignupPhoneOtpSetting> {
  const now = Date.now();
  if (setting && setting.expiresAt > now) return setting.value;
  if (settingInflight) return settingInflight;
  settingInflight = fetchSetting()
    .then((read) => {
      if (read) {
        setting = { value: read, expiresAt: Date.now() + SETTING_TTL_MS };
        return read;
      }
      const kept = setting?.value ?? OFF;
      setting = { value: kept, expiresAt: Date.now() + SETTING_RETRY_MS };
      return kept;
    })
    .catch(() => setting?.value ?? OFF)
    .finally(() => {
      settingInflight = null;
    });
  return settingInflight;
}

/** public.phone_otp_gate(user) → true (held) / false / null (could not be read). */
async function readGate(userId: string): Promise<boolean | null> {
  const r = rest();
  if (!r) return null;
  try {
    const res = await fetch(`${r.url}/rest/v1/rpc/phone_otp_gate`, {
      method: "POST",
      headers: {
        apikey: r.key,
        Authorization: `Bearer ${r.key}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_user: userId }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { gated?: unknown } | null;
    if (!j || typeof j.gated !== "boolean") return null;
    return j.gated;
  } catch {
    return null;
  }
}

function hasPass(key: string, now: number): boolean {
  const until = passes.get(key);
  if (until === undefined) return false;
  if (until <= now) {
    passes.delete(key);
    return false;
  }
  return true;
}

function remember(key: string, now: number): void {
  passes.delete(key);
  passes.set(key, now + PASS_TTL_MS);
  while (passes.size > PASS_MAX) {
    const oldest = passes.keys().next().value;
    if (oldest === undefined) break;
    passes.delete(oldest);
  }
}

export type PhoneGateVerdict = "pass" | "held";

/**
 * The verdict for a user getUser() has just verified. `extraPassKey` (the
 * proxy's token key) is remembered beside the user id on a pass.
 */
export async function phoneGateVerdict(
  user: { id: string; created_at?: string | null },
  extraPassKey?: string | null,
): Promise<PhoneGateVerdict> {
  try {
    const s = await loadSignupPhoneOtpSetting();
    const now = Date.now();
    if (!mayBeHeld(s, user.created_at)) {
      if (extraPassKey && s.enabled) remember(`t:${extraPassKey}`, now);
      return "pass";
    }
    if (hasPass(`u:${user.id}`, now)) {
      if (extraPassKey) remember(`t:${extraPassKey}`, now);
      return "pass";
    }
    const gated = await readGate(user.id);
    if (gated === false) {
      remember(`u:${user.id}`, now);
      if (extraPassKey) remember(`t:${extraPassKey}`, now);
      return "pass";
    }
    if (gated === null) console.error("[phone-gate] gate read failed; a new account is held until it can be read");
    return "held";
  } catch {
    return "held";
  }
}

/** A pass already given to this exact session token (60 s). */
export function hasTokenPass(tokenKey: string): boolean {
  return hasPass(`t:${tokenKey}`, Date.now());
}

/**
 * A short key for the session material a request carries (the Authorization
 * header and every sb-*-auth-token* cookie value). The same material → the
 * same key; a refreshed token → a new key. SHA-256 through Web Crypto.
 */
export async function sessionTokenKey(parts: readonly string[]): Promise<string | null> {
  const material = parts.filter(Boolean).join("\u0000");
  if (!material) return null;
  try {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}
