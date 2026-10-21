import { test } from "node:test";
import assert from "node:assert/strict";
import { receiptView, cardLabel, orderStatusAr } from "./billingView.ts";

const order = { id: "order-1", item_id: "lawyer-pro", net_halalas: 39900, vat_halalas: 5985, total_halalas: 45885, currency: "SAR", receipt_number: "NZ-2026-000001", paid_at: "2026-10-22T10:00:00Z", status: "paid", refunded_halalas: 0, last_four: "1111" };
const company = { legal_name_ar: "منشأة الاختبار", cr_number: "1234567890", vat_number: "300000000000003", address_ar: "الرياض" };

test("receipt uses recorded halalas, keeps VAT arithmetic and labels a receipt", () => {
  const view = receiptView(order, company);
  assert.ok(view);
  assert.equal(view.title, "إيصال دفع");
  assert.equal(view.item, "المحامي المحترف");
  assert.equal(view.total, "٤٥٨٫٨٥ ر.س");
  assert.equal(view.lastFour, "١١١١");
  assert.equal(view.company?.legal_name_ar, company.legal_name_ar);
  assert.equal(view.taxInvoiceNotice, "تصدر الفاتورة الضريبية الرسمية بشكل منفصل");
});
test("incomplete or invalid company shows explicit notice, never blank business fields", () => {
  for (const c of [null, {}, { ...company, address_ar: " " }, { ...company, vat_number: "123" }]) {
    const view = receiptView(order, c);
    assert.ok(view);
    assert.equal(view.company, null);
    assert.equal(view.companyNotice, "بيانات المنشأة غير مكتملة");
  }
});
test("unpaid orders and inconsistent amounts cannot become receipts", () => {
  for (const change of [{ status: "initiated" }, { receipt_number: null }, { total_halalas: 45884 }, { net_halalas: -1 }, { total_halalas: 45885.5 }, { currency: "USD" }]) {
    assert.equal(receiptView({ ...order, ...change }, company), null);
  }
});
test("refunded receipt retains original amount with explicit refunded status", () => {
  const view = receiptView({ ...order, status: "refunded", refunded_halalas: 45885 }, company);
  assert.ok(view);
  assert.equal(view.status, "مسترد");
  assert.equal(view.refunded, view.total);
});
test("card copy renders only four digits, including unknown-card fallback", () => {
  assert.equal(cardLabel("1111"), "بطاقة تنتهي بـ ١١١١");
  assert.equal(cardLabel("4111111111111111"), "بطاقة محفوظة");
  assert.equal(orderStatusAr("anything"), "غير معروف");
});
test("test-mode receipt clearly says no real money was charged", () => {
  assert.equal(receiptView({ ...order, live: false }, company)?.testNotice, "إيصال تجريبي — لم تُخصم أموال حقيقية");
  assert.equal(receiptView({ ...order, live: true }, company)?.testNotice, null);
});
