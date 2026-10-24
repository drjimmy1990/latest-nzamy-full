/**
 * paymentsTabs.test.ts — source contract for the settings tabs «المدفوعات» and
 * «الخطة والحدود» after the gateway went live (payments UX fixes, 2026-10-25).
 * They are client components that do not load under `node --test`; the data
 * rules they use (parseBillingResponse, pointsSummary, cardTitleAr, hasReceipt)
 * are executed in src/lib/payments/billingView.test.ts.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function codeOnly(source: string): string {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");
}
const read = (rel: string) => codeOnly(readFileSync(join(import.meta.dirname, rel), "utf8"));
const payments = read("PaymentsTab.tsx");
const subscription = read("SubscriptionTab.tsx");
const hook = read("../../../../components/payments/useBillingData.ts");
const card = read("../../../../components/payments/PointsBalanceCard.tsx");
const controls = read("../../../../components/payments/BillingControls.tsx");

test("useBillingData reads GET /api/v1/billing and keeps only a parsed answer", () => {
  assert.match(hook, /^"use client";/);
  assert.match(hook, /fetch\("\/api\/v1\/billing", \{ cache: "no-store" \}\)/);
  assert.match(hook, /res\.ok \? parseBillingResponse\(await res\.json\(\)\) : null/);
  assert.match(hook, /let next: BillingState = \{ status: "error" \};/);
  for (const src of [hook, payments, subscription, card]) {
    assert.doesNotMatch(src, /createServiceClient|SERVICE_ROLE|MOYASAR_SECRET|\btoken\b/);
  }
});

test("«المدفوعات» shows the member's real cards, latest orders and points — no literal rows", () => {
  assert.match(payments, /const \{ state, reload \} = useBillingData\(\);/);
  assert.match(payments, /تعذّر تحميل المدفوعات/);
  assert.match(payments, /<Link href="\/dashboard\/billing"[^>]*>\s*عرض الكل\s*<\/Link>/);
  assert.match(payments, /<PointsBalanceCard data=\{state\.data\} \/>/);
  assert.match(payments, /\{cardTitleAr\(card\)\}/);
  assert.match(payments, /<DeleteCardButton id=\{card\.id\} onDeleted=\{reload\} \/>/);
  assert.match(payments, /orderStatusAr\(order\.status\)/);
  assert.match(payments, /billingItemAr\(order\.item_id\)/);
  assert.match(payments, /formatHalalas\(order\.total_halalas\)/);
  assert.match(payments, /hasReceipt\(order\) \? \(\s*<Link\s+href=\{`\/dashboard\/billing\/receipt\/\$\{encodeURIComponent\(order\.id\)\}`\}/);
  // the error state comes before any row is rendered: nothing is invented on failure
  assert.ok(payments.indexOf('state.status === "error"') < payments.indexOf("state.data"));
  assert.doesNotMatch(payments, /محجوز|بانتظار الإنجاز|Visa \d|\*\*\*\* \d{4}/);
});

test("«الخطة والحدود» shows «رصيد النقاط» only after a successful read, above the account's plans", () => {
  assert.match(subscription, /const \{ state: billingRead \} = useBillingData\(\);/);
  assert.match(subscription, /\{billingRead\.status === "ready" \? \(\s*<div>\s*<SectionTitle>رصيد النقاط<\/SectionTitle>\s*<PointsBalanceCard data=\{billingRead\.data\} \/>/);
  assert.ok(subscription.indexOf("رصيد النقاط") < subscription.indexOf("الباقات المتاحة لحسابك"));
});

test("the points card links to /dashboard/billing and shows the nearest expiry from pointsSummary", () => {
  assert.match(card, /pointsSummary\(data\)/);
  assert.match(card, /<Link href="\/dashboard\/billing"/);
  assert.match(card, /أقرب انتهاء: \$\{billingDateAr\(nearestExpiry\)\}/);
});

test("DeleteCardButton keeps the server-page refresh when no onDeleted is passed", () => {
  assert.match(controls, /export function DeleteCardButton\(\{ id, onDeleted \}: \{ id: string; onDeleted\?: \(\) => void \}\)/);
  assert.match(controls, /else if \(onDeleted\) \{ onDeleted\(\); \} else \{ router\.refresh\(\); \}/);
});
