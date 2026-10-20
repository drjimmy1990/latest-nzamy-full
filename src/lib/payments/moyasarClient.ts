/**
 * moyasarClient.ts — the Moyasar REST client. SERVER-ONLY: it holds the
 * secret key. Import it only from route handlers and server modules, never
 * from a "use client" file (the repo has no `server-only` package; the
 * window guard in createMoyasarClient is the runtime backstop).
 *
 * API facts (Moyasar docs):
 *   base https://api.moyasar.com, Basic auth base64(secretKey + ":");
 *   POST   /v1/payment_intents             {amount, currency, description, callback_url}
 *   POST   /v1/payment_intents/{id}/cancel
 *   GET    /v1/payments/{id}
 *   POST   /v1/payments/{id}/refund         optional {amount}
 *   POST   /v1/payments/{id}/void
 *   GET    /v1/tokens/{id}
 *   DELETE /v1/tokens/{id}                  → 204
 *   errors {type, message, errors?}
 *
 * Every call times out after 15 s and never throws: it resolves to
 * `{ ok: true, data }` or `{ ok: false, status, type, message }`, where
 * `status` is the HTTP status (0 for a network error or a timeout) and no key
 * material appears in `type` or `message`.
 *
 * `live` on a payment: Moyasar's payment object has no `live` field, so
 * fetchPayment returns `live` only when the body carries a boolean one (it is
 * otherwise absent). The mode of a fetched payment is the mode of the key
 * that fetched it — `client.mode` — on the callback path; the webhook body's
 * `live` is the other source.
 *
 * Pure: no runtime imports, `fetch` injected, so `node --test` loads it.
 */

import type { MoyasarConfig, MoyasarMode } from "./moyasarConfig.ts";

export const MOYASAR_API_BASE = "https://api.moyasar.com";
export const MOYASAR_TIMEOUT_MS = 15_000;

export type MoyasarError = { ok: false; status: number; type: string; message: string };
export type MoyasarResult<T> = { ok: true; data: T } | MoyasarError;

export type MoyasarPaymentStatus =
  | "initiated"
  | "paid"
  | "failed"
  | "authorized"
  | "captured"
  | "refunded"
  | "voided";

const PAYMENT_STATUSES: ReadonlySet<string> = new Set<MoyasarPaymentStatus>([
  "initiated", "paid", "failed", "authorized", "captured", "refunded", "voided",
]);

export interface MoyasarIntent {
  id: string;
  clientSecret: string;
  expiresAt: string | null;
}

export interface MoyasarPayment {
  id: string;
  status: MoyasarPaymentStatus;
  /** Halalas. */
  amount: number;
  currency: string;
  /** Present only when the body carries a boolean `live` (see header). */
  live?: boolean;
  metadata: Record<string, unknown>;
  source: {
    type: string;
    token?: string;
    company?: string;
    number?: string;
    message?: string;
    transactionUrl?: string;
  };
  invoice_id: string | null;
  /** Halalas refunded so far. */
  refunded: number;
  /** Halalas captured. */
  captured: number;
  createdAt: string | null;
}

export interface MoyasarToken {
  id: string;
  status: string | null;
  brand: string | null;
  funding: string | null;
  country: string | null;
  month: string | null;
  year: string | null;
  name: string | null;
  lastFour: string | null;
}

export interface CreateIntentInput {
  amountHalalas: number;
  description: string;
  /** The result page; `?order=<metadata.order_id>` is added when absent. */
  callbackUrl: string;
  /**
   * Not sent to the intent (Moyasar's intent create takes amount, currency,
   * description and callback_url only; metadata goes on from the browser).
   * `order_id` is required and is encoded into callback_url.
   */
  metadata: { order_id: string } & Record<string, unknown>;
}

export interface MoyasarClientOptions {
  timeoutMs?: number;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const isNonNegInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
const isPosInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0;

/** Moyasar ids are uuids or prefixed tokens; nothing that could alter the path. */
const SAFE_ID = /^[A-Za-z0-9_-]{1,200}$/;

const invalidRequest = (message: string): MoyasarError => ({
  ok: false, status: 0, type: "invalid_request", message,
});
const invalidResponse = (status: number): MoyasarError => ({
  ok: false, status, type: "invalid_response", message: "Moyasar returned an unexpected response body",
});

function mapPayment(body: unknown): MoyasarPayment | null {
  if (!isPlainObject(body)) return null;
  const { id, status, amount, currency, source } = body;
  if (typeof id !== "string" || !id) return null;
  if (typeof status !== "string" || !PAYMENT_STATUSES.has(status)) return null;
  if (!isNonNegInt(amount)) return null;
  if (typeof currency !== "string" || !currency) return null;
  if (!isPlainObject(source) || typeof source.type !== "string") return null;

  const mappedSource: MoyasarPayment["source"] = { type: source.type };
  for (const [from, to] of [
    ["company", "company"],
    ["number", "number"],
    ["token", "token"],
    ["message", "message"],
    ["transaction_url", "transactionUrl"],
  ] as const) {
    const v = str(source[from]);
    if (v !== null) mappedSource[to] = v;
  }

  const payment: MoyasarPayment = {
    id,
    status: status as MoyasarPaymentStatus,
    amount,
    currency,
    metadata: isPlainObject(body.metadata) ? body.metadata : {},
    source: mappedSource,
    invoice_id: str(body.invoice_id),
    refunded: isNonNegInt(body.refunded) ? body.refunded : 0,
    captured: isNonNegInt(body.captured) ? body.captured : 0,
    createdAt: str(body.created_at),
  };
  if (typeof body.live === "boolean") payment.live = body.live;
  return payment;
}

function mapToken(body: unknown): MoyasarToken | null {
  if (!isPlainObject(body) || typeof body.id !== "string" || !body.id) return null;
  return {
    id: body.id,
    status: str(body.status),
    brand: str(body.brand),
    funding: str(body.funding),
    country: str(body.country),
    month: str(body.month),
    year: str(body.year),
    name: str(body.name),
    lastFour: str(body.last_four),
  };
}

export function createMoyasarClient(
  cfg: MoyasarConfig,
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
  options: MoyasarClientOptions = {},
) {
  if (typeof window !== "undefined") {
    throw new Error("moyasarClient is server-only");
  }
  if (!cfg || cfg.enabled !== true || (cfg.mode !== "test" && cfg.mode !== "live")) {
    throw new Error("createMoyasarClient needs an enabled Moyasar config");
  }
  if (!cfg.secretKey.startsWith(`sk_${cfg.mode}_`)) {
    throw new Error(`createMoyasarClient: the secret key does not belong to ${cfg.mode} mode`);
  }

  const mode: MoyasarMode = cfg.mode;
  const timeoutMs = options.timeoutMs ?? MOYASAR_TIMEOUT_MS;
  const basicToken = Buffer.from(`${cfg.secretKey}:`).toString("base64");
  const authorization = `Basic ${basicToken}`;

  /** Strip anything key-shaped, and the configured secrets, from outbound text. */
  const redact = (text: string): string => {
    let out = text;
    for (const secret of [cfg.secretKey, basicToken, cfg.publishableKey, cfg.webhookSecret]) {
      if (secret) out = out.split(secret).join("[redacted]");
    }
    return out.replace(/\b(sk|pk)_(test|live)_[A-Za-z0-9]+/g, "[redacted]").slice(0, 300);
  };
  const fail = (status: number, type: string, message: string): MoyasarError => ({
    ok: false, status, type: redact(type), message: redact(message),
  });

  async function call(
    method: "GET" | "POST" | "DELETE",
    path: string,
    body?: Record<string, unknown>,
  ): Promise<{ ok: true; status: number; body: unknown } | MoyasarError> {
    const headers: Record<string, string> = { Authorization: authorization, Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";

    // A referenced timer (AbortSignal.timeout's is unref'd) that also covers
    // reading the body; cleared once the body is in.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    let text = "";
    try {
      res = await fetchImpl(`${MOYASAR_API_BASE}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
        signal: controller.signal,
      });
      text = await res.text();
    } catch {
      return controller.signal.aborted
        ? fail(0, "timeout", `Moyasar did not answer within ${timeoutMs} ms`)
        : fail(0, "network_error", "Moyasar could not be reached");
    } finally {
      clearTimeout(timer);
    }

    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
    }

    if (!res.ok) {
      const errBody = isPlainObject(parsed) ? parsed : {};
      return fail(
        res.status,
        typeof errBody.type === "string" && errBody.type ? errBody.type : "http_error",
        typeof errBody.message === "string" && errBody.message ? errBody.message : `Moyasar answered HTTP ${res.status}`,
      );
    }
    return { ok: true, status: res.status, body: parsed };
  }

  function idPath(prefix: string, id: string, suffix = ""): string | null {
    if (typeof id !== "string" || !SAFE_ID.test(id)) return null;
    return `${prefix}/${encodeURIComponent(id)}${suffix}`;
  }

  async function paymentCall(method: "GET" | "POST", path: string | null, body?: Record<string, unknown>) {
    if (!path) return invalidRequest("invalid payment id");
    const r = await call(method, path, body);
    if (!r.ok) return r;
    const payment = mapPayment(r.body);
    return payment ? ({ ok: true, data: payment } as const) : invalidResponse(r.status);
  }

  return {
    /** The mode of the key this client uses — the mode of what it fetches. */
    mode,

    async createIntent(input: CreateIntentInput): Promise<MoyasarResult<MoyasarIntent>> {
      if (!isPosInt(input.amountHalalas)) return invalidRequest("amountHalalas must be a positive integer");
      if (typeof input.description !== "string" || !input.description.trim()) {
        return invalidRequest("description is required");
      }
      const orderId = input.metadata?.order_id;
      if (typeof orderId !== "string" || !orderId) return invalidRequest("metadata.order_id is required");

      let callback: URL;
      try {
        callback = new URL(input.callbackUrl);
      } catch {
        return invalidRequest("callbackUrl must be an absolute URL");
      }
      if (callback.protocol !== "https:" && callback.protocol !== "http:") {
        return invalidRequest("callbackUrl must be http(s)");
      }
      const existing = callback.searchParams.get("order");
      if (existing === null) callback.searchParams.set("order", orderId);
      else if (existing !== orderId) return invalidRequest("callbackUrl names a different order");

      const r = await call("POST", "/v1/payment_intents", {
        amount: input.amountHalalas,
        currency: "SAR",
        description: input.description,
        callback_url: callback.toString(),
      });
      if (!r.ok) return r;
      const b = r.body;
      if (!isPlainObject(b) || typeof b.id !== "string" || !b.id || typeof b.client_secret !== "string" || !b.client_secret) {
        return invalidResponse(r.status);
      }
      return { ok: true, data: { id: b.id, clientSecret: b.client_secret, expiresAt: str(b.expires_at) } };
    },

    async cancelIntent(id: string): Promise<MoyasarResult<{ id: string; status: string | null }>> {
      const path = idPath("/v1/payment_intents", id, "/cancel");
      if (!path) return invalidRequest("invalid intent id");
      const r = await call("POST", path);
      if (!r.ok) return r;
      const b = r.body;
      if (!isPlainObject(b) || typeof b.id !== "string") return invalidResponse(r.status);
      return { ok: true, data: { id: b.id, status: str(b.status) } };
    },

    fetchPayment(id: string): Promise<MoyasarResult<MoyasarPayment>> {
      return paymentCall("GET", idPath("/v1/payments", id));
    },

    refund(id: string, amountHalalas?: number): Promise<MoyasarResult<MoyasarPayment>> {
      if (amountHalalas !== undefined && !isPosInt(amountHalalas)) {
        return Promise.resolve(invalidRequest("refund amount must be a positive integer"));
      }
      return paymentCall(
        "POST",
        idPath("/v1/payments", id, "/refund"),
        amountHalalas === undefined ? undefined : { amount: amountHalalas },
      );
    },

    void(id: string): Promise<MoyasarResult<MoyasarPayment>> {
      return paymentCall("POST", idPath("/v1/payments", id, "/void"));
    },

    async fetchToken(id: string): Promise<MoyasarResult<MoyasarToken>> {
      const path = idPath("/v1/tokens", id);
      if (!path) return invalidRequest("invalid token id");
      const r = await call("GET", path);
      if (!r.ok) return r;
      const token = mapToken(r.body);
      return token ? { ok: true, data: token } : invalidResponse(r.status);
    },

    async deleteToken(id: string): Promise<MoyasarResult<null>> {
      const path = idPath("/v1/tokens", id);
      if (!path) return invalidRequest("invalid token id");
      const r = await call("DELETE", path);
      return r.ok ? { ok: true, data: null } : r;
    },
  };
}

export type MoyasarClient = ReturnType<typeof createMoyasarClient>;
