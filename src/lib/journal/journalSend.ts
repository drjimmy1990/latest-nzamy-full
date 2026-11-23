/**
 * journalSend.ts — who gets the monthly issue e-mail in this run (owner
 * Q191 أ, batch l13). Pure: relative imports only, for `node --test`.
 *
 *   - ONLY accounts whose user_settings.newsletter is explicitly true (no
 *     settings row = not subscribed: the switch starts OFF until the user
 *     turns it on himself);
 *   - never an account already in journal_issue_sends for this issue (sent,
 *     sunk, failed or in flight — a missed e-mail beats a double one);
 *   - a suspended account, or one without a usable address, is logged as
 *     skipped (so the run does not pick it again) and not e-mailed;
 *   - at most `limit` e-mails per run (each send may take up to 20 s), the
 *     rest wait for the next run.
 */
import { isPlainEmail } from "../email/emailAddress.ts";

export interface BatchPlanInput {
  /** Opted-in user ids (user_settings.newsletter = true), in read order. */
  optedIn: readonly string[];
  /** Ids already in the send log for this issue. */
  alreadyLogged: ReadonlySet<string>;
  /** profiles.email by id. */
  addresses: ReadonlyMap<string, string | null>;
  /** Suspended ids (null = could not be read → nobody is sent to: fail closed). */
  suspended: ReadonlySet<string> | null;
  limit: number;
}

export interface BatchPlan {
  send: Array<{ userId: string; email: string }>;
  skip: Array<{ userId: string; reason: "suspended" | "no_address" }>;
  /** True when the suspension list could not be read and nothing was planned. */
  blocked: boolean;
}

export function planIssueBatch(input: BatchPlanInput): BatchPlan {
  if (input.suspended === null) return { send: [], skip: [], blocked: true };
  const send: BatchPlan["send"] = [];
  const skip: BatchPlan["skip"] = [];
  const seen = new Set<string>();
  const limit = Math.max(0, Math.floor(input.limit));
  for (const id of input.optedIn) {
    if (send.length >= limit) break;
    if (typeof id !== "string" || !id || seen.has(id) || input.alreadyLogged.has(id)) continue;
    seen.add(id);
    if (input.suspended.has(id)) {
      skip.push({ userId: id, reason: "suspended" });
      continue;
    }
    const email = (input.addresses.get(id) ?? "").trim();
    if (!email || !isPlainEmail(email)) {
      skip.push({ userId: id, reason: "no_address" });
      continue;
    }
    send.push({ userId: id, email });
  }
  return { send, skip, blocked: false };
}

/** sendEmail's answer → the send-log status and error code. */
export function sendLogStatus(result: "sent" | "unavailable" | "failed" | "sunk"): { status: "sent" | "sunk" | "failed"; lastError: string | null } {
  if (result === "sent") return { status: "sent", lastError: null };
  if (result === "sunk") return { status: "sunk", lastError: null };
  return { status: "failed", lastError: result };
}
