/**
 * invoiceUi.wiring.test.ts — the finance page wires the N01-11..14 tools in
 * the honest way (owner TODO 17-Nov, Q484, owner ٤٤٢(أ)). Source scans: the
 * components are TSX, which `node --test` does not load.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const read = (...p: string[]) => readFileSync(join(ROOT, "src", ...p), "utf8");
const page = read("app", "dashboard", "lawyer", "finance", "page.tsx");
const tools = read("app", "dashboard", "lawyer", "finance", "_components", "invoiceTools.tsx");
const route = read("app", "api", "v1", "lawyer", "finance", "route.ts");

test("N01-14: voided statements travel in their own list and never reach a total", () => {
  assert.match(route, /\.eq\("status", "void"\)/);
  assert.match(route, /voidedInvoices,\s*\n\s*voidedInvoicesTotal,/);
  // the main read still filters on the invoiceable statuses, which exclude void
  assert.match(route, /const INVOICEABLE_PAYMENT_STATUSES = new Set\(\["requires_payment", "paid", "failed"\]\)/);
  assert.match(page, /setVoidedInvoices\(Array\.isArray\(data\?\.voidedInvoices\)/);
  // every total is summed from `invoices`, never from the voided list
  for (const line of page.split(/\r?\n/).filter((l) => /useMemo\(\(\) => invoices/.test(l))) {
    assert.doesNotMatch(line, /voided/i);
  }
  assert.doesNotMatch(page, /setInvoices\([^)]*voided/i);
  assert.match(page, /<VoidedInvoicesList items=\{voidedInvoices\}/);
});

test("N01-14: void needs a reason and is offered only on an open statement with nothing collected", () => {
  assert.match(tools, /export const isVoidable = \(inv: FinanceInvoice\) => inv\.status === "pending" && \(Number\(inv\.paidAmount\) \|\| 0\) === 0;/);
  assert.match(tools, /disabled=\{!reasonOk \|\| busy !== null\}/);
});

test("N01-12: the print view is the issuer's letterhead with no QR and no platform stamp (owner ٤٤٢(أ))", () => {
  assert.match(tools, /<LetterheadSheet identity=\{identity\}>/);
  assert.doesNotMatch(tools, /BrandedQr|PLATFORM_STAMP_AR|صادر عبر منصة نظامي/);
  assert.match(tools, /window\.print\(\)/);
  assert.match(page, /<InvoicePrintDocument/);
});

test("N01-13: no payment link is claimed anywhere — the statement is paid to the office", () => {
  for (const src of [tools, page]) assert.doesNotMatch(src, /رابط الدفع|ادفع الآن|\/checkout/);
  assert.match(tools, /إرسال البيان للموكّل/);
});

test("N01-11: the form shows subtotal / VAT / total from the server's issuer answer; the fee is entered before VAT", () => {
  assert.match(page, /<VatPreview feeText=\{newInvFee\} issuer=\{issuer\} \/>/);
  assert.match(page, /قيمة الأتعاب المقررة قبل الضريبة/);
  assert.match(tools, /apiGet<Record<string, unknown>>\("\/api\/v1\/lawyer\/finance\/issuer"\)/);
});

test("dark mode: the tools use no text-gray-100/200 (they are dark surfaces in dark mode)", () => {
  assert.doesNotMatch(tools, /text-gray-(100|200)\b/);
});
