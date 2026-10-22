import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getBillingWith, deleteCardWith, readReceiptWith, CARD_MODE_MISMATCH_AR, logBillingError } from "./billingCore.ts";
import { fakeDb, has } from "./fakeDb.test-helper.ts";

const USER = "user-a";
const CARD = "00000000-0000-0000-0000-000000000001";
// What the user's RLS client may read (granted to authenticated) …
const visible = { id: CARD, merchant: "platform", status: "active" };
// … and what only the service client may read.
const secret = { token: "token-secret", live: false };
type DeleteReply = { ok: true; data: null } | { ok: false; status: number; type: string; message: string };
const gw = (deleteToken: (id: string) => Promise<DeleteReply>, mode: "test" | "live" = "test") =>
  async () => ({ mode, deleteToken });
const errors = (t: TestContext) => t.mock.method(console, "error", () => {});
const logged = (m: ReturnType<typeof errors>) => m.mock.calls.map(c => c.arguments.map(String).join(" ")).join("\n");

test("billing reads the user's own rows through the RLS client, never selecting a token or metadata", async () => {
  const db = fakeDb(q => q.table === "points_balance" ? { data: 300 } : { data: [] });
  const r = await getBillingWith(db.client, USER);
  assert.equal(r.status, 200);
  for (const q of db.log.filter(q => q.op === "select")) {
    assert.ok(has(q, "eq", "user_id", USER));
    assert.ok(q.columns && !q.columns.includes("*") && !/\b(token|metadata)\b/.test(q.columns));
  }
  assert.deepEqual(db.log.find(q => q.table === "points_balance")?.payload, { p_user: USER });
  assert.equal((r.body as { pointsBalance: number }).pointsBalance, 300);
});
test("the billing route and page pass the RLS client (createClient), never the service client", () => {
  for (const file of ["src/app/api/v1/billing/route.ts", "src/app/dashboard/billing/page.tsx"]) {
    const src = readFileSync(file, "utf8");
    assert.ok(!src.includes("createServiceClient"), file);
    assert.match(src, /getBillingWith\(supabase,/, file);
  }
});
test("missing billing schema returns unavailable, never invents a zero balance", async (t) => {
  const log = errors(t);
  const db = fakeDb(() => ({ error: { code: "42P01" } }));
  assert.equal((await getBillingWith(db.client, USER)).status, 503);
  assert.match(logged(log), /42P01/);
});
test("card delete: another user's or absent card is 404 from the RLS read, with no service read and no gateway call", async () => {
  const rls = fakeDb(() => ({ data: null }));
  const admin = fakeDb(() => ({ data: secret }));
  let calls = 0;
  const r = await deleteCardWith({ rls: rls.client, admin: admin.client, gateway: async () => { calls++; return null; } }, USER, CARD);
  assert.equal(r.status, 404);
  assert.equal(calls, 0);
  assert.equal(admin.log.length, 0);
  assert.equal(rls.log[0].table, "payment_methods");
  assert.ok(has(rls.log[0], "eq", "user_id", USER) && has(rls.log[0], "eq", "id", CARD));
  assert.ok(rls.log[0].columns && !/\b(token|live)\b/.test(rls.log[0].columns), "the RLS read selects only granted columns");
});
test("card delete: RLS read, then the service token read, then the gateway, then the service update", async () => {
  const events: string[] = [];
  const rls = fakeDb(q => { events.push(`rls:${q.op}`); return { data: visible }; });
  const admin = fakeDb(q => { events.push(`service:${q.op}`); return { data: q.op === "select" ? secret : [{ id: CARD }] }; });
  const r = await deleteCardWith({ rls: rls.client, admin: admin.client, gateway: gw(async id => { assert.equal(id, secret.token); events.push("gateway"); return { ok: true, data: null }; }) }, USER, CARD);
  assert.equal(r.status, 200);
  assert.deepEqual(events, ["rls:select", "service:select", "gateway", "service:update"]);
  assert.equal(admin.log[0].columns, "token,live");
  for (const q of admin.log) assert.ok(has(q, "eq", "user_id", USER) && has(q, "eq", "id", CARD));
  assert.deepEqual(admin.log[1].payload, { status: "deleted" });
  assert.ok(!JSON.stringify(r.body).includes(secret.token));
});
test("gateway failure leaves the local card unchanged", async () => {
  const rls = fakeDb(() => ({ data: visible }));
  const admin = fakeDb(() => ({ data: secret }));
  const r = await deleteCardWith({ rls: rls.client, admin: admin.client, gateway: gw(async () => ({ ok: false, status: 500, type: "http_error", message: "unavailable" })) }, USER, CARD);
  assert.equal(r.status, 502);
  assert.ok(!admin.log.some(q => q.op === "update"));
});
test("a card saved in another mode (legacy null, or the other gateway mode) gets the specific 409, never a token sent", async () => {
  for (const [live, mode] of [[null, "test"], [false, "live"], [true, "test"]] as const) {
    const rls = fakeDb(() => ({ data: visible }));
    const admin = fakeDb(() => ({ data: { ...secret, live } }));
    let calls = 0;
    const r = await deleteCardWith({ rls: rls.client, admin: admin.client, gateway: gw(async () => { calls++; return { ok: true, data: null }; }, mode) }, USER, CARD);
    assert.equal(r.status, 409);
    assert.deepEqual(r.body, { error: CARD_MODE_MISMATCH_AR });
    assert.equal(calls, 0);
    assert.ok(!admin.log.some(q => q.op === "update"));
  }
  assert.equal(CARD_MODE_MISMATCH_AR, "لا يمكن حذف هذه البطاقة من هنا لأنها حُفظت في وضع مختلف؛ تواصل مع الدعم");
});
test("another merchant's card never reaches the token read or the gateway", async () => {
  const rls = fakeDb(() => ({ data: { ...visible, merchant: "office" } }));
  const admin = fakeDb(() => ({ data: secret }));
  let calls = 0;
  const r = await deleteCardWith({ rls: rls.client, admin: admin.client, gateway: gw(async () => { calls++; return { ok: true, data: null }; }) }, USER, CARD);
  assert.equal(r.status, 503);
  assert.equal(calls, 0);
  assert.equal(admin.log.length, 0);
});
test("a remotely missing token allows retry after local status persistence failed", async () => {
  const rls = fakeDb(() => ({ data: visible }));
  const admin = fakeDb(q => ({ data: q.op === "select" ? secret : [{ id: CARD }] }));
  const r = await deleteCardWith({ rls: rls.client, admin: admin.client, gateway: gw(async () => ({ ok: false, status: 404, type: "not_found", message: "absent" })) }, USER, CARD);
  assert.equal(r.status, 200);
});
test("token deleted at the gateway but the local update failed: an error log with the card id, never the token", async (t) => {
  const log = errors(t);
  for (const failure of [{ error: { code: "08006" } }, { data: [] }]) {
    const rls = fakeDb(() => ({ data: visible }));
    const admin = fakeDb(q => q.op === "select" ? { data: secret } : failure);
    const r = await deleteCardWith({ rls: rls.client, admin: admin.client, gateway: gw(async () => ({ ok: true, data: null })) }, USER, CARD);
    assert.equal(r.status, 503);
  }
  const text = logged(log);
  assert.equal(log.mock.calls.filter(c => String(c.arguments[0]).includes("local update failed")).length, 2, "logged on every occurrence");
  assert.ok(text.includes(CARD));
  assert.ok(!text.includes(secret.token));
});
test("card lookup failures and thrown errors are logged once by code", async (t) => {
  const log = errors(t);
  for (let i = 0; i < 2; i++) {
    const rls = fakeDb(() => ({ error: { code: "TEST_LOOKUP_1" } }));
    assert.equal((await deleteCardWith({ rls: rls.client, admin: fakeDb(() => ({})).client, gateway: async () => null }, USER, CARD)).status, 503);
  }
  const boom = { from() { throw new Error("TEST_THROW_1"); } } as unknown as Parameters<typeof deleteCardWith>[0]["rls"];
  assert.equal((await deleteCardWith({ rls: boom, admin: boom, gateway: async () => null }, USER, CARD)).status, 503);
  const text = logged(log);
  assert.equal(text.split("TEST_LOOKUP_1").length - 1, 1, "log once by code");
  assert.match(text, /card_delete_exception/);
  logBillingError("TEST_ROUTE_1");
  logBillingError("TEST_ROUTE_1");
  assert.equal(logged(log).split("TEST_ROUTE_1").length - 1, 1);
});
test("receipt: the order through RLS, then only metadata->payment_method through the service client", async () => {
  const rls = fakeDb(() => ({ data: { id: CARD, status: "paid" } }));
  const admin = fakeDb(q => ({ data: q.table === "payment_orders" ? { payment_method: { last_four: "1111", type: "creditcard" } } : { value: {} } }));
  const result = await readReceiptWith(rls.client, admin.client, USER, CARD);
  assert.equal(rls.log.length, 1);
  assert.equal(rls.log[0].table, "payment_orders");
  assert.ok(has(rls.log[0], "eq", "user_id", USER) && has(rls.log[0], "eq", "id", CARD));
  assert.ok(rls.log[0].columns && !/\bmetadata\b/.test(rls.log[0].columns));
  const meta = admin.log.find(q => q.table === "payment_orders");
  assert.equal(meta?.columns, "payment_method:metadata->payment_method");
  assert.ok(meta && has(meta, "eq", "user_id", USER) && has(meta, "eq", "id", CARD));
  assert.ok(admin.log.some(q => q.table === "platform_settings"));
  assert.ok(result.order);
  assert.equal(result.order.last_four, "1111");
  assert.ok(!JSON.stringify(result).includes("creditcard"));
});
test("receipt: an absent order stops at the RLS read; a failed card-details read degrades, not fails", async (t) => {
  const log = errors(t);
  const absent = fakeDb(() => ({ data: null }));
  const unused = fakeDb(() => ({}));
  assert.equal((await readReceiptWith(absent.client, unused.client, USER, CARD)).order, null);
  assert.equal(unused.log.length, 0);
  const rls = fakeDb(() => ({ data: { id: CARD, status: "paid" } }));
  const admin = fakeDb(q => q.table === "payment_orders" ? { error: { code: "TEST_META_1" } } : { data: { value: {} } });
  const r = await readReceiptWith(rls.client, admin.client, USER, CARD);
  assert.ok(r.order && !r.unavailable);
  assert.equal(r.order.last_four, null);
  assert.match(logged(log), /TEST_META_1/);
  const broken = fakeDb(() => ({ error: { code: "TEST_ORDER_1" } }));
  assert.equal((await readReceiptWith(broken.client, unused.client, USER, CARD)).unavailable, true);
  assert.match(logged(log), /TEST_ORDER_1/);
});
