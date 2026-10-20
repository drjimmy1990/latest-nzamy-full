import assert from "node:assert/strict";
import test from "node:test";
import {
  MOYASAR_API_BASE,
  MOYASAR_TIMEOUT_MS,
  createMoyasarClient,
} from "./moyasarClient.ts";
import type { MoyasarConfig } from "./moyasarConfig.ts";

// Placeholder test values only; they are never real keys.
const CFG: MoyasarConfig = {
  enabled: true,
  mode: "test",
  secretKey: "sk_test_placeholderSecret123",
  publishableKey: "pk_test_placeholderPublish123",
  webhookSecret: "whsec_placeholder_456",
};
const BASIC = `Basic ${Buffer.from(`${CFG.secretKey}:`).toString("base64")}`;
const SECRETS = [
  CFG.secretKey,
  CFG.publishableKey,
  CFG.webhookSecret,
  Buffer.from(`${CFG.secretKey}:`).toString("base64"),
];

interface Call {
  url: string;
  init: RequestInit;
}

function fakeFetch(respond: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), init: init ?? {} };
    calls.push(call);
    return respond(call);
  }) as typeof fetch;
  return { impl, calls };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const header = (init: RequestInit, name: string) => new Headers(init.headers).get(name);

const PAYMENT = {
  id: "760878ec-d1d3-5f72-9056-191683f55872",
  status: "paid",
  amount: 45885,
  fee: 0,
  currency: "SAR",
  refunded: 0,
  captured: 45885,
  description: "NEZAMY — باقة",
  invoice_id: null,
  metadata: { order_id: "0b9f5b5e-7a4c-4f6e-9a33-6e2c2a0f5a11" },
  created_at: "2026-10-20T10:00:00.000Z",
  source: {
    type: "creditcard",
    company: "visa",
    name: "A B",
    number: "4111-11XX-XXXX-1111",
    token: "token_abc123",
    message: "APPROVED",
    transaction_url: "https://example.invalid/3ds",
  },
};

test("default timeout is 15 seconds and the base URL is Moyasar's API", () => {
  assert.equal(MOYASAR_TIMEOUT_MS, 15_000);
  assert.equal(MOYASAR_API_BASE, "https://api.moyasar.com");
});

test("createIntent posts amount/currency/description/callback_url with Basic auth", async () => {
  const { impl, calls } = fakeFetch(() =>
    json(201, { id: "pi_1", status: "initiated", client_secret: "cs_1", expires_at: "2026-10-20T11:00:00Z" }),
  );
  const client = createMoyasarClient(CFG, impl);
  const result = await client.createIntent({
    amountHalalas: 45885,
    description: "NEZAMY — باقة",
    callbackUrl: "https://nezamy.sa/payments/result",
    metadata: { order_id: "0b9f5b5e-7a4c-4f6e-9a33-6e2c2a0f5a11" },
  });

  assert.deepEqual(result, {
    ok: true,
    data: { id: "pi_1", clientSecret: "cs_1", expiresAt: "2026-10-20T11:00:00Z" },
  });
  assert.equal(calls.length, 1);
  const [{ url, init }] = calls;
  assert.equal(url, "https://api.moyasar.com/v1/payment_intents");
  assert.equal(init.method, "POST");
  assert.equal(header(init, "authorization"), BASIC);
  assert.equal(header(init, "content-type"), "application/json");
  assert.equal(init.cache, "no-store");
  assert.ok(init.signal, "every call carries an abort signal");
  assert.deepEqual(JSON.parse(String(init.body)), {
    amount: 45885,
    currency: "SAR",
    description: "NEZAMY — باقة",
    callback_url: "https://nezamy.sa/payments/result?order=0b9f5b5e-7a4c-4f6e-9a33-6e2c2a0f5a11",
  });
});

test("createIntent keeps a callback_url that already names the same order", async () => {
  const { impl, calls } = fakeFetch(() => json(201, { id: "pi_1", client_secret: "cs_1", expires_at: null }));
  const client = createMoyasarClient(CFG, impl);
  const ok = await client.createIntent({
    amountHalalas: 100,
    description: "x",
    callbackUrl: "https://nezamy.sa/payments/result?order=abc-1",
    metadata: { order_id: "abc-1" },
  });
  assert.equal(ok.ok, true);
  assert.equal(JSON.parse(String(calls[0].init.body)).callback_url, "https://nezamy.sa/payments/result?order=abc-1");
});

test("createIntent refuses bad input without calling Moyasar", async () => {
  const { impl, calls } = fakeFetch(() => json(201, {}));
  const client = createMoyasarClient(CFG, impl);
  const base = {
    amountHalalas: 100,
    description: "x",
    callbackUrl: "https://nezamy.sa/payments/result",
    metadata: { order_id: "abc-1" },
  };
  for (const input of [
    { ...base, amountHalalas: 0 },
    { ...base, amountHalalas: -5 },
    { ...base, amountHalalas: 10.5 },
    { ...base, description: "" },
    { ...base, callbackUrl: "not a url" },
    { ...base, callbackUrl: "ftp://nezamy.sa/x" },
    { ...base, callbackUrl: "https://nezamy.sa/payments/result?order=other" },
    { ...base, metadata: { order_id: "" } },
  ]) {
    const r = await client.createIntent(input);
    assert.equal(r.ok, false, JSON.stringify(input));
    assert.equal(!r.ok && r.type, "invalid_request");
  }
  assert.equal(calls.length, 0);
});

test("cancelIntent, refund, void, fetchToken and deleteToken use the right method and URL", async () => {
  const { impl, calls } = fakeFetch(({ url, init }) => {
    if (init.method === "DELETE") return new Response(null, { status: 204 });
    if (url.includes("/tokens/")) {
      return json(200, {
        id: "token_abc123", status: "active", brand: "visa", funding: "credit", country: "SA",
        month: "09", year: "2030", name: "A B", last_four: "1111",
      });
    }
    if (url.includes("/payment_intents/")) return json(200, { id: "pi_1", status: "canceled" });
    return json(200, { ...PAYMENT, status: url.endsWith("/void") ? "voided" : "refunded" });
  });
  const client = createMoyasarClient(CFG, impl);

  const cancel = await client.cancelIntent("pi_1");
  assert.deepEqual(cancel, { ok: true, data: { id: "pi_1", status: "canceled" } });

  const refundAll = await client.refund(PAYMENT.id);
  assert.equal(refundAll.ok && refundAll.data.status, "refunded");
  const refundPart = await client.refund(PAYMENT.id, 1000);
  assert.equal(refundPart.ok, true);
  const voided = await client.void(PAYMENT.id);
  assert.equal(voided.ok && voided.data.status, "voided");

  const token = await client.fetchToken("token_abc123");
  assert.deepEqual(token, {
    ok: true,
    data: {
      id: "token_abc123", status: "active", brand: "visa", funding: "credit", country: "SA",
      month: "09", year: "2030", name: "A B", lastFour: "1111",
    },
  });
  const deleted = await client.deleteToken("token_abc123");
  assert.deepEqual(deleted, { ok: true, data: null });

  assert.deepEqual(
    calls.map((c) => [c.init.method, c.url.replace(MOYASAR_API_BASE, "")]),
    [
      ["POST", "/v1/payment_intents/pi_1/cancel"],
      ["POST", `/v1/payments/${PAYMENT.id}/refund`],
      ["POST", `/v1/payments/${PAYMENT.id}/refund`],
      ["POST", `/v1/payments/${PAYMENT.id}/void`],
      ["GET", "/v1/tokens/token_abc123"],
      ["DELETE", "/v1/tokens/token_abc123"],
    ],
  );
  for (const c of calls) assert.equal(header(c.init, "authorization"), BASIC);
  assert.equal(calls[1].init.body, undefined, "a full refund sends no body");
  assert.deepEqual(JSON.parse(String(calls[2].init.body)), { amount: 1000 });
  assert.equal(calls[4].init.body, undefined);
});

test("refund refuses a non-positive or fractional amount without calling Moyasar", async () => {
  const { impl, calls } = fakeFetch(() => json(200, PAYMENT));
  const client = createMoyasarClient(CFG, impl);
  for (const amount of [0, -1, 1.5]) {
    const r = await client.refund(PAYMENT.id, amount);
    assert.equal(!r.ok && r.type, "invalid_request");
  }
  assert.equal(calls.length, 0);
});

test("fetchPayment GETs the payment and maps it", async () => {
  const { impl, calls } = fakeFetch(() => json(200, PAYMENT));
  const client = createMoyasarClient(CFG, impl);
  const r = await client.fetchPayment(PAYMENT.id);

  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].url, `https://api.moyasar.com/v1/payments/${PAYMENT.id}`);
  assert.equal(calls[0].init.cache, "no-store");
  assert.deepEqual(r, {
    ok: true,
    data: {
      id: PAYMENT.id,
      status: "paid",
      amount: 45885,
      currency: "SAR",
      metadata: PAYMENT.metadata,
      source: {
        type: "creditcard",
        company: "visa",
        number: "4111-11XX-XXXX-1111",
        token: "token_abc123",
        message: "APPROVED",
        transactionUrl: "https://example.invalid/3ds",
      },
      invoice_id: null,
      refunded: 0,
      captured: 45885,
      createdAt: "2026-10-20T10:00:00.000Z",
    },
  });
  assert.equal(r.ok && "live" in r.data, false, "Moyasar's payment object has no live field");
});

test("fetchPayment passes a boolean live through when the body has one", async () => {
  const { impl } = fakeFetch(() => json(200, { ...PAYMENT, live: false }));
  const r = await createMoyasarClient(CFG, impl).fetchPayment(PAYMENT.id);
  assert.equal(r.ok && r.data.live, false);
});

test("fetchPayment rejects a malformed 2xx body", async () => {
  for (const body of [
    { ...PAYMENT, amount: "45885" },
    { ...PAYMENT, amount: 1.5 },
    { ...PAYMENT, id: undefined },
    { ...PAYMENT, status: "weird" },
    { ...PAYMENT, currency: undefined },
    { ...PAYMENT, source: null },
    "not an object",
  ]) {
    const { impl } = fakeFetch(() => json(200, body));
    const r = await createMoyasarClient(CFG, impl).fetchPayment(PAYMENT.id);
    assert.equal(r.ok, false, JSON.stringify(body));
    assert.equal(!r.ok && r.type, "invalid_response");
  }
});

test("path ids are validated and never reach Moyasar unchecked", async () => {
  const { impl, calls } = fakeFetch(() => json(200, PAYMENT));
  const client = createMoyasarClient(CFG, impl);
  for (const id of ["", "../tokens/x", "a/b", "a?b=1", "a b", "x".repeat(201)]) {
    const r = await client.fetchPayment(id);
    assert.equal(!r.ok && r.type, "invalid_request", id);
  }
  assert.equal(calls.length, 0);
});

test("a 5xx surfaces as ok:false, JSON body or not", async () => {
  const jsonErr = fakeFetch(() => json(503, { type: "api_error", message: "Service unavailable" }));
  const a = await createMoyasarClient(CFG, jsonErr.impl).fetchPayment(PAYMENT.id);
  assert.deepEqual(a, { ok: false, status: 503, type: "api_error", message: "Service unavailable" });

  const htmlErr = fakeFetch(() => new Response("<html>Bad Gateway</html>", { status: 502 }));
  const b = await createMoyasarClient(CFG, htmlErr.impl).createIntent({
    amountHalalas: 100, description: "x", callbackUrl: "https://nezamy.sa/r", metadata: { order_id: "o1" },
  });
  assert.equal(b.ok, false);
  assert.equal(!b.ok && b.status, 502);
  assert.equal(!b.ok && b.type, "http_error");
  assert.equal(typeof (!b.ok && b.message), "string");
});

test("a 4xx keeps Moyasar's type and message", async () => {
  const { impl } = fakeFetch(() =>
    json(400, { type: "invalid_request_error", message: "Validation Failed", errors: { amount: ["bad"] } }),
  );
  const r = await createMoyasarClient(CFG, impl).refund(PAYMENT.id, 100);
  assert.deepEqual(r, { ok: false, status: 400, type: "invalid_request_error", message: "Validation Failed" });
});

test("a network error and a timeout surface as ok:false", async () => {
  const net = fakeFetch(() => {
    throw new TypeError("fetch failed");
  });
  const a = await createMoyasarClient(CFG, net.impl).fetchToken("token_1");
  assert.deepEqual(a.ok ? null : [a.status, a.type], [0, "network_error"]);

  const hang = (async (_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
    })) as typeof fetch;
  const b = await createMoyasarClient(CFG, hang, { timeoutMs: 20 }).fetchPayment(PAYMENT.id);
  assert.deepEqual(b.ok ? null : [b.status, b.type], [0, "timeout"]);
});

test("no key appears in any error message, even when Moyasar echoes one", async () => {
  const echo = `bad key ${CFG.secretKey} / ${Buffer.from(`${CFG.secretKey}:`).toString("base64")} / ${CFG.publishableKey} / sk_live_otherKey999`;
  const sources: Array<() => Response> = [
    () => json(401, { type: "authentication_error", message: echo }),
    () => json(500, { type: CFG.secretKey, message: echo }),
    () => new Response(echo, { status: 500 }),
    () => {
      throw new Error(echo);
    },
  ];
  for (const respond of sources) {
    const { impl } = fakeFetch(respond);
    const client = createMoyasarClient(CFG, impl);
    const results = [
      await client.fetchPayment(PAYMENT.id),
      await client.createIntent({ amountHalalas: 100, description: "x", callbackUrl: "https://nezamy.sa/r", metadata: { order_id: "o1" } }),
      await client.deleteToken("token_1"),
    ];
    for (const r of results) {
      assert.equal(r.ok, false);
      const text = JSON.stringify(r);
      for (const s of SECRETS) assert.equal(text.includes(s), false, text);
      assert.equal(/sk_(test|live)_|pk_(test|live)_/.test(text), false, text);
    }
  }
});

test("createMoyasarClient refuses a disabled or mismatched config without naming the key", () => {
  assert.throws(
    () => createMoyasarClient({ enabled: false, reason: "x" } as unknown as MoyasarConfig, fetch),
    (err: Error) => !SECRETS.some((s) => err.message.includes(s)),
  );
  assert.throws(
    () => createMoyasarClient({ ...CFG, mode: "live" }, fetch),
    (err: Error) => !SECRETS.some((s) => err.message.includes(s)),
  );
});
