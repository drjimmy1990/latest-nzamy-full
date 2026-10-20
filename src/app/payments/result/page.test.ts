/**
 * page.test.ts — source contract for /payments/result (Moyasar payments B1,
 * Task 6). The page is a server component importing next/navigation and the
 * Supabase clients, so its wiring is pinned in the source; what it shows for
 * each outcome is executed in src/lib/payments/resultView.test.ts.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const pageSource = readFileSync(join(import.meta.dirname, "page.tsx"), "utf8");

function codeOnly(source: string): string {
  return source
    .split(/\r?\n/)
    .filter((line) => {
      const t = line.trimStart();
      return !t.startsWith("*") && !t.startsWith("/*") && !t.startsWith("//");
    })
    .join("\n");
}

const code = codeOnly(pageSource);

test("a server component, rendered per request", () => {
  assert.doesNotMatch(pageSource, /^["']use client["']/m);
  assert.match(code, /export const dynamic = "force-dynamic"/);
});

test("signed out → /login with the way back; the order must belong to the signed-in user (else 404)", () => {
  assert.match(code, /auth\.getUser\(\)/);
  assert.match(code, /redirect\(`\/login\?from=\$\{encodeURIComponent\(/);
  assert.match(code, /\.from\("payment_orders"\)[\s\S]{0,300}\.eq\("id", orderId\)\s*\.eq\("user_id", user\.id\)/);
  assert.match(code, /notFound\(\)/);
  // the owner filter is in the query itself, before anything is fulfilled
  const ownerAt = code.indexOf('.eq("user_id", user.id)');
  const fulfilAt = code.indexOf("fulfillOrder(");
  assert.ok(ownerAt > -1 && fulfilAt > ownerAt);
});

test("never trusts ?status= from the URL", () => {
  assert.doesNotMatch(code, /sp\.status|params\.status|searchParams\.status|\["status"\]|get\("status"\)/);
  // the two query values the page reads: the order and the payment id
  assert.match(code, /firstParam\(sp\.order\)/);
  assert.match(code, /firstParam\(sp\.id\)/);
});

test("fulfils with the stored payment id (the callback's only when the order has none) as the platform merchant", () => {
  assert.match(code, /fulfillOrder\(\{ orderId: order\.id, paymentId, merchant: "platform" \}\)/);
  assert.match(code, /const paymentId = order\.moyasar_payment_id \?\? urlPaymentId;/);
  assert.match(code, /resultViewWithoutPayment\(order\)/, "no payment id: no fulfilment call");
  assert.match(code, /paymentResultView\(result, order\)/);
});

test("Moyasar's own message is shown only beside the Arabic copy, with its own direction", () => {
  assert.match(code, /view\.detail/);
  assert.match(code, /dir="auto"/);
});

test("a service client that cannot be built renders the Arabic «temporarily unavailable» state, never a 500", () => {
  assert.match(code, /try \{\s*admin = await createServiceClient\(\);\s*\} catch \{[\s\S]{0,200}temporarilyUnavailableView\(\)/);
  assert.match(pageSource, /"الخدمة غير متاحة مؤقتاً"/);
});

test("deploy order: a missing payments table never answers 500", () => {
  assert.match(code, /isMissingPaymentsObject\(/);
  assert.match(code, /22P02/, "a malformed order id is a 404");
});

test("never indexed", () => {
  assert.match(code, /robots: \{ index: false/);
});
