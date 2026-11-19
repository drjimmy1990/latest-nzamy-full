/**
 * ticketReplies.ts — the support team's replies to a ticket (file 15 row 53,
 * A1; batch l9). The admin queue showed a reply box with no binding and a
 * «إرسال الرد» button with no handler: nothing was ever sent.
 *
 * Where a reply lives: support_tickets.metadata.replies (jsonb, 20260706). No
 * new table, so it works as soon as the code is deployed; 20261129_80 adds
 * only the guard trigger described below.
 *   - written ONLY by POST /api/v1/admin/tickets/[id]/reply (service role,
 *     requireStaff("tickets.manage"), audited), with a compare-and-set on
 *     updated_at so two staff replying at once never lose one another's text;
 *   - the admin PATCH can never overwrite or drop them (keepReplies);
 *   - the ticket's OWNER can read the row's metadata (tickets_select_own) and
 *     insert his own row (tickets_insert_own), so: a reply stores no staff id
 *     (who replied is in the audit log), and migration 20261129_80 strips any
 *     `replies` a session writes — only the service role (this route) may.
 *   - the user reads them through GET /api/v1/tickets as { body, at }.
 *
 * Pure (no imports), so `node --test` loads it (./ticketReplies.test.ts).
 */

export const TICKET_REPLY_MIN = 2;
export const TICKET_REPLY_MAX = 4000;
/** A ticket keeps at most this many replies (a guard on the row's size). */
export const TICKET_REPLIES_MAX = 200;

/** One reply as stored: text and time only (who wrote it is in the audit log). */
export interface StoredTicketReply {
  body: string;
  /** ISO time the server stored it. */
  at: string;
}

/** What the ticket's owner sees. */
export type TicketReplyDto = StoredTicketReply;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** metadata.replies → the stored replies, oldest first; anything malformed is skipped. */
export function storedReplies(metadata: unknown): StoredTicketReply[] {
  if (!isObject(metadata) || !Array.isArray(metadata.replies)) return [];
  const out: StoredTicketReply[] = [];
  for (const r of metadata.replies) {
    if (!isObject(r) || typeof r.body !== "string" || !r.body.trim()) continue;
    if (typeof r.at !== "string" || !Number.isFinite(Date.parse(r.at))) continue;
    out.push({ body: r.body, at: r.at });
  }
  return out.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/** The user's view of the replies: text and time. */
export function replyDtos(metadata: unknown): TicketReplyDto[] {
  return storedReplies(metadata);
}

export type ReplyValidation = { ok: true; body: string } | { ok: false; error: string };

/** The admin's POST body → the reply text, or an Arabic error. */
export function validateReply(input: unknown): ReplyValidation {
  const raw = isObject(input) ? input.body : undefined;
  if (typeof raw !== "string") return { ok: false, error: "نص الرد مطلوب." };
  const body = raw.trim();
  if (body.length < TICKET_REPLY_MIN) return { ok: false, error: "نص الرد قصير جداً." };
  if (body.length > TICKET_REPLY_MAX) return { ok: false, error: `نص الرد أطول من ${TICKET_REPLY_MAX} حرف.` };
  return { ok: true, body };
}

/** The metadata with one more reply; null when the ticket already holds the maximum. */
export function withReply(metadata: unknown, reply: StoredTicketReply): Record<string, unknown> | null {
  const base = isObject(metadata) ? { ...metadata } : {};
  const replies = Array.isArray(base.replies) ? base.replies.slice() : [];
  if (replies.length >= TICKET_REPLIES_MAX) return null;
  replies.push({ body: reply.body, at: reply.at });
  base.replies = replies;
  return base;
}

/**
 * The admin PATCH's metadata, merged over what the row holds, with the stored
 * replies kept exactly as they are (a PATCH can neither add nor drop one).
 */
export function keepReplies(existing: unknown, incoming: unknown): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...(isObject(existing) ? existing : {}), ...(isObject(incoming) ? incoming : {}) };
  if (isObject(existing) && Object.hasOwn(existing, "replies")) merged.replies = existing.replies;
  else delete merged.replies;
  return merged;
}
