/**
 * accountDeviceGate.ts — the I/O half of owner answer ٢٣٣ (LIVE-17): "may
 * this device be used with this account?" One mobile + one computer per
 * account (public.account_device_gate, 20261209_40).
 *
 * Two callers, one rule:
 *   - src/proxy.ts (page branch, through accountDeviceProxy.ts) — every
 *     PROTECTED page (dashboards, settings, the AI tools, onboarding …);
 *   - src/lib/library/deviceLimitServer.ts enforceLibraryDevice — the library
 *     full-text routes (the library pages are public, the proxy hook never
 *     sees them), and (l19 review B2) the AI run route, the free-question
 *     status and the signed-in site assistant (aiDeviceCheck.routes.test.ts).
 *
 * A REQUEST WITHOUT A DEVICE COOKIE gets a freshly minted id, asked about at
 * once: refused when another CONFIRMED device holds its class (so deleting the
 * cookie never opens a door), otherwise a CANDIDATE and let through. The
 * caller sets the cookie (`setDeviceId`).
 *
 * THE RULE THAT KEEPS A FIRST DEVICE FROM LOCKING ITSELF OUT. A candidate takes
 * the slot only when the same id comes back at least 2 minutes after it was
 * first seen (account_device_gate). When a browser's first requests run in
 * parallel, each mints its own id and the last answer to arrive decides which
 * id the browser keeps; only the kept id is still sent after the wait. If the
 * first id to come back took the slot at once, a later answer could replace
 * the browser's cookie with another id, and the user's very first device would
 * be refused.
 *
 * The cookie is set again (same value, a fresh 400 days) whenever the gate is
 * asked about it, so a device in use never ages out into a "new" device.
 *
 * FAILS OPEN, WITH AN ADMIN ALERT. Only an explicit `refused` answer refuses.
 * A missing service key, a timeout (1.5 s), a missing function or column (the
 * migration not run), an unparsable answer or a thrown error let the request
 * through, log it, and — at most once every 30 minutes per process — put a
 * notification in the admins' bell (public.library_monitor_notify_admins;
 * never e-mail). The limit is an anti-sharing rule, not the security
 * boundary (passwords, sessions and RLS are): failing closed would turn a
 * database hiccup into every paying user losing the whole platform at once.
 *
 * SWITCH OFF = NOTHING CHANGES. The switch
 * (library_monitor_settings.account_device_limit_enabled) is read at most
 * every 30 s per process; while it is off no cookie is minted, nothing is
 * read or written, nobody is refused.
 *
 * MEMO (per process). Allowed (user, device) 60 s; an exempt user (admin /
 * staff) 5 min. A refusal is never remembered, so an admin reset applies on
 * the next request.
 *
 * A plain fetch to PostgREST as the service role (as phoneGateServer.ts), so
 * the proxy bundle gains no client; the key is read per call and never
 * logged. No node: imports.
 */
import {
  accountDeviceHash,
  accountDeviceLabel,
  accountGateDecision,
  accountSwitchFrom,
  deviceKindFrom,
  isAccountDeviceId,
  isMissingAccountDeviceSchema,
  newAccountDeviceId,
  parseAccountGateRow,
} from "./accountDevice.ts";

const TIMEOUT_MS = 1_500;
const SWITCH_TTL_MS = 30 * 1000;
const SWITCH_RETRY_MS = 15 * 1000;
const MISSING_RETRY_MS = 10 * 60 * 1000;
const ALLOW_TTL_MS = 60 * 1000;
const EXEMPT_TTL_MS = 5 * 60 * 1000;
const ALERT_EVERY_MS = 30 * 60 * 1000;
const MEMO_MAX = 20_000;

export const ACCOUNT_DEVICE_ALERT_HREF = "/dashboard/admin/security?tab=library_devices";

/** What the caller read from its request. `deviceId` is the raw cookie value (validated here). */
export interface AccountDeviceFacts {
  userId: string;
  deviceId: string | null | undefined;
  userAgent: string | null | undefined;
  chUaMobile: string | null | undefined;
}

export type AccountDeviceOutcome =
  /** Go on. `setDeviceId`: set this as the device cookie (a minted id, or the same id renewed). */
  | { kind: "pass"; setDeviceId: string | null }
  | { kind: "refuse" };

type Fetch = typeof fetch;

let switchCache: { value: boolean; expiresAt: number } | null = null;
let switchInflight: Promise<boolean> | null = null;
let missingUntil = 0;
let missingLogged = false;
let lastAlertAt = 0;
const memo = new Map<string, number>();

function rest(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ""), key };
}

function headersFor(key: string): Record<string, string> {
  return { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json", "Content-Type": "application/json" };
}

function memoHas(key: string, now: number): boolean {
  const until = memo.get(key);
  if (until === undefined) return false;
  if (until <= now) {
    memo.delete(key);
    return false;
  }
  return true;
}

function memoSet(key: string, now: number, ttlMs: number): void {
  memo.delete(key);
  memo.set(key, now + ttlMs);
  while (memo.size > MEMO_MAX) {
    const oldest = memo.keys().next().value;
    if (oldest === undefined) break;
    memo.delete(oldest);
  }
}

const userKey = (userId: string) => `${userId}\u0000!exempt`;
const deviceKey = (userId: string, hash: string) => `${userId}\u0000${hash}`;

async function errorCodeOf(res: Response): Promise<string | null> {
  try {
    const j = (await res.json()) as { code?: unknown } | null;
    return j && typeof j.code === "string" ? j.code : null;
  } catch {
    return null;
  }
}

function noteMissing(): void {
  missingUntil = Date.now() + MISSING_RETRY_MS;
  if (!missingLogged) {
    missingLogged = true;
    console.warn("[account-device] 20261209_40 is not applied (account_device_gate / the switch column missing); devices are not checked");
  }
}

/**
 * One in-app notification to the admins, at most every 30 minutes per
 * process. Fire and forget: the request never waits on it, and it never
 * throws. `reason` is a class name only (timeout / error / unparsable).
 */
function alertAdmins(reason: string, fetchImpl: Fetch): void {
  const now = Date.now();
  if (now - lastAlertAt < ALERT_EVERY_MS) return;
  lastAlertAt = now;
  console.error(`[account-device] check failed (${reason}); the request was let through unchecked`);
  const r = rest();
  if (!r) return;
  try {
    void fetchImpl(`${r.url}/rest/v1/rpc/library_monitor_notify_admins`, {
      method: "POST",
      headers: headersFor(r.key),
      body: JSON.stringify({
        p_title: "تعذّر فحص حد الأجهزة",
        p_body:
          "تعذّر على الخادم التحقق من أجهزة الحسابات، فسُمح بالدخول مؤقتاً دون فحص حتى يعود الفحص. " +
          "الحد ما زال مفعّلاً، ويحتاج الأمر مراجعة الفريق التقني لسجل الخادم.",
        p_href: ACCOUNT_DEVICE_ALERT_HREF,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    }).then(
      () => undefined,
      () => undefined,
    );
  } catch {
    /* never throws */
  }
}

async function fetchSwitch(fetchImpl: Fetch): Promise<boolean | null> {
  const r = rest();
  if (!r) return null;
  try {
    const res = await fetchImpl(
      `${r.url}/rest/v1/library_monitor_settings?select=account_device_limit_enabled&id=eq.true`,
      { headers: headersFor(r.key), signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" },
    );
    if (!res.ok) {
      if (isMissingAccountDeviceSchema(await errorCodeOf(res))) {
        noteMissing();
        return false;
      }
      return null;
    }
    return accountSwitchFrom(await res.json());
  } catch {
    return null;
  }
}

/**
 * The account switch now (30 s per process). Never throws. A failed read
 * keeps the last answer; with no answer ever read it is OFF (fail open).
 */
export async function loadAccountDeviceSwitch(fetchImpl: Fetch = fetch): Promise<boolean> {
  const now = Date.now();
  if (now < missingUntil) return false;
  if (switchCache && switchCache.expiresAt > now) return switchCache.value;
  if (switchInflight) return switchInflight;
  switchInflight = fetchSwitch(fetchImpl)
    .then((read) => {
      if (read !== null) {
        switchCache = { value: read, expiresAt: Date.now() + SWITCH_TTL_MS };
        return read;
      }
      const kept = switchCache?.value ?? false;
      alertAdmins("switch_read_failed", fetchImpl);
      switchCache = { value: kept, expiresAt: Date.now() + SWITCH_RETRY_MS };
      return kept;
    })
    .catch(() => switchCache?.value ?? false)
    .finally(() => {
      switchInflight = null;
    });
  return switchInflight;
}

/** public.account_device_gate → the parsed row, or a failure class. */
async function callGate(
  facts: AccountDeviceFacts,
  hash: string,
  fetchImpl: Fetch,
): Promise<{ row: ReturnType<typeof parseAccountGateRow> } | { failed: string }> {
  const r = rest();
  if (!r) return { failed: "no_service_key" };
  const kind = deviceKindFrom(facts.userAgent, facts.chUaMobile);
  try {
    const res = await fetchImpl(`${r.url}/rest/v1/rpc/account_device_gate`, {
      method: "POST",
      headers: headersFor(r.key),
      body: JSON.stringify({
        p_user: facts.userId,
        p_device_hash: hash,
        p_label: accountDeviceLabel(facts.userAgent, kind),
        p_kind: kind,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) {
      const code = await errorCodeOf(res);
      if (isMissingAccountDeviceSchema(code)) {
        noteMissing();
        return { failed: "missing" };
      }
      return { failed: `http_${res.status}` };
    }
    const row = parseAccountGateRow(await res.json());
    return row ? { row } : { failed: "unparsable" };
  } catch (err) {
    return { failed: err instanceof Error && err.name === "TimeoutError" ? "timeout" : "error" };
  }
}

/**
 * The verdict for a user getUser() has just verified, on this request's
 * device cookie. Never throws; anything but an explicit `refused` passes.
 */
export async function accountDeviceOutcome(
  facts: AccountDeviceFacts,
  fetchImpl: Fetch = fetch,
): Promise<AccountDeviceOutcome> {
  try {
    if (!facts.userId) return { kind: "pass", setDeviceId: null };
    if (!(await loadAccountDeviceSwitch(fetchImpl))) return { kind: "pass", setDeviceId: null };
    const now = Date.now();
    if (memoHas(userKey(facts.userId), now)) return { kind: "pass", setDeviceId: null };

    // No (valid) device id yet: mint one and ask about it at once — a
    // candidate while its class is free, refused when it is taken.
    const fresh = !isAccountDeviceId(facts.deviceId);
    const id = fresh ? newAccountDeviceId() : (facts.deviceId as string);
    const hash = await accountDeviceHash(id);
    if (!fresh && memoHas(deviceKey(facts.userId, hash), now)) return { kind: "pass", setDeviceId: null };

    const answer = await callGate(facts, hash, fetchImpl);
    if ("failed" in answer) {
      if (answer.failed !== "missing") alertAdmins(answer.failed, fetchImpl);
      return { kind: "pass", setDeviceId: fresh ? id : null };
    }
    const decision = accountGateDecision(answer.row);
    if (decision.action === "refuse") return { kind: "refuse" };
    const after = Date.now();
    if (decision.remember === "switch_off") {
      switchCache = { value: false, expiresAt: after + SWITCH_TTL_MS };
      return { kind: "pass", setDeviceId: null };
    }
    if (decision.remember === "user") {
      memoSet(userKey(facts.userId), after, EXEMPT_TTL_MS);
      return { kind: "pass", setDeviceId: null };
    }
    memoSet(deviceKey(facts.userId, hash), after, ALLOW_TTL_MS);
    // A minted id, or the same id renewed for another 400 days.
    return { kind: "pass", setDeviceId: id };
  } catch {
    alertAdmins("error", fetchImpl);
    return { kind: "pass", setDeviceId: null };
  }
}

/** Drops this process's memo of one user (after an admin reset in this process). */
export function forgetAccountDevices(userId: string): void {
  const prefix = `${userId}\u0000`;
  for (const key of memo.keys()) if (key.startsWith(prefix)) memo.delete(key);
}

/** Drops this process's copy of the switch (after the admin changed it in this process). */
export function forgetAccountDeviceSwitch(): void {
  switchCache = null;
  missingUntil = 0;
}

/** Tests only: a clean process. */
export function __resetAccountDeviceGateForTests(): void {
  switchCache = null;
  switchInflight = null;
  missingUntil = 0;
  missingLogged = false;
  lastAlertAt = 0;
  memo.clear();
}
