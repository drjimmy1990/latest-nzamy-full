/**
 * webhookCheck.ts — the pure half of POST /api/v1/payments/webhook (Moyasar
 * payments B1, Task 6): is this event from Moyasar, what does it name, what
 * does the route do with it, and when is a stored event finished.
 *
 * The Moyasar webhook object (docs, "Webhook Reference"):
 *   { id, type, created_at, secret_token, account_name, live, data }
 * where `data` is the payment for `payment_*` events. The endpoint's secret is
 * the `secret_token` the merchant typed in the dashboard — the same value as
 * MOYASAR_WEBHOOK_SECRET. Moyasar retries a non-2xx delivery 5 more times
 * (6 attempts over about 3.5 hours) with the same event `id`.
 *
 * The body is only a trigger: fulfillOrder re-fetches the payment with the
 * secret key and decides. Nothing here grants anything.
 *
 * Pure: node builtins only, so `node --test` loads it.
 */

import { createHash, timingSafeEqual } from "node:crypto";

export type WebhookMode = "test" | "live";

export type WebhookCheck =
  | {
      ok: true;
      eventId: string;
      type: string;
      /** `data.id` — the payment, for `payment_*` events. */
      paymentId: string;
      /** The body's `live`; fulfillOrder checks it against the gateway mode. */
      live: boolean;
      /** `data.metadata.order_id`, when the browser set one (Task 7). */
      orderId?: string;
      /**
       * False when `live` disagrees with the mode of the configured secret key:
       * a test-mode event reaching a live server (or the reverse). The route
       * records it and answers 200 — the key cannot fetch that payment, so a
       * retry could never succeed. True when no key is configured (fulfilment
       * then answers gateway_disabled).
       */
      modeMatches: boolean;
    }
  | { ok: false; status: 401 | 400 };

/** Event and payment ids are short; anything longer is not Moyasar's. */
const MAX_ID_LENGTH = 200;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= MAX_ID_LENGTH;

/**
 * True when the body's secret_token equals the configured secret. Both sides
 * are hashed with SHA-256 first, so timingSafeEqual always compares two
 * equal-length buffers and the time taken says nothing about the secret or
 * its length. An unset or empty secret refuses everyone.
 */
export function webhookSecretMatches(token: unknown, secret: string | null | undefined): boolean {
  if (typeof secret !== "string" || secret.length === 0) return false;
  if (typeof token !== "string" || token.length === 0) return false;
  const a = createHash("sha256").update(token, "utf8").digest();
  const b = createHash("sha256").update(secret, "utf8").digest();
  return timingSafeEqual(a, b);
}

/**
 * Checks one webhook delivery. In order:
 *   1. not a JSON object → 400;
 *   2. secret_token does not match the (trimmed) configured secret → 401 —
 *      before the shape, so a stranger learns nothing about what we expect;
 *   3. a missing or ill-typed `id`, `type`, `data`, `data.id` or boolean
 *      `live` → 400.
 * `mode` is the mode of the configured secret key (modeOfSecretKey), or null
 * when none is set.
 */
export function checkWebhook(body: unknown, secret: string, mode: WebhookMode | null): WebhookCheck {
  if (!isPlainObject(body)) return { ok: false, status: 400 };
  const configured = typeof secret === "string" ? secret.trim() : "";
  if (!webhookSecretMatches(body.secret_token, configured)) return { ok: false, status: 401 };

  const { id, type, live, data } = body;
  if (!isId(id)) return { ok: false, status: 400 };
  if (typeof type !== "string" || type.length === 0 || type.length > 100) return { ok: false, status: 400 };
  if (typeof live !== "boolean") return { ok: false, status: 400 };
  if (!isPlainObject(data) || !isId(data.id)) return { ok: false, status: 400 };

  const result: Extract<WebhookCheck, { ok: true }> = {
    ok: true,
    eventId: id,
    type,
    paymentId: data.id,
    live,
    modeMatches: mode === null ? true : live === (mode === "live"),
  };
  const orderId = isPlainObject(data.metadata) ? data.metadata.order_id : undefined;
  if (isId(orderId)) result.orderId = orderId;
  return result;
}

/** The mode a Moyasar secret key belongs to, from its prefix only. */
export function modeOfSecretKey(key: string | null | undefined): WebhookMode | null {
  const k = typeof key === "string" ? key.trim() : "";
  if (k.startsWith("sk_test_")) return "test";
  if (k.startsWith("sk_live_")) return "live";
  return null;
}

/** Both spellings appear in Moyasar's docs (`payment_faild` in the dashboard list). */
const SETTLE_EVENTS: ReadonlySet<string> = new Set(["payment_paid", "payment_failed", "payment_faild"]);
/** B1 refunds and voids are admin-initiated (Task 9); the event is only recorded. */
const RECORD_EVENTS: ReadonlySet<string> = new Set(["payment_refunded", "payment_voided"]);

export type WebhookAction = "settle" | "record" | "ignore";

export function webhookAction(type: string): WebhookAction {
  if (SETTLE_EVENTS.has(type)) return "settle";
  if (RECORD_EVENTS.has(type)) return "record";
  return "ignore";
}

type Outcome = "granted" | "already_done" | "failed" | "pending" | "rejected";

/** 'pending' is a non-2xx so Moyasar delivers again; every settled answer is 200. */
export function webhookStatusFor(outcome: Outcome): 200 | 503 {
  return outcome === "pending" ? 503 : 200;
}

/**
 * The value stored in payment_webhook_events.outcome: the outcome, with the
 * machine reason after a colon. For 'failed' the reason is Moyasar's message
 * to the payer and is not stored here (the order keeps it).
 */
export function webhookOutcomeLabel(result: { outcome: Outcome; reason?: string }): string {
  if (result.outcome === "failed" || !result.reason) return result.outcome;
  return `${result.outcome}:${result.reason}`.slice(0, 100);
}

/**
 * True when a stored event needs no more work: a repeat delivery answers
 * 200 {duplicate: true}. Null (the first delivery never finished) and
 * 'pending…' (it answered 503 so Moyasar would retry) run again —
 * fulfillOrder is idempotent.
 */
export function isFinalWebhookOutcome(outcome: string | null | undefined): boolean {
  if (typeof outcome !== "string" || outcome.length === 0) return false;
  return outcome !== "pending" && !outcome.startsWith("pending:");
}
