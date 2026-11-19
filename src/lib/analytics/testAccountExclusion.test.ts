/**
 * testAccountExclusion.test.ts — GA4 / Clarity never count a test account
 * (owner file 19 §1ج.2, batch l9-testinfra; his T33 "absent from analytics").
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/analytics/testAccountExclusion.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ELIGIBILITY_PATH,
  TEST_DEVICE_COOKIE,
  TEST_DEVICE_MAX_AGE_S,
  gateFromAnswer,
  gateFromCookies,
  hasSupabaseSessionCookie,
  isTestDevice,
  testDeviceCookieString,
} from "./testAccountExclusion.ts";
import { buildPurchasePayload } from "./analytics.ts";
import { isTestAccountUser, testAccountFrom } from "../testAccounts/isTestAccount.ts";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

test("a tester's browser is recognised by its marker cookie only", () => {
  assert.equal(isTestDevice(`a=1; ${TEST_DEVICE_COOKIE}=1; b=2`), true);
  assert.equal(isTestDevice(`${TEST_DEVICE_COOKIE}=0`), false);
  assert.equal(isTestDevice(`x${TEST_DEVICE_COOKIE}=1`), false);
  assert.equal(isTestDevice(""), false);
  assert.equal(isTestDevice(null), false);
});

test("a Supabase session is seen by its cookie name (chunked too), never by its value", () => {
  assert.equal(hasSupabaseSessionCookie("sb-abcdefgh-auth-token=xyz"), true);
  assert.equal(hasSupabaseSessionCookie("nz_consent=granted; sb-abc_def-auth-token.0=x; sb-abc_def-auth-token.1=y"), true);
  assert.equal(hasSupabaseSessionCookie("sb-abc-auth-token-code-verifier=x"), false);
  assert.equal(hasSupabaseSessionCookie("nz_consent=granted; _ga=GA1.1.1.2"), false);
  assert.equal(hasSupabaseSessionCookie("x=sb-abc-auth-token"), false);
  assert.equal(hasSupabaseSessionCookie(undefined), false);
});

test("the gate: marker → excluded; signed out → ok without a request; signed in → ask", () => {
  assert.equal(gateFromCookies(`${TEST_DEVICE_COOKIE}=1; sb-p-auth-token=x`), "excluded");
  assert.equal(gateFromCookies("nz_consent=granted"), "ok");
  assert.equal(gateFromCookies("sb-p-auth-token=x"), "ask");
});

test("the answer: only an explicit { exclude: false } loads anything (fail-closed for signed-in visitors)", () => {
  assert.equal(gateFromAnswer(true, { exclude: false }), "ok");
  assert.equal(gateFromAnswer(true, { exclude: true }), "excluded");
  assert.equal(gateFromAnswer(false, { exclude: false }), "excluded", "a 503 never loads");
  assert.equal(gateFromAnswer(true, null), "excluded");
  assert.equal(gateFromAnswer(true, { exclude: "false" }), "excluded");
  assert.equal(gateFromAnswer(true, {}), "excluded");
});

test("the marker cookie: first-party, whole site, Lax, 180 days, Secure on https", () => {
  assert.equal(TEST_DEVICE_MAX_AGE_S, 15552000);
  assert.equal(testDeviceCookieString(true), `${TEST_DEVICE_COOKIE}=1; Max-Age=15552000; Path=/; SameSite=Lax; Secure`);
  assert.equal(testDeviceCookieString(false), `${TEST_DEVICE_COOKIE}=1; Max-Age=15552000; Path=/; SameSite=Lax`);
});

test("the server purchase event refuses a test account's order even with consented GA ids", () => {
  const order = {
    orderId: "o1",
    itemId: "p",
    itemName: "باقة",
    kind: "plan",
    totalHalalas: 1000,
    currency: "SAR",
    metadata: { analytics: { ga_client_id: "111.222" } } as Record<string, unknown>,
  };
  assert.ok(buildPurchasePayload(order), "a real order with consent is reported");
  assert.equal(buildPurchasePayload({ ...order, metadata: { ...order.metadata, test_account: true } }), null);
});

// ── who is a test account (one read per account) ────────────────────────────

test("the rule: is_demo wins; staff never; listed otherwise", () => {
  assert.equal(testAccountFrom({ is_demo: true, user_type: "admin" }, false), true);
  assert.equal(testAccountFrom({ is_demo: false, user_type: "admin" }, true), false);
  assert.equal(testAccountFrom({ is_demo: false, user_type: "lawyer" }, true), true);
  assert.equal(testAccountFrom({ is_demo: false, user_type: "lawyer" }, false), false);
  assert.equal(testAccountFrom(null, true), true);
});

type Answer = { data: unknown; error: { code?: string } | null };
function fakeAdmin(answers: Record<string, Answer | Answer[]>) {
  const seen: string[] = [];
  return {
    seen,
    client: {
      from(table: string) {
        let cols = "";
        const q = {
          select(c: string) { cols = c; return q; },
          eq() { return q; },
          async maybeSingle() {
            const key = `${table}:${cols}`;
            seen.push(key);
            const a = answers[key];
            if (Array.isArray(a)) return a.shift() ?? { data: null, error: null };
            return a ?? { data: null, error: null };
          },
        };
        return q;
      },
    } as never,
  };
}

test("isTestAccountUser: listed / demo / admin / real, and null when it cannot read", async () => {
  const id = "00000000-0000-0000-0000-00000000a003";
  const listed = fakeAdmin({
    "profiles:is_demo, user_type": { data: { is_demo: false, user_type: "client" }, error: null },
    "test_accounts:user_id": { data: { user_id: id }, error: null },
  });
  assert.equal(await isTestAccountUser(listed.client, id), true);
  const admin = fakeAdmin({
    "profiles:is_demo, user_type": { data: { is_demo: false, user_type: "admin" }, error: null },
    "test_accounts:user_id": { data: { user_id: id }, error: null },
  });
  assert.equal(await isTestAccountUser(admin.client, id), false);
  const real = fakeAdmin({ "profiles:is_demo, user_type": { data: { is_demo: false, user_type: "lawyer" }, error: null } });
  assert.equal(await isTestAccountUser(real.client, id), false);
  const down = fakeAdmin({ "profiles:is_demo, user_type": { data: null, error: { code: "XX000" } } });
  assert.equal(await isTestAccountUser(down.client, id), null);
  const listDown = fakeAdmin({
    "profiles:is_demo, user_type": { data: { is_demo: false, user_type: "lawyer" }, error: null },
    "test_accounts:user_id": { data: null, error: { code: "57014" } },
  });
  assert.equal(await isTestAccountUser(listDown.client, id), null);
  // before 20261125_50 (no is_demo column): the type alone, then the list
  const old = fakeAdmin({
    "profiles:is_demo, user_type": { data: null, error: { code: "42703" } },
    "profiles:user_type": { data: { user_type: "client" }, error: null },
    "test_accounts:user_id": { data: { user_id: id }, error: null },
  });
  assert.equal(await isTestAccountUser(old.client, id), true);
  assert.ok(old.seen.includes("profiles:user_type"));
});

// ── wiring, read from the source ─────────────────────────────────────────────

test("AnalyticsConsent waits for the gate before loading anything and unloads on 'excluded'", () => {
  const c = read("components/analytics/AnalyticsConsent.tsx");
  assert.match(c, /const testGate = useTestAccountGate\(allowed && choice === "granted", pathname\);/);
  const pendingAt = c.indexOf('if (allowed && choice === "granted" && testGate === "pending") return;');
  const unloadAt = c.indexOf('if (!allowed || choice !== "granted" || testGate === "excluded") {');
  const loadAt = c.indexOf("loadScripts(w, clarityHere);");
  assert.ok(pendingAt > -1 && unloadAt > pendingAt && loadAt > unloadAt, "pending returns first, excluded unloads, then load");
  assert.match(c, /\}, \[allowed, choice, pathname, testGate\]\);/);
  assert.match(c, /choice !== "granted" \|\| !allowed \|\| testGate !== "ok"\) return;/, "no click tracking for a test account");
});

test("the hook asks the eligibility route without caching and fails closed", () => {
  const h = read("components/analytics/useTestAccountGate.ts");
  assert.match(h, /fetch\(ELIGIBILITY_PATH, \{ cache: "no-store", credentials: "same-origin" \}\)/);
  assert.match(h, /\.catch\(\(\) => "excluded" as const\)/);
  assert.match(h, /useState<TestGateState>\("pending"\)/);
  assert.equal(ELIGIBILITY_PATH, "/api/v1/analytics/eligibility");
});

test("the eligibility route: signed out → false; test → true + marker; unreadable → 503 exclude; never cached", () => {
  const r = read("app/api/v1/analytics/eligibility/route.ts");
  assert.match(r, /if \(!user\) return NextResponse\.json\(\{ exclude: false \}/);
  assert.match(r, /if \(test === null\) \{[\s\S]*?\{ exclude: true \}, \{ status: 503/);
  assert.match(r, /if \(!test\) return NextResponse\.json\(\{ exclude: false \}/);
  const cookieAt = r.indexOf('res.headers.append("Set-Cookie", testDeviceCookieString(');
  assert.ok(cookieAt > r.indexOf("if (!test) return"), "the marker is set only for a test account");
  assert.match(r, /"Cache-Control": "private, no-store"/);
  assert.match(r, /export const dynamic = "force-dynamic";/);
});
