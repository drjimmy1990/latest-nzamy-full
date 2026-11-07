import { test } from "node:test";
import assert from "node:assert/strict";
import { receiptView, cardLabel, orderStatusAr, hasReceipt, parseBillingResponse, pointsSummary, cardBrandAr, cardTitleAr, billingItemAr, billingOrderItemAr, orderBillingAr } from "./billingView.ts";
import { buildCatalog, orderLabelWithPointsAr, PAYABLE_ITEMS } from "./catalog.ts";
import { PRICE_BOOK } from "../pricing/priceBook.ts";

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
test("receipts exist only for paid and refunded orders; voided, failed and cancelled are not receipts", () => {
  for (const status of ["voided", "failed", "cancelled"]) {
    assert.equal(receiptView({ ...order, status }, company), null, status);
    assert.equal(hasReceipt({ ...order, status }), false, status);
  }
  for (const status of ["paid", "refunded"]) assert.equal(hasReceipt({ ...order, status }), true, status);
  assert.equal(hasReceipt({ ...order, receipt_number: null }), false);
});
test("the receipt VAT label reads exactly «ضريبة القيمة المضافة ١٥٪»", () => {
  assert.equal(receiptView(order, company)?.vatLabel, "ضريبة القيمة المضافة ١٥٪");
});

// ── Settings tabs (payments UX fixes 2026-10-25): the GET /api/v1/billing answer, read in the browser ──
const lot = (id: string, points_left: number, expires_at: string) => ({ id, points_left, points_total: 100, expires_at, source: "topup" });
const card = { id: "card-1", merchant: "platform", brand: "mada", last_four: "4242", exp_month: "12", exp_year: "2030", status: "active" };
const billingBody = { orders: [order], cards: [card], lots: [lot("l1", 40, "2026-12-01T00:00:00Z")], pointsBalance: 40 };

test("parseBillingResponse keeps a well-formed answer as it is", () => {
  assert.deepEqual(parseBillingResponse(billingBody), billingBody);
  assert.deepEqual(parseBillingResponse({ orders: [], cards: [], lots: [], pointsBalance: 0 }), { orders: [], cards: [], lots: [], pointsBalance: 0 });
});
test("parseBillingResponse refuses anything else — never a default 0 balance or empty rows", () => {
  for (const body of [
    null, undefined, "x", [], {},
    { error: "بيانات الفوترة غير متاحة مؤقتاً" },
    { ...billingBody, pointsBalance: undefined },
    { ...billingBody, pointsBalance: null },
    { ...billingBody, pointsBalance: "40" },
    { ...billingBody, pointsBalance: 1.5 },
    { ...billingBody, pointsBalance: -1 },
    { ...billingBody, orders: undefined },
    { ...billingBody, cards: {} },
    { ...billingBody, lots: null },
    { ...billingBody, orders: [null] },
    { ...billingBody, cards: [{ ...card, id: 7 }] },
    { ...billingBody, lots: [{ ...lot("l1", 40, "2026-12-01T00:00:00Z"), points_left: "40" }] },
  ]) {
    assert.equal(parseBillingResponse(body), null, JSON.stringify(body));
  }
});
test("pointsSummary: the balance and the nearest expiry among lots with points left", () => {
  const summary = pointsSummary({
    pointsBalance: 70,
    lots: [lot("late", 30, "2027-03-01T00:00:00Z"), lot("empty", 0, "2026-11-01T00:00:00Z"), lot("soon", 40, "2026-12-01T00:00:00Z"), lot("bad", 5, "not a date")],
  });
  assert.equal(summary.balance, 70);
  assert.equal(summary.nearestExpiry, "2026-12-01T00:00:00Z");
  assert.deepEqual(pointsSummary({ pointsBalance: 0, lots: [] }), { balance: 0, nearestExpiry: null });
});
test("cardBrandAr names the known networks in Arabic and nothing else", () => {
  assert.equal(cardBrandAr("mada"), "مدى");
  assert.equal(cardBrandAr("VISA"), "فيزا");
  assert.equal(cardBrandAr("master"), "ماستركارد");
  assert.equal(cardBrandAr("mastercard"), "ماستركارد");
  assert.equal(cardBrandAr("amex"), "أمريكان إكسبريس");
  for (const brand of [null, undefined, "", "unknown", 4]) assert.equal(cardBrandAr(brand), null);
});
test("cardTitleAr: the brand beside the last four, or the last four alone", () => {
  assert.equal(cardTitleAr(card), "مدى · بطاقة تنتهي بـ ٤٢٤٢");
  assert.equal(cardTitleAr({ brand: null, last_four: "4242" }), "بطاقة تنتهي بـ ٤٢٤٢");
  assert.equal(cardTitleAr({ brand: "visa", last_four: null }), "فيزا · بطاقة محفوظة");
});

test("receipts and admin name every billing cycle in Arabic, and nothing for an unknown one", () => {
  assert.equal(orderBillingAr("monthly"), "شهري");
  assert.equal(orderBillingAr("quarterly"), "ربع سنوي");
  assert.equal(orderBillingAr("semiannual"), "نصف سنوي");
  assert.equal(orderBillingAr("yearly"), "سنوي");
  assert.equal(orderBillingAr("once"), "دفعة واحدة");
  for (const bad of [null, undefined, "", "custom", "constructor"]) assert.equal(orderBillingAr(bad), null, String(bad));
  assert.equal(receiptView({ ...order, billing: "quarterly" }, null)?.billing, "ربع سنوي");
  assert.equal(receiptView(order, null)?.billing, null, "an order row without billing shows no cycle line");
});

test("retire, never delete: a receipt and the admin list keep a retired plan's name", () => {
  const retired = buildCatalog({ ...PRICE_BOOK, "lawyer-pro": { ...PRICE_BOOK["lawyer-pro"], retired: true } });
  assert.equal(billingItemAr("lawyer-pro", retired), "المحامي المحترف");
  assert.equal(billingItemAr("never-sold", retired), "عملية شراء");
});

test("R3 (owner ٤٢٠): a receipt of the retired 399 plan keeps «التأمين القانوني»; today's label is the new name", () => {
  assert.equal(PAYABLE_ITEMS["ind-litigation"].labelAr, "عضوية الحماية القانونية");
  assert.equal(billingItemAr("ind-litigation"), "التأمين القانوني");
  assert.equal(receiptView({ ...order, item_id: "ind-litigation" }, null)?.item, "التأمين القانوني");
  // an item without a receipt name prints its label as before
  assert.equal(billingItemAr("ind-ai"), PAYABLE_ITEMS["ind-ai"].labelAr);
});

test("Task F fix round 1: a top-up bought before owner ٤٢٢ prints the points its lot credited, not today's grant", () => {
  // topup-1000 granted 1,250 before ٤٢٢ and 1,500 now (priceBook.ts).
  assert.equal(PRICE_BOOK["topup-1000"].points, 1500);
  const old = { ...order, item_id: "topup-1000", net_halalas: 100000, vat_halalas: 15000, total_halalas: 115000, credited_points: 1250 };
  assert.equal(orderLabelWithPointsAr("topup-1000", 1250), "شحن ١٬٠٠٠ — ١٬٢٥٠ نقطة (منها ٢٥٠ نقطة مكافأة)");
  assert.equal(receiptView(old, company)?.item, "شحن ١٬٠٠٠ — ١٬٢٥٠ نقطة (منها ٢٥٠ نقطة مكافأة)");
  assert.equal(billingOrderItemAr(old), "شحن ١٬٠٠٠ — ١٬٢٥٠ نقطة (منها ٢٥٠ نقطة مكافأة)");
  // no bonus credited: the bracket form, as the book prints a bonus-less top-up
  assert.equal(orderLabelWithPointsAr("topup-1000", 1000), "شحن ١٬٠٠٠ (١٬٠٠٠ نقطة)");
  // no lot read, or a value that is not a positive whole number: the book's label
  for (const bad of [undefined, null, 0, -5, 12.5, "1250", Number.NaN]) {
    assert.equal(orderLabelWithPointsAr("topup-1000", bad), PRICE_BOOK["topup-1000"].labelAr, String(bad));
  }
  assert.equal(billingOrderItemAr({ item_id: "topup-1000" }), PRICE_BOOK["topup-1000"].labelAr);
  // anything but a top-up ignores a points count
  assert.equal(orderLabelWithPointsAr("lawyer-pro", 1250), billingItemAr("lawyer-pro"));
  assert.equal(billingOrderItemAr({ item_id: "no-such-item", credited_points: 5 }), "عملية شراء");
});
