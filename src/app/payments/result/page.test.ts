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

// ── Payments UX fixes 2026-10-25: the page confirms on its own; the receipt has a way back ──

function stripComments(source: string): string {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");
}
const readRel = (rel: string) => stripComments(readFileSync(join(import.meta.dirname, rel), "utf8"));
const poller = readRel("../../../components/payments/ResultAutoRefresh.tsx");
const receipt = readRel("../../dashboard/billing/receipt/[orderId]/page.tsx");

test("the auto-refresh renders only for a view that offers the refresh link, with no key", () => {
  assert.match(code, /import ResultAutoRefresh from "@\/components\/payments\/ResultAutoRefresh"/);
  assert.match(code, /\{view\.refresh \? <ResultAutoRefresh refresh \/> : null\}/);
  // no key: a pending re-render keeps the component (and its window) in place
  assert.doesNotMatch(code, /<ResultAutoRefresh[^>]*key=/);
  // the manual refresh stays
  assert.match(code, /تحديث الصفحة/);
});

test("ResultAutoRefresh polls with router.refresh every 3 s, decided by autoRefreshDecision, with a quiet line", () => {
  assert.match(poller, /^"use client";/);
  assert.match(poller, /import \{ AUTO_REFRESH_INTERVAL_MS, autoRefreshDecision \} from "@\/lib\/payments\/resultView"/);
  assert.match(poller, /setInterval\(/);
  assert.match(poller, /AUTO_REFRESH_INTERVAL_MS\)/);
  assert.match(poller, /if \(decision === "poll"\) \{\s*router\.refresh\(\);/);
  assert.match(poller, /clearInterval\(timer\);\s*setPolling\(false\);/);
  assert.match(poller, /return \(\) => clearInterval\(timer\)/);
  assert.match(poller, /جارٍ التحقق تلقائياً…/);
  assert.match(poller, /if \(!refresh \|\| !polling\) return null;/);
});

test("the receipt page has the site Navbar and a button-styled way back, both hidden when printing", () => {
  assert.match(receipt, /import Navbar from "@\/components\/Navbar"/);
  assert.match(receipt, /<div className="print:hidden"><Navbar \/><\/div>/);
  assert.match(receipt, /const BACK_LINK = "inline-flex[^"]*rounded-xl[^"]*print:hidden"/);
  assert.match(receipt, /<Link href="\/dashboard\/billing" className=\{BACK_LINK\}>العودة إلى الفوترة<\/Link>/);
  // every render path — the receipt and the unavailable state — has the Navbar
  assert.equal((receipt.match(/<ScreenNavbar \/>/g) ?? []).length, 2);
  // the main clears the fixed Navbar on screen; print resets it
  assert.match(receipt, /<main[^>]*pt-32[^>]*print:p-0/);
});
