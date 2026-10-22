/**
 * route.test.ts — source contract for POST /api/v1/payments/checkout
 * (Moyasar payments B1, Task 6). The route imports next/server and the
 * Supabase clients, so it cannot run under `node --test`; what is left in it
 * (session, body, gateway switch, origin, client construction) is pinned in
 * the source. Everything after that is startCheckoutWith, whose behaviour is
 * executed in src/lib/payments/checkoutCore.test.ts; the pure rules in
 * checkoutRules.test.ts and catalog.test.ts.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const routeSource = readFileSync(join(import.meta.dirname, "route.ts"), "utf8");
const coreSource = readFileSync(join(import.meta.dirname, "../../../../../lib/payments/checkoutCore.ts"), "utf8");

/** Comment lines dropped, so prose never satisfies a rule about code. */
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
const core = codeOnly(coreSource);
const post = code.slice(code.indexOf("export async function POST("));

test("the route exports POST only", () => {
  assert.ok(post.length > 0);
  assert.doesNotMatch(code, /export async function (GET|PUT|PATCH|DELETE)\(/);
});

test("signed-in only: 401 before anything is read or priced", () => {
  const userAt = post.indexOf("auth.getUser()");
  const unauthAt = post.indexOf("}, 401);");
  assert.ok(userAt > -1 && unauthAt > userAt, "getUser, then 401");
  for (const later of ["getMoyasarConfig()", "createServiceClient()", "startCheckoutWith("]) {
    const at = post.indexOf(later);
    assert.ok(at > unauthAt, `${later} only after the 401`);
  }
});

test("the gateway switch: disabled → 503 «الدفع الإلكتروني غير متاح حالياً»; a throw is the same 503", () => {
  assert.match(code, /import \{[^}]*MOYASAR_DISABLED_MESSAGE_AR[^}]*\} from "@\/lib\/payments\/moyasarConfig"/);
  assert.match(post, /if \(!cfg\.enabled\) \{\s*return reply\(\{ error: MOYASAR_DISABLED_MESSAGE_AR \}, 503\);/);
  assert.match(post, /try \{\s*cfg = await getMoyasarConfig\(\);\s*\} catch \{[\s\S]{0,120}return unavailable\(\);/);
  assert.match(post, /try \{\s*admin = await createServiceClient\(\);\s*\} catch \{[\s\S]{0,120}return unavailable\(\);/);
  assert.match(post, /\} catch \(err\) \{[\s\S]{0,200}return unavailable\(\);/, "a throw from the checkout itself is a 503");
});

test("test mode is for staff and test accounts only: anyone else gets the gateway-off 503 before anything is priced", () => {
  assert.match(code, /import \{ checkoutModeAllowed \} from "@\/lib\/payments\/testModeAccess"/);
  assert.match(
    post,
    /if \(!\(await checkoutModeAllowed\(admin, cfg\.mode, user\.id\)\)\) \{\s*return reply\(\{ error: MOYASAR_DISABLED_MESSAGE_AR \}, 503\);/,
  );
  const unauthAt = post.indexOf("}, 401);");
  const disabledAt = post.indexOf("if (!cfg.enabled)");
  const adminAt = post.indexOf("admin = await createServiceClient()");
  const gateAt = post.indexOf("checkoutModeAllowed(admin, cfg.mode, user.id)");
  const startAt = post.indexOf("startCheckoutWith(");
  assert.ok(unauthAt > -1 && disabledAt > unauthAt && adminAt > disabledAt, "401, gateway switch, service client");
  assert.ok(gateAt > adminAt && startAt > gateAt, "the test-mode gate runs before startCheckoutWith");
});

test("only {itemId, billing} reaches the checkout — the body never carries a price", () => {
  assert.match(post, /const parsed = parseCheckoutBody\(raw\)/);
  assert.match(post, /itemId: parsed\.itemId,\s*billing: parsed\.billing,/);
  assert.doesNotMatch(post, /raw\.|raw\[/, "nothing else is read off the raw body");
  assert.doesNotMatch(core, /amount: input|input\.(amount|price|total)/);
});

test("the origin comes from NEXT_PUBLIC_SITE_URL only — never the Host header", () => {
  assert.match(post, /resolveCallbackOrigin\(process\.env\.NEXT_PUBLIC_SITE_URL, cfg\.mode\)/);
  assert.match(post, /origin: origin\.origin,/);
  for (const src of [code, core]) {
    for (const banned of [/headers\.get\("host"\)/i, /x-forwarded-host/i, /nextUrl\.origin/, /request\.url/, /req\.url/, /NEXT_PUBLIC_APP_URL/]) {
      assert.doesNotMatch(src, banned, String(banned));
    }
  }
  assert.match(post, /if \(!origin\.ok\) \{[\s\S]{0,200}return reply\(\{ error: MOYASAR_DISABLED_MESSAGE_AR \}, 503\);/, "an unset / non-https (live) origin refuses with 503");
});

test("the publishable key goes out; the secret key never does", () => {
  assert.match(post, /publishableKey: cfg\.publishableKey/);
  assert.doesNotMatch(post, /secretKey/);
  assert.doesNotMatch(core, /secretKey/);
  assert.match(code, /"Cache-Control": "no-store"/);
});

test("deploy order: never a 500", () => {
  assert.match(core, /isMissingPaymentsObject\(/);
  for (const src of [code, core]) assert.doesNotMatch(src, /status: 500|, 500\)/);
});

test("the client secret and the keys are never logged", () => {
  for (const src of [code, core]) {
    for (const line of src.split("\n").filter((l) => /console\.(log|warn|error|info)/.test(l))) {
      assert.doesNotMatch(line, /clientSecret|client_secret|secretKey|publishableKey|cfg\b|intent\.data\b/, line);
    }
  }
});

test("CheckoutResponse documents that orderId goes into the payment metadata", () => {
  const rules = readFileSync(join(import.meta.dirname, "../../../../../lib/payments/checkoutRules.ts"), "utf8");
  assert.match(rules, /export interface CheckoutResponse/);
  assert.match(rules, /metadata\.order_id/);
});
