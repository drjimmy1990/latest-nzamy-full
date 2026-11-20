/**
 * readAlertsServer.ts — the I/O half of O19 (batch l11; owner register 14
 * item 67 / file 19):
 *
 *   noteLibraryReadSession(request, userId) — after a full-text document is
 *     allowed (libraryDocQuota.ts), tells Postgres which library session (the
 *     nz_lib_sid cookie, else the address — both as keyed hashes) the reader
 *     used. public.library_read_session_seen (20261201_30) keeps the last time
 *     per (user, session) and evaluates the review rules, the new «parallel»
 *     one included. At most once a minute per (user, session) per process.
 *
 *   sendPendingReviewFlagEmails() — claims the review flags of the last 24
 *     hours not yet e-mailed (library_review_flags_claim_email: one claim per
 *     flag, whichever process asks first) and sends each one to the staff
 *     addresses of the setting `alert_emails`, through sendEmail.ts. Asked
 *     after a flag is raised here and after each activity batch
 *     (activityMeterServer.ts), at most once a minute otherwise. Nothing is
 *     claimed while e-mail is not set up (no Resend key) or no address is
 *     set, so the flags wait (24 h at most) instead of being lost. The flagged
 *     account's id is NOT passed to sendEmail: a test account's alert must
 *     reach the staff, not the test mail sink (R67 covers test accounts).
 *
 * FAILS OPEN, ALWAYS: never throws, never delays the read (fire and forget).
 */
import { emailConfigured, sendEmail, siteLink } from "@/lib/email/sendEmail";
import { TtlMemo } from "./readQuota";
import { subjectHash } from "./publicViewCap";
import { loadPublicViewSettings, sessionIdFromCookieHeader, viewHashSecret, visitorAddress } from "./publicViewCapServer";
import { parseClaimedFlags, reviewFlagEmail } from "./readAlerts";

const TIMEOUT_MS = 2_000;
const SEEN_TTL_MS = 60 * 1000;
const EMAIL_EVERY_MS = 60 * 1000;
const MISSING_RETRY_MS = 10 * 60 * 1000;
const CLAIM_MAX_AGE_HOURS = 24;
const CLAIM_LIMIT = 20;

const seen = new TtlMemo<true>(SEEN_TTL_MS, 20_000);
let missingUntil = 0;
let lastEmailRun = 0;
let emailing = false;

async function rpc(name: string, body: Record<string, unknown>): Promise<unknown> {
  if (Date.now() < missingUntil) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const res = await fetch(`${url.replace(/\/+$/, "")}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const code = json && typeof json === "object" ? (json as { code?: unknown }).code : undefined;
    if (code === "PGRST202" || code === "42883" || code === "42703" || res.status === 404) missingUntil = Date.now() + MISSING_RETRY_MS;
    else console.error(`[library-alerts] ${name} failed:`, res.status);
    return null;
  }
  return json;
}

/** Records the reader's library session and evaluates the rules. Never waits, never throws. */
export function noteLibraryReadSession(request: Request, userId: string): void {
  void (async () => {
    try {
      const getHeader = (name: string) => request.headers.get(name);
      const secret = viewHashSecret();
      const sid = sessionIdFromCookieHeader(getHeader("cookie"));
      const address = visitorAddress(getHeader);
      const addressHash = address ? await subjectHash(secret, "addr", address) : null;
      const session = sid ? `s:${await subjectHash(secret, "sid", sid)}` : addressHash ? `a:${addressHash}` : null;
      if (!session) return;
      const memoKey = `${userId}\u0000${session}`;
      if (seen.get(memoKey)) return;
      seen.set(memoKey, true);
      const ref = await rpc("library_read_session_seen", { p_user: userId, p_session: session, p_address: addressHash });
      if (typeof ref === "string" && ref) await sendPendingReviewFlagEmails(true);
    } catch {
      // an alert is never worth a failed read
    }
  })();
}

/** Sends the flags not yet e-mailed to the staff addresses. Never throws. */
export async function sendPendingReviewFlagEmails(force = false): Promise<number> {
  if (emailing) return 0;
  if (!force && Date.now() - lastEmailRun < EMAIL_EVERY_MS) return 0;
  if (!emailConfigured()) return 0;
  lastEmailRun = Date.now();
  emailing = true;
  try {
    const settings = await loadPublicViewSettings();
    if (settings.alertEmails.length === 0) return 0;
    const flags = parseClaimedFlags(
      await rpc("library_review_flags_claim_email", { p_max_age_hours: CLAIM_MAX_AGE_HOURS, p_limit: CLAIM_LIMIT }),
    );
    let sent = 0;
    const href = siteLink("/dashboard/admin/security?tab=library_activity");
    for (const flag of flags) {
      const mail = reviewFlagEmail(flag, href);
      for (const to of settings.alertEmails) {
        const result = await sendEmail({
          to,
          subject: mail.subject,
          text: mail.text,
          html: mail.html,
          tag: "library-review-flag",
          idempotencyKey: `library-review-flag:${flag.reference}:${to}`,
        });
        if (result === "sent") sent += 1;
      }
    }
    return sent;
  } catch {
    return 0;
  } finally {
    emailing = false;
  }
}
