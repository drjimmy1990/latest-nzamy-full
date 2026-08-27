/**
 * serviceOrders.test.ts
 *
 * WHAT IS UNDER TEST, AND WHAT IS NOT. `createServiceOrder` is a genuine thin
 * wrapper — it builds a body and hands it to `apiMutate` — and a test for it
 * could only assert that a stub was called with the object one line above.
 * That is busywork, and a suite padded with it reads as more thorough than it
 * is. It is deliberately absent.
 *
 * The two READS are a different matter. Each one decides whether an HTTP 200
 * is an answer or a failure wearing an answer's clothes, and every wrong
 * decision here is SILENT: the page still renders, it just tells the client
 * something false about their own orders.
 *
 *   «لم تقم بطلب أي خدمة بعد»   over a database error
 *   «الطلب غير موجود»            over an expired session
 *
 * The route answers a Supabase failure with `200 {data: [], degraded: true}`
 * on purpose (other callers depend on that), so «could not read» and «you have
 * none» arrive down the same wire with the same status code. Which of the two
 * the client is told is decided entirely by the four `throw`s below.
 *
 * ── ABOUT THE FETCH STUB ────────────────────────────────────────────────────
 *
 * `globalThis.fetch` is replaced for the duration of each case and restored in
 * a `finally`. That is not a mocking framework and none is being introduced:
 * nothing below asserts that fetch was called, or with what. The stub is the
 * server's answer, and every assertion is about the DECISION this module makes
 * on receiving it — which is the only thing in the file worth pinning.
 *
 * Run: npm run test:unit
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  listMyServiceOrders,
  getServiceOrder,
  ServiceOrderNotFoundError,
  ORDER_STATUS_AR,
} from "./serviceOrders.ts";

/** One canned HTTP answer, for the duration of one call. */
async function withResponse<T>(
  response: { ok?: boolean; status?: number; body?: unknown },
  run: () => Promise<T>,
): Promise<T> {
  const original = globalThis.fetch;
  const status = response.status ?? 200;
  globalThis.fetch = (async () => ({
    ok: response.ok ?? (status >= 200 && status < 300),
    status,
    json: async () => response.body,
  })) as unknown as typeof globalThis.fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

const ORDER = {
  id: "8f14e45f-ceea-467a-9575-1a5b3d8f0e11",
  type: "contracts",
  title: "صياغة عقد عمل",
  description: "",
  status: "pending_assignment",
  created_at: "2026-04-12T09:30:00.000Z",
  updated_at: "2026-04-12T09:30:00.000Z",
  metadata: {},
};

// ── listMyServiceOrders: does it swallow the degraded marker, or forward it? ──

test("a degraded 200 is FORWARDED as a failure, not swallowed into an empty list", () => {
  // The answer to the question this file was written to settle. The route
  // returns HTTP 200 with an empty `data` when its Supabase query errored, and
  // reading only `data` prints «لم تقم بطلب أي خدمة بعد» over a database
  // failure. It forwards — as a throw, which both call sites already catch
  // into a real «تعذّرت القراءة» state.
  return assert.rejects(
    () => withResponse({ body: { data: [], total: 0, degraded: true } }, listMyServiceOrders),
    /تعذّر تحميل الطلبات/,
  );
});

test("degraded wins even when rows came with it", async () => {
  // A partial result is still a failed read: the client cannot be shown four
  // orders under a heading that implies it is all of them.
  await assert.rejects(
    () => withResponse({ body: { data: [ORDER], degraded: true } }, listMyServiceOrders),
    /تعذّر تحميل الطلبات/,
  );
});

test("a healthy empty list is an honest empty list", async () => {
  // The other half of the distinction. If this threw, a client with no orders
  // would be told the read had failed — the same defect pointing the other way.
  const orders = await withResponse({ body: { data: [], total: 0 } }, listMyServiceOrders);
  assert.deepEqual(orders, []);
});

test("rows are returned as they came", async () => {
  const orders = await withResponse({ body: { data: [ORDER] } }, listMyServiceOrders);
  assert.equal(orders.length, 1);
  assert.equal(orders[0].id, ORDER.id);
});

test("a non-200 is a failure", async () => {
  for (const status of [401, 403, 500, 503]) {
    await assert.rejects(
      () => withResponse({ status, body: { error: "nope" } }, listMyServiceOrders),
      /تعذّر تحميل الطلبات/,
      String(status),
    );
  }
});

test("a 200 with no data array is a failure, not «you have no orders»", async () => {
  // This function used to end `?? []`, so an error envelope behind a 200 — a
  // proxy's, a gateway's, a future route shape — became an empty orders page.
  // The same case `listFromApi` rejects in the shared contract.
  for (const body of [{}, null, { error: "Unauthorized" }, { data: null }, { data: "[]" }]) {
    await assert.rejects(
      () => withResponse({ body }, listMyServiceOrders),
      /تعذّر تحميل الطلبات/,
      JSON.stringify(body),
    );
  }
});

// ── getServiceOrder: "not there" and "could not check" are different ─────────

test("404 means the order is not there", async () => {
  await assert.rejects(
    () => withResponse({ status: 404, body: { error: "not found" } }, () => getServiceOrder(ORDER.id)),
    (err: unknown) => err instanceof ServiceOrderNotFoundError,
  );
});

test("any other failure is NOT «the order does not exist»", async () => {
  // An expired session, an RLS refusal and a 500 all used to be able to reach
  // the detail page as «الطلب غير موجود» — telling a client their own order had
  // vanished. The distinct error class is what keeps the two sentences apart.
  for (const status of [401, 403, 500]) {
    await assert.rejects(
      () => withResponse({ status, body: { error: "x" } }, () => getServiceOrder(ORDER.id)),
      (err: unknown) =>
        err instanceof Error && !(err instanceof ServiceOrderNotFoundError),
      String(status),
    );
  }
});

test("a 200 with no data is a failure, never an undefined order", async () => {
  // A single-resource GET has no empty state, so there is no `degraded` marker
  // to read here and none is expected: a body with no `data` is the only way
  // this endpoint can lie, and returning `undefined` typed as ServiceOrder
  // would crash the detail page one property access later.
  for (const body of [{}, null, { data: null }]) {
    await assert.rejects(
      () => withResponse({ body }, () => getServiceOrder(ORDER.id)),
      (err: unknown) =>
        err instanceof Error && !(err instanceof ServiceOrderNotFoundError),
      JSON.stringify(body),
    );
  }
});

test("a real order comes back", async () => {
  const order = await withResponse({ body: { data: ORDER } }, () => getServiceOrder(ORDER.id));
  assert.equal(order.id, ORDER.id);
});

// ── The status vocabulary ────────────────────────────────────────────────────

test("every status has wording and a tone, and none of it is empty", () => {
  // ORDER_STATUS_AR is the app's ONE status vocabulary — clientDashboardCards.ts
  // keeps a copy of it and their agreement is pinned in that module's own test.
  // An entry added here with an empty label renders as a blank pill.
  for (const [status, entry] of Object.entries(ORDER_STATUS_AR)) {
    assert.ok(entry.label.trim().length > 0, `${status} has no label`);
    assert.ok(entry.tone.trim().length > 0, `${status} has no tone`);
    // A raw English key in the middle of Arabic copy is the leak this codebase
    // keeps having to fix; a label that is still its own key would be one.
    assert.notEqual(entry.label, status);
  }
});
