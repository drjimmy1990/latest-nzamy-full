/**
 * invoiceFinanceCore.test.ts — POST / PATCH /api/v1/lawyer/finance behind the
 * session check (owner handoff 2026-10-30: CODE-F01, CODE-F02 / LIVE-F36).
 * Run with:
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test "src/lib/finance/*.test.ts"
 *
 * The SQL rules (ownership, one transaction, lock, stale snapshot, remainder,
 * idempotency) are proven
 * against real Postgres in supabase/tests/rls/invoice_collections.test.sql;
 * these tests pin the JavaScript side of the wire: what is refused before the
 * database is touched, what is sent to record_invoice_collection, and how its
 * answers reach the lawyer.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fakeDb } from "../payments/fakeDb.test-helper.ts";
import {
  createInvoiceWith,
  parseVoidBody,
  readIssuerVat,
  VAT_NUMBER_INVALID_FIRM_AR,
  VAT_NUMBER_INVALID_LAWYER_AR,
  VOID_ALREADY_AR,
  VOID_HAS_COLLECTIONS_AR,
  VOID_NOT_VOIDABLE_AR,
  VOID_REASON_AR,
  VOID_UNAVAILABLE_AR,
  voidInvoiceWith,
  CREATE_INVALID_AR,
  CREATE_KEY_REUSED_AR,
  CREATE_UNAVAILABLE_AR,
  exceedsRemainingAr,
  LEGACY_COLLECT_BODY_AR,
  LEGACY_CREATE_BODY_AR,
  COLLECT_UNAVAILABLE_AR,
  parseCollectBody,
  parseCreateBody,
  recordCollectionWith,
  staleFormAr,
} from "./invoiceFinanceCore.ts";

const ME = "00000000-0000-0000-0000-0000000000a1";
const OTHER = "00000000-0000-0000-0000-0000000000b2";
const CARD = "11111111-2222-4333-8444-555555555555";
const ROOT = join(import.meta.dirname, "..", "..", "..");

const invoiceBody = (extra: Record<string, unknown> = {}) => ({
  client: "شركة الاختبار",
  clientType: "company",
  description: "أتعاب",
  amountHalalas: 100000,
  idempotencyKey: "create-form-key-0001",
  ...extra,
});

const okCreate = () =>
  fakeDb((q) => (q.op === "rpc" ? { data: { code: "ok", replay: false, payment: { id: "p1", amount: 1000 } } } : undefined));

// ─── CODE-F01 / CODE-F22 / CODE-F21 — POST issues one invoice, once ─────────
// The ownership checks and the "nothing written on refusal" guarantee now live
// in public.create_lawyer_invoice; supabase/tests/rls/invoice_collections.test.sql
// counts service_requests and payments rows around every refusal (T13–T18).

test("CODE-F22: a page from before the fix (riyal amount, no key) is refused before the database", async () => {
  const { client, log } = fakeDb(() => undefined);
  const reply = await createInvoiceWith(
    { admin: client },
    { userId: ME, body: { client: "أ", description: "x", amount: 1000 } },
  );
  assert.equal(reply.status, 400);
  assert.deepEqual("body" in reply && reply.body, { error: LEGACY_CREATE_BODY_AR });
  assert.equal(log.length, 0);
});

test("CODE-F01 + F22 + F21: one rpc carries the session's user, the key, and the ids — never two writes from JavaScript", async () => {
  const { client, log } = okCreate();
  const reply = await createInvoiceWith(
    { admin: client },
    {
      userId: ME,
      body: invoiceBody({
        clientId: CARD,
        caseId: "case-1",
        requestId: "req-1",
        feeType: "partial",
        caseTitle: "قضية",
        issued_by: OTHER,
        userId: OTHER,
      }),
    },
  );
  assert.equal(reply.status, 200);
  assert.equal(log.length, 1);
  assert.equal(log[0].op, "rpc");
  assert.equal(log[0].table, "create_lawyer_invoice_v3");
  assert.deepEqual(log[0].payload, {
    p_actor: ME,
    p_idempotency_key: "create-form-key-0001",
    p_amount_halalas: 100000,
    p_client_name: "شركة الاختبار",
    p_client_type: "company",
    p_lawyer_client_id: CARD,
    p_case_id: "case-1",
    p_request_id: "req-1",
    p_description: "أتعاب",
    p_fee_type: "partial",
    p_case_title: "قضية",
    p_contract_id: null,
  });
});

test("CODE-F01: a foreign or missing request / case / card answers the same 403 body", async () => {
  const { client } = fakeDb((q) => (q.op === "rpc" ? { data: { code: "forbidden" } } : undefined));
  const a = await createInvoiceWith({ admin: client }, { userId: ME, body: invoiceBody({ requestId: "someone-else" }) });
  const b = await createInvoiceWith({ admin: client }, { userId: ME, body: invoiceBody({ requestId: "does-not-exist" }) });
  assert.equal(a.status, 403);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.deepEqual("body" in a && a.body, { error: "Forbidden" });
});

test("CODE-F01: a requestId that is not a string is a 400 before the database", async () => {
  const { client, log } = fakeDb(() => undefined);
  const reply = await createInvoiceWith({ admin: client }, { userId: ME, body: invoiceBody({ requestId: 42 }) });
  assert.equal(reply.status, 400);
  assert.equal(log.length, 0);
});

test("CODE-F21: without a CRM card the client type must be chosen — no hidden 'company'", () => {
  assert.equal(parseCreateBody(invoiceBody({ clientType: undefined })).ok, false);
  assert.equal(parseCreateBody(invoiceBody({ clientType: "government" })).ok, false);
  assert.equal(parseCreateBody(invoiceBody({ client: "  " })).ok, false);
  assert.equal(parseCreateBody(invoiceBody({ clientType: "individual" })).ok, true);
  // with a card, the server reads name and type from it
  assert.equal(parseCreateBody(invoiceBody({ client: undefined, clientType: undefined, clientId: CARD })).ok, true);
  assert.equal(parseCreateBody(invoiceBody({ clientId: "not-a-uuid" })).ok, false);
  const r = parseCreateBody(invoiceBody({ clientType: undefined }));
  assert.equal(!r.ok && r.error, CREATE_INVALID_AR);
});

test("CODE-F22: amount in whole halalas above zero, a key of 8–100 characters", () => {
  assert.equal(parseCreateBody(invoiceBody({ amountHalalas: 0 })).ok, false);
  assert.equal(parseCreateBody(invoiceBody({ amountHalalas: 10.5 })).ok, false);
  assert.equal(parseCreateBody(invoiceBody({ amountHalalas: "100" })).ok, false);
  assert.equal(parseCreateBody(invoiceBody({ idempotencyKey: "short" })).ok, false);
  assert.equal(parseCreateBody(invoiceBody({ idempotencyKey: "x".repeat(101) })).ok, false);
});

test("CODE-F22: the same form again gets the same invoice (200, replay); the key with other data is refused", async () => {
  const replay = fakeDb((q) =>
    q.op === "rpc" ? { data: { code: "ok", replay: true, payment: { id: "p1", amount: 1000 } } } : undefined,
  );
  const r1 = await createInvoiceWith({ admin: replay.client }, { userId: ME, body: invoiceBody() });
  assert.equal(r1.status, 200);
  assert.equal("replay" in r1 && r1.replay, true);
  assert.equal("row" in r1 && r1.row.id, "p1");

  const reused = fakeDb((q) => (q.op === "rpc" ? { data: { code: "key_reused" } } : undefined));
  const r2 = await createInvoiceWith({ admin: reused.client }, { userId: ME, body: invoiceBody() });
  assert.equal(r2.status, 409);
  assert.equal("body" in r2 && r2.body.error, CREATE_KEY_REUSED_AR);
});

test("CODE-F22: before 20261030_20 runs, POST answers 503 and writes nothing — no fallback to the two-step write", async () => {
  for (const code of ["PGRST202", "42883"]) {
    const { client, log } = fakeDb((q) => (q.op === "rpc" ? { error: { code, message: "missing" } } : undefined));
    const reply = await createInvoiceWith({ admin: client }, { userId: ME, body: invoiceBody() });
    assert.equal(reply.status, 503);
    assert.equal("body" in reply && reply.body.error, CREATE_UNAVAILABLE_AR);
    assert.equal(log.length, 1);
  }
});

// ─── N01-9 / N01-10 (owner 13-Nov) — an invoice of a contract, no fake case ──

test("N01-10: an invoice of a contract may name no client — the SQL takes the contract's card", async () => {
  const body = invoiceBody({ client: undefined, clientType: undefined, contractId: "contract-1" });
  const parsed = parseCreateBody(body);
  assert.equal(parsed.ok, true);
  const { client, log } = okCreate();
  const reply = await createInvoiceWith({ admin: client }, { userId: ME, body });
  assert.equal(reply.status, 200);
  assert.equal(log[0].table, "create_lawyer_invoice_v3");
  assert.equal((log[0].payload as Record<string, unknown>).p_contract_id, "contract-1");
  assert.equal(parseCreateBody(invoiceBody({ contractId: 7 })).ok, false);
  assert.equal(parseCreateBody(invoiceBody({ contractId: "x".repeat(101) })).ok, false);
});

test("N01-9 + N01-11: no fallback to v1 (the placeholder case) or v2 (no VAT) — v3 missing is a 503", async () => {
  const { client, log } = fakeDb((q) => (q.op === "rpc" ? { error: { code: "PGRST202", message: "missing" } } : undefined));
  const reply = await createInvoiceWith({ admin: client }, { userId: ME, body: invoiceBody() });
  assert.equal(reply.status, 503);
  assert.deepEqual(log.map((q) => q.table), ["create_lawyer_invoice_v3"]);
  const src = readFileSync(join(ROOT, "src", "lib", "finance", "invoiceFinanceCore.ts"), "utf8");
  assert.doesNotMatch(src, /rpc\("create_lawyer_invoice"/);
  assert.doesNotMatch(src, /rpc\("create_lawyer_invoice_v2"/);
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

test("CODE-F22 + F21: the page issues with a form key in halalas, and the client type is never a hidden 'company'", () => {
  const page = readFileSync(join(ROOT, "src", "app", "dashboard", "lawyer", "finance", "page.tsx"), "utf8");
  const at = page.indexOf('"/api/v1/lawyer/finance", "POST"');
  const call = page.slice(at, at + 600);
  assert.match(call, /idempotencyKey: createKey/);
  assert.match(call, /amountHalalas: Math\.round\(feeNum \* 100\)/);
  assert.match(call, /clientId: pickedCard\.id/);
  assert.match(call, /clientType: newInvClientType/);
  assert.match(call, /timeoutMs: WRITE_TIMEOUT_MS/);
  assert.doesNotMatch(page, /clientType: "company"/);
});

test("UX04 + UX01: «تسجيل تحصيل» with an explicit amount and method; the tabs and close buttons have names", () => {
  const page = readFileSync(join(ROOT, "src", "app", "dashboard", "lawyer", "finance", "page.tsx"), "utf8");
  assert.doesNotMatch(page, /تم التحصيل/);
  assert.doesNotMatch(page, /اتركه فارغاً لتحصيل المتبقي/, "an empty amount no longer means 'everything left'");
  assert.match(page, /useState<CollectMethod \| null>\(null\)/, "no method is pre-selected");
  assert.match(page, /`تسجيل \$\{amountNum\.toLocaleString\(\)\} ر\.س`/);
  assert.match(page, /disabled=\{!canSubmit\}/);
  assert.match(page, /aria-pressed=\{isActive\}/);
  assert.match(page, /aria-label=\{tab\.label\}/);
  assert.match(page, /aria-label="إغلاق نافذة إصدار بيان الأتعاب"/); // owner ٤٣٠: «بيان أتعاب»
  assert.match(page, /aria-label="إغلاق نافذة تسجيل التحصيل"/);
});

test("UX03: manual collection is not tied to the gateway's state", () => {
  const page = readFileSync(join(ROOT, "src", "app", "dashboard", "lawyer", "finance", "page.tsx"), "utf8");
  assert.doesNotMatch(page, /بوابة الدفع قيد التفعيل/);
  assert.doesNotMatch(page, /قيد الإعداد/);
  assert.doesNotMatch(page, /لا توجد بوابة دفع إلكتروني/);
  assert.match(page, /aria-label="المسارات المالية الثلاثة"/);
  assert.match(page, /payments\.status === "test"/);
});

test("CODE-F23: a timed-out write is shown as uncertain, not as a failure", () => {
  const page = readFileSync(join(ROOT, "src", "app", "dashboard", "lawyer", "finance", "page.tsx"), "utf8");
  assert.ok((page.match(/instanceof ApiTimeoutError/g) ?? []).length >= 2, "both writes handle the uncertain case");
});

// ─── N01-11 (Q484) — VAT is decided in SQL; a bad stored number refuses ────

test("N01-11: a malformed stored VAT number refuses the statement with an Arabic reason per scope", async () => {
  for (const [scope, msg] of [["firm", VAT_NUMBER_INVALID_FIRM_AR], ["lawyer", VAT_NUMBER_INVALID_LAWYER_AR]] as const) {
    const { client } = fakeDb((q) => (q.op === "rpc" ? { data: { code: "vat_number_invalid", scope } } : undefined));
    const reply = await createInvoiceWith({ admin: client }, { userId: ME, body: invoiceBody() });
    assert.equal(reply.status, 400);
    assert.equal("body" in reply && reply.body.error, msg);
  }
});

test("N01-11: the issuer read is the SQL's own answer; a number is passed on only when registered", async () => {
  const reg = fakeDb((q) => (q.op === "rpc" ? { data: { scope: "firm", firm_id: "f1", name: "مكتب", state: "registered", vat_number: "300000000000003" } } : undefined));
  const a = await readIssuerVat({ admin: reg.client }, ME);
  assert.deepEqual(a, { ok: true, issuer: { scope: "firm", firmId: "f1", name: "مكتب", state: "registered", vatNumber: "300000000000003" } });
  assert.equal(reg.log[0].table, "invoice_issuer_vat");
  assert.deepEqual(reg.log[0].payload, { p_actor: ME });
  const bad = fakeDb((q) => (q.op === "rpc" ? { data: { scope: "lawyer", state: "invalid", vat_number: "123" } } : undefined));
  const b = await readIssuerVat({ admin: bad.client }, ME);
  assert.equal(b.ok && b.issuer.vatNumber, null);
  assert.equal(b.ok && b.issuer.state, "invalid");
  const missing = fakeDb((q) => (q.op === "rpc" ? { error: { code: "PGRST202", message: "missing" } } : undefined));
  assert.deepEqual(await readIssuerVat({ admin: missing.client }, ME), { ok: false, status: 503 });
});

// ─── N01-14 — void with a reason, unpaid only ──────────────────────────────

test("N01-14: a reason is required (3–500 characters, whitespace collapsed) before the database", async () => {
  assert.deepEqual(parseVoidBody({ reason: "  خطأ   في المبلغ " }), { ok: true, reason: "خطأ في المبلغ" });
  for (const body of [{}, { reason: "" }, { reason: " ab " }, { reason: 5 }, { reason: "x".repeat(501) }, null]) {
    const { client, log } = fakeDb(() => undefined);
    const reply = await voidInvoiceWith({ admin: client }, { userId: ME, paymentId: "p1", body });
    assert.equal(reply.status, 400);
    assert.equal("body" in reply && reply.body.error, VOID_REASON_AR);
    assert.equal(log.length, 0);
  }
});

test("N01-14: one rpc with the session's user; every refusal has its answer", async () => {
  const ok = fakeDb((q) => (q.op === "rpc" ? { data: { code: "ok", replay: false, payment: { id: "p1", status: "void" } } } : undefined));
  const reply = await voidInvoiceWith({ admin: ok.client }, { userId: ME, paymentId: "p1", body: { reason: "خطأ في المبلغ", userId: OTHER } });
  assert.equal(reply.status, 200);
  assert.equal(ok.log.length, 1);
  assert.equal(ok.log[0].table, "void_lawyer_invoice");
  assert.deepEqual(ok.log[0].payload, { p_payment_id: "p1", p_actor: ME, p_reason: "خطأ في المبلغ" });
  const cases: Array<[string, number, string]> = [
    ["not_found", 404, "Invoice not found"],
    ["forbidden", 403, "Forbidden"],
    ["has_collections", 409, VOID_HAS_COLLECTIONS_AR],
    ["not_voidable", 409, VOID_NOT_VOIDABLE_AR],
    ["already_void", 409, VOID_ALREADY_AR],
  ];
  for (const [code, status, error] of cases) {
    const { client } = fakeDb((q) => (q.op === "rpc" ? { data: { code } } : undefined));
    const r = await voidInvoiceWith({ admin: client }, { userId: ME, paymentId: "p1", body: { reason: "سبب كافٍ" } });
    assert.equal(r.status, status, code);
    assert.equal("body" in r && r.body.error, error, code);
  }
  const missing = fakeDb((q) => (q.op === "rpc" ? { error: { code: "42883", message: "missing" } } : undefined));
  const m = await voidInvoiceWith({ admin: missing.client }, { userId: ME, paymentId: "p1", body: { reason: "سبب كافٍ" } });
  assert.equal(m.status, 503);
  assert.equal("body" in m && m.body.error, VOID_UNAVAILABLE_AR);
});
