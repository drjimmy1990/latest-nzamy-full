import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildInvoiceMessage, FEE_STATEMENT_LABEL_AR, invoiceNotification, PAY_DIRECTLY_AR, statementReference } from "./invoiceMessage.ts";
import { VAT_NOT_SUBJECT_AR } from "./invoiceVat.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");

const base = {
  issuerName: "مكتب العدل",
  clientName: "شركة الموكّل",
  description: "أتعاب قضية تجارية",
  reference: "AB12CD34",
  date: "١ جمادى الأولى ١٤٤٨",
  totalHalalas: 115000,
  paidHalalas: 0,
  vat: { rateBp: 1500 as const, subtotalHalalas: 100000, vatHalalas: 15000, totalHalalas: 115000,
         vatNumber: "300000000000003", scope: "firm" as const, issuerName: "مكتب العدل" },
};

test("N01-13: the message states subtotal, VAT, the issuer's number, total and what is due — and that it is paid to the office", () => {
  const m = buildInvoiceMessage(base);
  assert.equal(m.subject, "بيان أتعاب من مكتب العدل");
  const keys = m.details.map(([k]) => k);
  assert.deepEqual(keys, ["المرجع", "التاريخ", "البيان", "الأتعاب", "ضريبة القيمة المضافة (١٥٪)", "الرقم الضريبي للمُصدِر", "الإجمالي", "المتبقي"]);
  assert.ok(m.text.includes("300000000000003"));
  assert.ok(m.text.includes(PAY_DIRECTLY_AR));
  assert.ok(m.text.includes(FEE_STATEMENT_LABEL_AR));
  // never a payment link or «pay now»
  assert.doesNotMatch(m.text, /https?:\/\/|ادفع الآن|رابط الدفع/);
});

test("Q484: no VAT number → «غير خاضع»; a statement from before VAT → no tax line at all", () => {
  const zero = buildInvoiceMessage({ ...base, totalHalalas: 100000,
    vat: { ...base.vat, rateBp: 0, vatHalalas: 0, totalHalalas: 100000, vatNumber: null } });
  assert.ok(zero.details.some(([k, v]) => k === "ضريبة القيمة المضافة" && v === VAT_NOT_SUBJECT_AR));
  assert.ok(!zero.details.some(([k]) => k === "الرقم الضريبي للمُصدِر"));
  const legacy = buildInvoiceMessage({ ...base, vat: null });
  assert.ok(!legacy.details.some(([k]) => k.includes("ضريبة") || k === "الأتعاب"));
  assert.ok(legacy.details.some(([k]) => k === "الإجمالي"));
});

test("a part-paid statement shows what was collected and the remainder", () => {
  const m = buildInvoiceMessage({ ...base, paidHalalas: 15000 });
  assert.ok(m.details.some(([k]) => k === "المحصّل"));
  const note = invoiceNotification({ ...base, paidHalalas: 15000 });
  assert.equal(note.title, "بيان أتعاب من مكتب العدل");
  assert.ok(note.body.includes("AB12CD34"));
  assert.doesNotMatch(note.body, /https?:\/\//);
  // platform-composed: the lawyer's free text never reaches another account's bell
  assert.ok(!note.body.includes(base.description));
});

test("statementReference is the first block of the id, upper-cased", () => {
  assert.equal(statementReference("ab12cd34-0000-4000-8000-000000000000"), "AB12CD34");
});

test("wiring: the send route never charges and never builds a checkout URL; e-mail is env-gated", () => {
  const route = readFileSync(join(ROOT, "src", "app", "api", "v1", "lawyer", "finance", "[id]", "send", "route.ts"), "utf8");
  const code = route.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(code, /checkout|moyasar|payment_orders|record_invoice_collection|\.update\(/i);
  assert.match(route, /if \(!emailConfigured\(\)\)/);
  assert.match(route, /meta\.issued_by === user\.id \|\| p\.owner_user_id === user\.id/);
  assert.match(route, /p\.status !== "requires_payment"/);
  // a card's account is notified only after the relationship is re-proved
  assert.match(route, /assertLinkableAccount\(supabase, user\.id, clientUserId, cardId, false\)/);
});
