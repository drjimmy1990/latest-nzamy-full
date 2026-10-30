/**
 * invoiceFinanceCore.test.ts — POST / PATCH /api/v1/lawyer/finance behind the
 * session check (owner handoff 2026-10-30: CODE-F01, CODE-F02 / LIVE-F36).
 * Run with:
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test "src/lib/finance/*.test.ts"
 *
 * The SQL rules (lock, stale snapshot, remainder, idempotency) are proven
 * against real Postgres in supabase/tests/rls/invoice_collections.test.sql;
 * these tests pin the JavaScript side of the wire: what is refused before the
 * database is touched, what is sent to record_invoice_collection, and how its
 * answers reach the lawyer.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fakeDb, has, type FakeQuery } from "../payments/fakeDb.test-helper.ts";
import {
  createInvoiceWith,
  exceedsRemainingAr,
  LEGACY_COLLECT_BODY_AR,
  COLLECT_UNAVAILABLE_AR,
  parseCollectBody,
  recordCollectionWith,
  staleFormAr,
} from "./invoiceFinanceCore.ts";

const ME = "00000000-0000-0000-0000-0000000000a1";
const OTHER = "00000000-0000-0000-0000-0000000000b2";
const ROOT = join(import.meta.dirname, "..", "..", "..");

const invoiceBody = (extra: Record<string, unknown> = {}) => ({
  client: "شركة الاختبار",
  description: "أتعاب",
  amount: 1000,
  ...extra,
});

const writes = (log: FakeQuery[]) => log.filter((q) => q.op !== "select");

// ─── CODE-F01 — POST and a foreign requestId ────────────────────────────────

test("CODE-F01: a requestId assigned to another lawyer is refused with 403 and nothing is written", async () => {
  const { client, log } = fakeDb((q) =>
    q.table === "service_requests" && q.op === "select" ? { data: { assigned_to: OTHER } } : undefined,
  );
  const reply = await createInvoiceWith(
    { admin: client },
    { userId: ME, body: invoiceBody({ requestId: "req-of-someone-else" }) },
  );
  assert.equal(reply.status, 403);
  assert.deepEqual("body" in reply && reply.body, { error: "Forbidden" });
  assert.equal(writes(log).length, 0, "a refused POST must leave no placeholder request and no payment");
  assert.ok(has(log[0], "eq", "id", "req-of-someone-else"), "the ownership read is for the supplied id");
});

test("CODE-F01: a missing request answers exactly like a foreign one — the reply says nothing about whose it is", async () => {
  const foreign = fakeDb((q) => (q.table === "service_requests" ? { data: { assigned_to: OTHER } } : undefined));
  const missing = fakeDb((q) => (q.table === "service_requests" ? { data: null } : undefined));
  const a = await createInvoiceWith({ admin: foreign.client }, { userId: ME, body: invoiceBody({ requestId: "x1" }) });
  const b = await createInvoiceWith({ admin: missing.client }, { userId: ME, body: invoiceBody({ requestId: "x2" }) });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.equal(writes(missing.log).length, 0);
});

test("CODE-F01: an unassigned request (assigned_to null) is refused too", async () => {
  const { client, log } = fakeDb((q) => (q.table === "service_requests" ? { data: { assigned_to: null } } : undefined));
  const reply = await createInvoiceWith({ admin: client }, { userId: ME, body: invoiceBody({ requestId: "r" }) });
  assert.equal(reply.status, 403);
  assert.equal(writes(log).length, 0);
});

test("CODE-F01: an ownership read that fails stops with 500 and never falls through to an insert", async () => {
  const { client, log } = fakeDb((q) =>
    q.table === "service_requests" ? { error: { code: "XX000", message: "boom" } } : undefined,
  );
  const reply = await createInvoiceWith({ admin: client }, { userId: ME, body: invoiceBody({ requestId: "r" }) });
  assert.equal(reply.status, 500);
  assert.equal(writes(log).length, 0);
});

test("CODE-F01: a requestId that is not a string is a 400 before any read", async () => {
  const { client, log } = fakeDb(() => undefined);
  const reply = await createInvoiceWith({ admin: client }, { userId: ME, body: invoiceBody({ requestId: 42 }) });
  assert.equal(reply.status, 400);
  assert.equal(log.length, 0);
});

test("CODE-F01: the lawyer's own request is reused — one payments insert on it, no placeholder", async () => {
  const { client, log } = fakeDb((q) => {
    if (q.table === "service_requests" && q.op === "select") return { data: { assigned_to: ME } };
    if (q.table === "payments" && q.op === "insert") return { data: { id: "p1", ...(q.payload as object) } };
    return undefined;
  });
  const reply = await createInvoiceWith({ admin: client }, { userId: ME, body: invoiceBody({ requestId: "mine" }) });
  assert.equal(reply.status, 200);
  const w = writes(log);
  assert.equal(w.length, 1);
  assert.equal(w[0].table, "payments");
  assert.equal((w[0].payload as { request_id: string }).request_id, "mine");
});

test("CODE-F01: without a requestId the placeholder is created for this lawyer, as before", async () => {
  const { client, log } = fakeDb((q) => {
    if (q.op === "insert" && q.table === "service_requests") return { data: { id: "new-req" } };
    if (q.op === "insert" && q.table === "payments") return { data: { id: "p1" } };
    return undefined;
  });
  const reply = await createInvoiceWith({ admin: client }, { userId: ME, body: invoiceBody() });
  assert.equal(reply.status, 200);
  const [placeholder, payment] = writes(log);
  assert.equal((placeholder.payload as { assigned_to: string }).assigned_to, ME);
  assert.equal((payment.payload as { request_id: string }).request_id, "new-req");
});

// ─── CODE-F02 / LIVE-F36 — PATCH sends one payment, never a running total ───

const collectBody = (extra: Record<string, unknown> = {}) => ({
  paymentId: "427ca382-9c67-4157-b1f1-82b283c69f3b",
  method: "cash",
  amountHalalas: 30000,
  expectedPaidHalalas: 45000,
  idempotencyKey: "form-open-key-0001",
  ...extra,
});

test("LIVE-F36: a page from before the fix (cumulative paidAmount) is refused, never read as a payment", async () => {
  const { client, log } = fakeDb(() => undefined);
  const reply = await recordCollectionWith(
    { admin: client },
    { userId: ME, body: { paymentId: "p", method: "cash", paidAmount: 750 } },
  );
  assert.equal(reply.status, 400);
  assert.deepEqual("body" in reply && reply.body, { error: LEGACY_COLLECT_BODY_AR });
  assert.equal(log.length, 0, "nothing may reach the database");
});

test("CODE-F02: the amount, the form's snapshot and the key are all required — no settle-in-full default", () => {
  for (const drop of ["amountHalalas", "expectedPaidHalalas", "idempotencyKey", "paymentId"]) {
    const b: Record<string, unknown> = collectBody();
    delete b[drop];
    assert.equal(parseCollectBody(b).ok, false, `${drop} missing must be refused`);
  }
  assert.equal(parseCollectBody(collectBody({ amountHalalas: 0 })).ok, false);
  assert.equal(parseCollectBody(collectBody({ amountHalalas: -100 })).ok, false);
  assert.equal(parseCollectBody(collectBody({ amountHalalas: 300.5 })).ok, false, "halalas are whole");
  assert.equal(parseCollectBody(collectBody({ amountHalalas: "30000" })).ok, false);
  assert.equal(parseCollectBody(collectBody({ method: "card" })).ok, false);
  assert.equal(parseCollectBody(collectBody()).ok, true);
});

test("CODE-F02: the route sends this payment and the snapshot to the locking function, with the session's user", async () => {
  const { client, log } = fakeDb((q) =>
    q.op === "rpc" ? { data: { code: "ok", payment: { id: "p", amount: 1000, status: "requires_payment" } } } : undefined,
  );
  const reply = await recordCollectionWith({ admin: client }, { userId: ME, body: collectBody({ userId: OTHER }) });
  assert.equal(reply.status, 200);
  assert.equal(log.length, 1, "one call — no read-then-write from JavaScript");
  assert.equal(log[0].op, "rpc");
  assert.equal(log[0].table, "record_invoice_collection");
  assert.deepEqual(log[0].payload, {
    p_payment_id: "427ca382-9c67-4157-b1f1-82b283c69f3b",
    p_actor: ME,
    p_amount_halalas: 30000,
    p_method: "cash",
    p_expected_paid_halalas: 45000,
    p_idempotency_key: "form-open-key-0001",
  });
});

test("LIVE-F36: the owner's second form (opened at 450, after the first saved 300) gets an Arabic refusal with what is left", async () => {
  const { client } = fakeDb((q) =>
    q.op === "rpc" ? { data: { code: "stale", paid_halalas: 75000, remaining_halalas: 25000 } } : undefined,
  );
  const reply = await recordCollectionWith(
    { admin: client },
    { userId: ME, body: collectBody({ amountHalalas: 40000, idempotencyKey: "second-form-key" }) },
  );
  assert.equal(reply.status, 409);
  const msg = "body" in reply ? reply.body.error : "";
  assert.equal(msg, staleFormAr(75000, 25000));
  assert.match(msg, /بعد فتحك هذا النموذج/);
  assert.match(msg, /٧٥٠/);
  assert.match(msg, /٢٥٠/);
});

test("CODE-F02: an overpayment is refused with an Arabic message naming the remainder", async () => {
  const { client } = fakeDb((q) =>
    q.op === "rpc" ? { data: { code: "exceeds_remaining", paid_halalas: 75000, remaining_halalas: 25000 } } : undefined,
  );
  const reply = await recordCollectionWith(
    { admin: client },
    { userId: ME, body: collectBody({ amountHalalas: 30000, expectedPaidHalalas: 75000 }) },
  );
  assert.equal(reply.status, 409);
  assert.equal("body" in reply && reply.body.error, exceedsRemainingAr(25000));
  assert.match(exceedsRemainingAr(25000), /أكبر من المتبقي.*٢٥٠/);
});

test("CODE-F02: the function's other answers keep their meaning", async () => {
  const cases: Array<[string, number]> = [
    ["not_found", 404],
    ["forbidden", 403],
    ["not_collectable", 409],
    ["key_reused", 409],
    ["invalid", 400],
    ["something_new", 500],
  ];
  for (const [code, status] of cases) {
    const { client } = fakeDb((q) => (q.op === "rpc" ? { data: { code } } : undefined));
    const reply = await recordCollectionWith({ admin: client }, { userId: ME, body: collectBody() });
    assert.equal(reply.status, status, code);
  }
});

test("CODE-F02: a replay of the same form answers 200 with the stored row", async () => {
  const { client } = fakeDb((q) =>
    q.op === "rpc" ? { data: { code: "ok", replay: true, payment: { id: "p", amount: 1000 } } } : undefined,
  );
  const reply = await recordCollectionWith({ admin: client }, { userId: ME, body: collectBody() });
  assert.equal(reply.status, 200);
  assert.equal("replay" in reply && reply.replay, true);
});

test("CODE-F02: before the migration runs, PATCH answers 503 and writes nothing — no fallback to the overwrite", async () => {
  for (const code of ["PGRST202", "42883"]) {
    const { client, log } = fakeDb((q) => (q.op === "rpc" ? { error: { code, message: "missing" } } : undefined));
    const reply = await recordCollectionWith({ admin: client }, { userId: ME, body: collectBody() });
    assert.equal(reply.status, 503);
    assert.equal("body" in reply && reply.body.error, COLLECT_UNAVAILABLE_AR);
    assert.equal(log.length, 1, "only the rpc call — no update follows");
  }
});

// ─── the wire: route and page ───────────────────────────────────────────────

test("the route delegates both writes and no longer updates payments itself", () => {
  const route = readFileSync(join(ROOT, "src", "app", "api", "v1", "lawyer", "finance", "route.ts"), "utf8");
  assert.match(route, /createInvoiceWith\(\{ admin: service \}, \{ userId: user\.id, body \}\)/);
  assert.match(route, /recordCollectionWith\(\{ admin: service \}, \{ userId: user\.id, body \}\)/);
  assert.doesNotMatch(route, /\.update\(/, "the overwrite lives on only in the SQL function");
  assert.doesNotMatch(route, /\.insert\(/);
});

test("the page sends this payment in halalas with its snapshot and key — never a cumulative paidAmount", () => {
  const page = readFileSync(join(ROOT, "src", "app", "dashboard", "lawyer", "finance", "page.tsx"), "utf8");
  const call = page.slice(page.indexOf('"/api/v1/lawyer/finance", "PATCH"'), page.indexOf('"/api/v1/lawyer/finance", "PATCH"') + 400);
  assert.match(call, /amountHalalas: Math\.round\(collectedNow \* 100\)/);
  assert.match(call, /expectedPaidHalalas: Math\.round\(alreadyCollected \* 100\)/);
  assert.match(call, /idempotencyKey: collectKey/);
  assert.doesNotMatch(call, /paidAmount:/);
  assert.match(page, /setCollectKey\(/, "a key is made when the form opens");
});
