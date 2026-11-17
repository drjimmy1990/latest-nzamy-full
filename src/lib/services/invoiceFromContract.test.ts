import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { invoiceFromContractHref, readInvoiceIntent, initialInvoiceAmount, INVOICE_PAGE } from "./invoiceFromContract.ts";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

// ── N01-10: «إصدار بيان أتعاب» from a contract ──────────────────────────────

test("N01-10: the link carries the contract and, from a schedule row, its amount — nothing else", () => {
  assert.equal(invoiceFromContractHref("k-1"), `${INVOICE_PAGE}?newInvoice=1&contractId=k-1`);
  assert.equal(invoiceFromContractHref("k-1", 2500.5), `${INVOICE_PAGE}?newInvoice=1&contractId=k-1&amount=2500.5`);
  assert.equal(invoiceFromContractHref("k-1", 0), `${INVOICE_PAGE}?newInvoice=1&contractId=k-1`);
  assert.equal(invoiceFromContractHref("k-1", null), `${INVOICE_PAGE}?newInvoice=1&contractId=k-1`);
});

test("N01-10: the finance page reads the intent back; junk is ignored", () => {
  assert.deepEqual(readInvoiceIntent("?newInvoice=1&contractId=k-1&amount=2500.5"), { contractId: "k-1", amountSar: 2500.5 });
  assert.deepEqual(readInvoiceIntent("?newInvoice=1&contractId=k-1&amount=-3"), { contractId: "k-1", amountSar: null });
  assert.equal(readInvoiceIntent(""), null);
  assert.equal(readInvoiceIntent("?contractId=k-1"), null);
  assert.equal(readInvoiceIntent("?newInvoice=1"), null);
  assert.equal(readInvoiceIntent(`?newInvoice=1&contractId=${"x".repeat(101)}`), null);
});

test("N01-10: the amount is the row's, else the contract value, else empty — never a guessed 0", () => {
  assert.equal(initialInvoiceAmount(1200, 20000), "1200");
  assert.equal(initialInvoiceAmount(null, 20000), "20000");
  assert.equal(initialInvoiceAmount(null, 0), "");
  assert.equal(initialInvoiceAmount(null, null), "");
});

// ── N01-9 wiring: request-less invoices are read, and no fake case is made ──

test("N01-9 wiring: finance GET and the dashboard revenue also read the owner's request-less invoices", () => {
  const finance = read("app/api/v1/lawyer/finance/route.ts");
  assert.match(finance, /\.is\("request_id", null\)\s*\.eq\("owner_user_id", uid\)/);
  assert.match(finance, /\.concat\(ownInvoices\.data\)/);
  const summary = read("app/api/v1/lawyer/dashboard/summary/route.ts");
  assert.match(summary, /\.is\("request_id", null\)\s*\.eq\("owner_user_id", uid\)/);
});

test("N01-10 wiring: the contract page links to the fee statement form (lawyer only)", () => {
  const detail = read("app/dashboard/lawyer/_components/contracts/ContractDetail.tsx");
  assert.match(detail, /basePath === "\/dashboard\/lawyer" && \(\s*<Link\s*href=\{invoiceFromContractHref\(contractId\)\}/);
  const page = read("app/dashboard/lawyer/finance/page.tsx");
  assert.match(page, /readInvoiceIntent\(window\.location\.search\)/);
  assert.match(page, /contractId: pickedContract\.id/);
});
