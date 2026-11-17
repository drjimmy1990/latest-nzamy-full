import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeInvoiceVat,
  formatSar,
  isSaudiVatNumber,
  MAX_INVOICE_HALALAS,
  normalizeVatNumber,
  readInvoiceVat,
  riyalsToHalalas,
  vatHalalas,
  VAT_RATE_BP,
} from "./invoiceVat.ts";

test("Q484: 15% only when the issuer is VAT-registered; 0% otherwise", () => {
  assert.deepEqual(computeInvoiceVat(100000, true), { rateBp: 1500, subtotalHalalas: 100000, vatHalalas: 15000, totalHalalas: 115000 });
  assert.deepEqual(computeInvoiceVat(100000, false), { rateBp: 0, subtotalHalalas: 100000, vatHalalas: 0, totalHalalas: 100000 });
});

test("rounding is half-up per halala — the same cases as invoice_vat_void.test.sql (T4)", () => {
  const cases: Array<[number, number]> = [[1, 0], [3, 0], [4, 1], [10, 2], [33333, 5000], [99999, 15000], [100001, 15000]];
  for (const [sub, vat] of cases) assert.equal(vatHalalas(sub, VAT_RATE_BP), vat, `${sub}`);
  // 0.15 × 7 = 1.05 → 1; × 30 = 4.5 → 5 (half goes up); × 70 = 10.5 → 11
  assert.equal(vatHalalas(7, VAT_RATE_BP), 1);
  assert.equal(vatHalalas(30, VAT_RATE_BP), 5);
  assert.equal(vatHalalas(70, VAT_RATE_BP), 11);
  // exact at the ceiling (no float drift)
  assert.equal(vatHalalas(MAX_INVOICE_HALALAS, VAT_RATE_BP), 150000000000);
  assert.equal(vatHalalas(12345, 0), 0);
  assert.throws(() => vatHalalas(1.5, VAT_RATE_BP));
  assert.throws(() => vatHalalas(-1, VAT_RATE_BP));
  assert.throws(() => vatHalalas(100, 500));
});

test("VAT number: normalised like SQL normalize_vat_number, then 15 digits 3…3", () => {
  assert.equal(normalizeVatNumber(" ٣٠٠ ٠٠٠-٠٠٠٠٠٠٠٠٣ "), "300000000000003");
  assert.equal(normalizeVatNumber("۳۱۰۱۲۳۴۵۶۷۸۹۰۰۳"), "310123456789003");
  assert.equal(normalizeVatNumber("   "), null);
  assert.equal(normalizeVatNumber(null), null);
  assert.ok(isSaudiVatNumber("300000000000003"));
  assert.ok(!isSaudiVatNumber("12345"));
  assert.ok(!isSaudiVatNumber("300000000000004"));
  assert.ok(!isSaudiVatNumber("3000000000000003"));
  assert.ok(!isSaudiVatNumber(null));
});

test("the snapshot is read only when it adds up; a legacy row has none", () => {
  const snap = readInvoiceVat({
    vat: { rate_bp: 1500, subtotal_halalas: 100000, vat_halalas: 15000, total_halalas: 115000,
           vat_number: "300000000000003", scope: "firm", issuer_name: "مكتب" },
  });
  assert.deepEqual(snap, { rateBp: 1500, subtotalHalalas: 100000, vatHalalas: 15000, totalHalalas: 115000,
                           vatNumber: "300000000000003", scope: "firm", issuerName: "مكتب" });
  assert.equal(readInvoiceVat({ client: "x" }), null);
  assert.equal(readInvoiceVat(null), null);
  assert.equal(readInvoiceVat({ vat: { rate_bp: 1500, subtotal_halalas: 1, vat_halalas: 1, total_halalas: 3 } }), null);
  assert.equal(readInvoiceVat({ vat: { rate_bp: 700, subtotal_halalas: 1, vat_halalas: 0, total_halalas: 1 } }), null);
  const zero = readInvoiceVat({ vat: { rate_bp: 0, subtotal_halalas: 500, vat_halalas: 0, total_halalas: 500, vat_number: null } });
  assert.equal(zero?.rateBp, 0);
  assert.equal(zero?.vatNumber, null);
  assert.equal(zero?.scope, "lawyer");
});

test("riyals typed in the form → halalas (two decimals at most)", () => {
  assert.equal(riyalsToHalalas("1150.5"), 115050);
  assert.equal(riyalsToHalalas("١٢٠٠"), 120000);
  assert.equal(riyalsToHalalas("١٬٢٠٠٫٧٥"), 120075);
  assert.equal(riyalsToHalalas("0.01"), 1);
  assert.equal(riyalsToHalalas("1.005"), null);
  assert.equal(riyalsToHalalas("-5"), null);
  assert.equal(riyalsToHalalas("0"), null);
  assert.equal(riyalsToHalalas("abc"), null);
  assert.equal(riyalsToHalalas("10000000000"), null);
});

test("formatSar always shows two decimals", () => {
  assert.match(formatSar(115000), /ر\.س$/);
  assert.ok(formatSar(115050).includes("٫٥٠") || formatSar(115050).includes(".50"));
});
