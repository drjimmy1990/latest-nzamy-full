/**
 * l16 (A-01, owner 25 Nov §1.1): no 15 % VAT is added, quoted or printed
 * while billing_company holds no valid VAT number; live payments (which
 * already need the number) are unchanged.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { quote, VAT_PERCENT, vatPercentFor } from "./catalog.ts";
import { applyDiscount } from "./couponRules.ts";
import { isBillingCompanyComplete, isVatRegistered, resolveMoyasarConfig } from "./moyasarConfig.ts";
import { NO_VAT_LINE_AR, NO_VAT_RECEIPT_TITLE_AR, receiptView, creditNoteView, TAX_INVOICE_TITLE_AR } from "./billingView.ts";
import { listedVatNotice, quoteVatNotice } from "./checkoutView.ts";
import { VAT_NOTICE, VAT_UNREGISTERED_NOTICE, vatNoticeText } from "../pricing/vatNotice.ts";
import { cardTotalWithVat } from "../pricing/cardPrice.ts";
import { readVatRegistered, checkoutVatRegistered, publicVatAnswer } from "./vatStatus.ts";

const COMPANY = { legal_name_ar: "شركة", cr_number: "1010000000", vat_number: "300000000000003", address_ar: "الرياض" };

test("the rate: 15 once registered, 0 before; quote and applyDiscount follow it", () => {
  assert.equal(vatPercentFor(true), VAT_PERCENT);
  assert.equal(vatPercentFor(false), 0);
  const withVat = quote("lawyer-pro", "yearly", undefined, undefined, vatPercentFor(true));
  const noVat = quote("lawyer-pro", "yearly", undefined, undefined, vatPercentFor(false));
  assert.ok(withVat.ok && noVat.ok);
  assert.equal(noVat.netHalalas, withVat.netHalalas, "the net never changes");
  assert.equal(noVat.vatHalalas, 0);
  assert.equal(noVat.totalHalalas, noVat.netHalalas);
  assert.equal(withVat.vatHalalas, Math.round((withVat.netHalalas * 15) / 100));
  // an unexpected rate is never a new rate: 15
  const odd = quote("lawyer-pro", "yearly", undefined, undefined, 7);
  assert.ok(odd.ok && odd.vatHalalas === withVat.vatHalalas);
  assert.deepEqual(applyDiscount(10000, 2500, 0), { listNetHalalas: 10000, discountHalalas: 2500, netHalalas: 7500, vatHalalas: 0, totalHalalas: 7500 });
  assert.equal(applyDiscount(10000, 2500, 15).vatHalalas, 1125);
});

test("registered = a valid Saudi VAT number; whenever live resolves, it is true (live charges are unchanged)", () => {
  assert.equal(isVatRegistered(COMPANY), true);
  assert.equal(isVatRegistered({ ...COMPANY, vat_number: null }), false);
  assert.equal(isVatRegistered({ ...COMPANY, vat_number: "" }), false);
  assert.equal(isVatRegistered({ ...COMPANY, vat_number: "123" }), false);
  assert.equal(isVatRegistered(null), false);
  assert.equal(isVatRegistered("300000000000003"), false);
  const env = { secretKey: "sk_live_placeholderSecret123", publishableKey: "pk_live_placeholderPublish123", webhookSecret: "whsec" };
  let sawLive = false;
  for (const company of [COMPANY, { ...COMPANY, vat_number: null }, { ...COMPANY, address_ar: "" }, null]) {
    const cfg = resolveMoyasarConfig({ status: "live", provider: "moyasar" }, env, isBillingCompanyComplete(company));
    if (cfg.enabled) {
      sawLive = true;
      assert.equal(isVatRegistered(company), true, "live never runs without the number");
    }
  }
  assert.ok(sawLive, "the complete company does resolve live");
});

test("the server read: a missing row is false, an error is null; live mode never reads", async () => {
  const fake = (answer: { data?: unknown; error?: unknown }) =>
    ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => answer }) }) }) }) as unknown as Parameters<typeof readVatRegistered>[0];
  assert.equal(await readVatRegistered(fake({ data: { value: COMPANY }, error: null })), true);
  assert.equal(await readVatRegistered(fake({ data: null, error: null })), false);
  assert.equal(await readVatRegistered(fake({ data: null, error: { code: "08006" } })), null);
  assert.equal(await checkoutVatRegistered(fake({ data: null, error: { code: "08006" } }), "live"), true);
  assert.equal(await checkoutVatRegistered(fake({ data: null, error: null }), "test"), false);
});

test("l16 review: GET /api/v1/pricing/vat never says «no VAT» on a failed read, and is true in live mode", () => {
  assert.equal(publicVatAnswer(null, "live"), true);
  assert.equal(publicVatAnswer(false, "live"), true, "live always charges VAT");
  assert.equal(publicVatAnswer(null, "test"), null, "unknown stays unknown — no VAT line, no «no VAT»");
  assert.equal(publicVatAnswer(null, null), null);
  assert.equal(publicVatAnswer(false, "test"), false);
  assert.equal(publicVatAnswer(true, null), true);
  assert.equal(vatNoticeText(null), null, "the page shows nothing while unknown");
  const route = readFileSync(join(import.meta.dirname, "..", "..", "app", "api", "v1", "pricing", "vat", "route.ts"), "utf8");
  assert.match(route, /publicVatAnswer\(read, mode\)/);
  assert.doesNotMatch(route, /vatRegistered = false;/);
});

test("receipts: an order with no VAT is «إيصال سداد», one amount row, the owner's line, no QR", () => {
  const order = {
    id: "o1", item_id: "lawyer-pro", billing: "yearly", status: "paid", receipt_number: "NZ-2026-000001",
    paid_at: "2026-11-26T10:00:00Z", created_at: "2026-11-26T10:00:00Z", currency: "SAR",
    net_halalas: 399000, vat_halalas: 0, total_halalas: 399000, refunded_halalas: 0, live: false, merchant: "platform",
  } as unknown as Parameters<typeof receiptView>[0];
  const v = receiptView(order, { ...COMPANY, vat_number: null })!;
  assert.equal(v.title, NO_VAT_RECEIPT_TITLE_AR);
  assert.equal(v.noVat, true);
  assert.deepEqual(v.amountRows.map((r) => r[0]), ["المبلغ المدفوع"]);
  assert.equal(v.qrPayload, null);
  assert.equal(v.taxInvoiceNotice, NO_VAT_LINE_AR);
  assert.ok(!JSON.stringify(v.amountRows).includes("١٥٪"));
  assert.ok(!/0\s*%|٠٪/.test(JSON.stringify(v.amountRows)), "never «0 % VAT»");
  // a live order of a registered seller stays a tax invoice with its VAT row
  const taxed = receiptView({ ...order, live: true, vat_halalas: 59850, total_halalas: 458850 } as typeof order, COMPANY)!;
  assert.equal(taxed.title, TAX_INVOICE_TITLE_AR);
  assert.equal(taxed.amountRows.length, 3);
  // the credit note of a no-VAT order has no VAT row either
  const note = creditNoteView({
    number: "CN-1", issued_at: "2026-11-27T10:00:00Z", invoice_number: "NZ-2026-000001", invoice_issued_at: "2026-11-26T10:00:00Z",
    item_id: "lawyer-pro", billing: "yearly", method: "refund", currency: "SAR", net_halalas: 399000, vat_halalas: 0, total_halalas: 399000, live: false,
  } as unknown as Parameters<typeof creditNoteView>[0], null)!;
  assert.deepEqual(note.amountRows.map((r) => r[0]), ["المبلغ المسترد"]);
});

test("notices and cards: the 15 % sentence only when registered, the owner's line before, nothing while unknown", () => {
  assert.equal(vatNoticeText(true), VAT_NOTICE.exclusive);
  assert.equal(vatNoticeText(false), VAT_UNREGISTERED_NOTICE);
  assert.equal(vatNoticeText(null), null);
  assert.equal(listedVatNotice({} as never, false), VAT_UNREGISTERED_NOTICE.ar);
  assert.equal(listedVatNotice({} as never, null), null);
  assert.equal(quoteVatNotice("exclusive", 0), VAT_UNREGISTERED_NOTICE.ar);
  assert.equal(quoteVatNotice("exclusive", 100), VAT_NOTICE.exclusive.ar);
  assert.equal(cardTotalWithVat({ id: "ind-ai" }, "yearly", null, "ar", false), "الإجمالي ٢٤٩ ر.س · سنوي");
  assert.equal(cardTotalWithVat({ id: "ind-ai" }, "yearly", null, "ar", null), null);
  assert.equal(cardTotalWithVat({ id: "ind-ai" }, "yearly", null, "ar", true), "الإجمالي شامل الضريبة ٢٨٦٫٣٥ ر.س · سنوي");
});

test("vatCallSites: every server quote / applyDiscount that charges or previews passes its VAT rate", () => {
  const root = join(import.meta.dirname, "..", "..");
  for (const rel of ["lib/payments/checkoutCore.ts", "lib/payments/couponServer.ts", "app/checkout/page.tsx"]) {
    const src = readFileSync(join(root, rel), "utf8");
    let calls = 0;
    for (const m of src.matchAll(/(?<![\w.])(quote|applyDiscount)\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g)) {
      const before = src.slice(Math.max(0, (m.index ?? 0) - 16), m.index);
      if (/function\s*$/.test(before)) continue;
      const lineStart = src.lastIndexOf("\n", m.index ?? 0) + 1;
      if (/^\s*(\*|\/\/)/.test(src.slice(lineStart, m.index))) continue; // a comment
      calls += 1;
      const args = m[2].split(",").length;
      assert.ok(args >= (m[1] === "quote" ? 5 : 3), `${rel}: ${m[0]} passes no VAT rate`);
    }
    assert.ok(calls > 0, `${rel}: the scan found its calls`);
  }
  // the two routes derive the rate from the server's read, never a constant
  const checkout = readFileSync(join(root, "app/api/v1/payments/checkout/route.ts"), "utf8");
  assert.match(checkout, /const vatRegistered = await checkoutVatRegistered\(admin, cfg\.mode\);\s*if \(vatRegistered === null\) return unavailable\(\);/);
  assert.match(checkout, /vatPercent: vatPercentFor\(vatRegistered\)/);
  const validate = readFileSync(join(root, "app/api/v1/coupons/validate/route.ts"), "utf8");
  assert.match(validate, /vatPercent: vatPercentFor\(vatRegistered\)/);
});
