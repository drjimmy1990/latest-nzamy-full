/**
 * route.test.ts — source contract for POST /api/v1/payments/checkout
 * (Moyasar payments B1, Task 6). The route imports next/server and the
 * Supabase clients, so it cannot run under `node --test`; its wiring is
 * pinned in the source. The pure rules it calls (body, origin, superseding)
 * are executed in src/lib/payments/checkoutRules.test.ts, the quote in
 * src/lib/payments/catalog.test.ts.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const routeSource = readFileSync(join(import.meta.dirname, "route.ts"), "utf8");

/** The route with comment lines dropped, so prose never satisfies a rule about code. */
function codeOnly(source: string): string {
  return source
    .split(/\r?\n/)
    .filter((line) => {
      const t = line.trimStart();
      return !t.startsWith("*") && !t.startsWith("/*") && !t.startsWith("//");
    })
    .join("\n");
}

const code = codeOnly(routeSource);
const post = code.slice(code.indexOf("export async function POST("));

test("the route exports POST only", () => {
  assert.ok(post.length > 0);
  assert.doesNotMatch(code, /export async function (GET|PUT|PATCH|DELETE)\(/);
});

test("signed-in only: 401 before anything is read or priced", () => {
  const userAt = post.indexOf("auth.getUser()");
  const unauthAt = post.indexOf("}, 401);");
  assert.ok(userAt > -1 && unauthAt > userAt, "getUser, then 401");
  for (const later of ["getMoyasarConfig()", "quote(", "createServiceClient()"]) {
    const at = post.indexOf(later);
    assert.ok(at > unauthAt, `${later} only after the 401`);
  }
});

test("the gateway switch: disabled → 503 «الدفع الإلكتروني غير متاح حالياً»", () => {
  assert.match(code, /import \{[^}]*MOYASAR_DISABLED_MESSAGE_AR[^}]*\} from "@\/lib\/payments\/moyasarConfig"/);
  assert.match(post, /if \(!cfg\.enabled\) \{\s*return reply\(\{ error: MOYASAR_DISABLED_MESSAGE_AR \}, 503\);/);
  // a throw while reading the settings (or building the service client) is a 503 too, never an implicit 500
  assert.match(post, /try \{\s*cfg = await getMoyasarConfig\(\);\s*\} catch \{[\s\S]{0,120}return unavailable\(\);/);
  assert.match(post, /try \{\s*admin = await createServiceClient\(\);\s*\} catch \{[\s\S]{0,120}return unavailable\(\);/);
});

test("the price comes from quote(), with the caller's profiles.user_type — never from the body", () => {
  assert.match(post, /parseCheckoutBody\(/, "the body goes through parseCheckoutBody (itemId + billing only)");
  assert.match(post, /\.from\("profiles"\)\s*\.select\("user_type"\)\s*\.eq\("id", user\.id\)/);
  assert.match(post, /quote\(parsed\.itemId, parsed\.billing, userType\)/);
  // the order and the intent carry the quote's amounts
  assert.match(post, /net_halalas: q\.netHalalas/);
  assert.match(post, /vat_halalas: q\.vatHalalas/);
  assert.match(post, /total_halalas: q\.totalHalalas/);
  assert.match(post, /vat_mode: q\.vatMode/);
  assert.match(post, /amountHalalas: q\.totalHalalas/);
  // nothing priced is read off the request body
  assert.doesNotMatch(post, /body\.(amount|price|total|net|vat)/i);
  assert.doesNotMatch(post, /raw\.(amount|price|total|net|vat)/i);
});

test("the origin comes from NEXT_PUBLIC_SITE_URL only — never the Host header", () => {
  assert.match(post, /resolveCallbackOrigin\(process\.env\.NEXT_PUBLIC_SITE_URL, cfg\.mode\)/);
  assert.match(post, /callbackUrlFor\(origin\.origin, orderId\)/);
  for (const banned of [/headers\.get\("host"\)/i, /x-forwarded-host/i, /nextUrl\.origin/, /request\.url/, /req\.url/, /NEXT_PUBLIC_APP_URL/]) {
    assert.doesNotMatch(code, banned, String(banned));
  }
  assert.match(post, /if \(!origin\.ok\) \{[\s\S]{0,200}return reply\(\{ error: MOYASAR_DISABLED_MESSAGE_AR \}, 503\);/, "an unset / non-https (live) origin refuses with 503");
});

test("the intent: «NEZAMY — <labelAr>», the order id as metadata, then initiated with the intent id", () => {
  assert.match(post, /const descriptionAr = intentDescription\(q\.item\.labelAr\)/);
  assert.match(post, /description: descriptionAr,/);
  assert.match(post, /metadata: \{ order_id: orderId \}/);
  const insertAt = post.search(/\.from\("payment_orders"\)\s*\.insert\(/);
  const intentAt = post.indexOf("client.createIntent(");
  const stampAt = post.indexOf('status: "initiated"');
  assert.ok(insertAt > -1, "the order is inserted");
  assert.ok(intentAt > insertAt, "the order exists before the intent");
  assert.ok(stampAt > intentAt, "initiated only once the intent exists");
  assert.match(post, /moyasar_intent_id: intent\.data\.id, status: "initiated"/);
  assert.match(post, /status: "created"/, "the order is born created");
  assert.match(post, /source: "checkout"/);
  assert.match(post, /merchant: "platform"/);
});

test("the client secret goes out only when the stamp really updated this order (a concurrent checkout may have closed it)", () => {
  assert.match(
    post,
    /\.update\(\{ moyasar_intent_id: intent\.data\.id, status: "initiated" \}\)\s*\.eq\("id", orderId\)\s*\.eq\("status", "created"\)\s*\.select\("id"\);/,
  );
  assert.match(post, /if \(stampErr \|\| !Array\.isArray\(stamped\) \|\| stamped\.length !== 1\) \{[\s\S]{0,500}client\.cancelIntent\(intent\.data\.id\)[\s\S]{0,300}, 503\);/);
  const failAt = post.indexOf("if (stampErr || !Array.isArray(stamped)");
  const secretAt = post.indexOf("clientSecret: intent.data.clientSecret");
  assert.ok(failAt > -1 && secretAt > failAt, "the secret is only read after the stamp check");
});

test("the order snapshots the buyer's email (user_id is set null if the account is deleted)", () => {
  assert.match(post, /metadata: \{ user_email: user\.email \?\? null \}/);
});

test("a failed intent closes the new order and answers 503, never a created row left behind", () => {
  assert.match(post, /if \(!intent\.ok\) \{[\s\S]{0,500}\.update\(\{ status: "cancelled" \}\)[\s\S]{0,200}return reply\(\{ error: INTENT_FAILED_AR \}, 503\);/);
});

test("earlier open orders for the same item are superseded, the intent cancelled first", () => {
  const helper = code.slice(code.indexOf("async function supersedeEarlierOrders("), code.indexOf("export async function POST("));
  assert.ok(helper.length > 0, "the superseding helper exists");
  assert.match(helper, /\.eq\("user_id", userId\)\s*\.eq\("item_id", itemId\)/, "the buyer's own orders for this item");
  assert.match(helper, /ordersToSupersede\(/);
  const cancelIntentAt = helper.indexOf("client.cancelIntent(");
  const decideAt = helper.indexOf("cancelOrderAfterIntentCancel(");
  const closeAt = helper.indexOf('.update({ status: "cancelled" })');
  assert.ok(cancelIntentAt > -1 && decideAt > cancelIntentAt && closeAt > decideAt, "ask Moyasar first, decide, then close");
  // the close is conditional: still the buyer's, still open, still without a payment
  const close = helper.slice(closeAt);
  assert.match(close, /\.eq\("user_id", userId\)\s*\.in\("status", \["created", "initiated"\]\)\s*\.is\("moyasar_payment_id", null\)/);
  // POST supersedes before the new order is inserted
  const supersedeAt = post.indexOf("await supersedeEarlierOrders(admin, client, user.id, q.item.id)");
  const insertAt = post.search(/\.from\("payment_orders"\)\s*\.insert\(/);
  assert.ok(supersedeAt > -1 && insertAt > supersedeAt);
});

test("the response is the brief's shape, uncached; orderId is there for the browser's payment metadata", () => {
  for (const key of ["orderId", "intentId", "clientSecret", "publishableKey", "amountHalalas", "descriptionAr", "saveCard", "quote"]) {
    assert.match(post, new RegExp(`\\b${key}\\b`), key);
  }
  assert.match(post, /quote: \{ net: q\.netHalalas, vat: q\.vatHalalas, total: q\.totalHalalas, vatMode: q\.vatMode \}/);
  assert.match(post, /publishableKey: cfg\.publishableKey/);
  assert.doesNotMatch(post, /secretKey/, "the secret key never reaches the response");
  assert.match(code, /"Cache-Control": "no-store"/);
  const rules = readFileSync(join(import.meta.dirname, "../../../../../lib/payments/checkoutRules.ts"), "utf8");
  assert.match(rules, /export interface CheckoutResponse/);
  assert.match(rules, /metadata\.order_id/, "the response type documents that orderId goes into the payment metadata");
});

test("deploy order: a missing payments table or function is 503 with Arabic copy, never 500", () => {
  assert.match(code, /isMissingPaymentsObject\(/);
  assert.doesNotMatch(code, /status: 500/);
});

test("the client secret and the keys are never logged", () => {
  for (const line of code.split("\n").filter((l) => /console\.(log|warn|error|info)/.test(l))) {
    assert.doesNotMatch(line, /clientSecret|client_secret|secretKey|publishableKey|cfg\b/, line);
  }
});
