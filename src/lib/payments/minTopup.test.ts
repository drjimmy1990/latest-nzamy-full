/**
 * minTopup.test.ts — l7 decision 5 (owner 18 Nov §16.10, G28–G33): the
 * minimum top-up per account type, from platform_settings, checked on the
 * server with the Arabic refusal and an audit row; and the checkout's one call.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { fakeDb, type FakeQuery } from "./fakeDb.test-helper.ts";
import { checkMinTopup, minTopupFor, minTopupRefusalAr } from "./minTopup.ts";
import { startCheckoutWith, type CheckoutDeps } from "./checkoutCore.ts";
import { DEFAULT_MIN_TOPUP_SAR, minTopupIssue, parseMinTopup } from "../points/pointsSettings.ts";

const USER = "00000000-0000-0000-0000-00000000u001";
const audits = (log: FakeQuery[]) => log.filter((q) => q.table === "admin_audit_events" && q.op === "insert");

test("the refusal names the limit in points (1 point = 1 SAR before VAT), Arabic digits", () => {
  assert.equal(minTopupRefusalAr(100), "الحد الأدنى للشحن لحسابك ١٠٠ نقطة (١٠٠ ريال قبل الضريبة)");
  assert.equal(minTopupRefusalAr(500), "الحد الأدنى للشحن لحسابك ٥٠٠ نقطة (٥٠٠ ريال قبل الضريبة)");
});

test("l12 (owner Q87): the default minimum is individual 100, every other account type 500", () => {
  for (const t of ["lawyer", "firm", "corporate", "micro", "government", "ngo", "provider"]) {
    assert.equal(minTopupFor(DEFAULT_MIN_TOPUP_SAR, t), 500, t);
  }
  assert.equal(minTopupFor(DEFAULT_MIN_TOPUP_SAR, "individual"), 100);
  assert.equal(minTopupFor(DEFAULT_MIN_TOPUP_SAR, null), null);
});

test("l12: with the defaults a 50-point order is refused for everyone; 100 passes an individual, 500 a lawyer", async () => {
  for (const userType of ["lawyer", "individual", "firm"]) {
    const { client, log } = fakeDb(() => ({ data: null }));
    const r = await checkMinTopup(client, { userId: USER, userType, itemId: "topup-50", baseNetHalalas: 5_000 });
    assert.equal(r.ok, false, userType);
    assert.equal(audits(log).length, 1, userType);
  }
  const { client } = fakeDb(() => ({ data: null }));
  assert.deepEqual(await checkMinTopup(client, { userId: USER, userType: "individual", itemId: "topup-100", baseNetHalalas: 10_000 }), { ok: true });
  assert.deepEqual(await checkMinTopup(client, { userId: USER, userType: "lawyer", itemId: "topup-500", baseNetHalalas: 50_000 }), { ok: true });
});

test("a stored map replaces the defaults; a malformed one falls back to them", () => {
  assert.deepEqual(parseMinTopup({ lawyer: 1000 }), { lawyer: 1000 });
  assert.deepEqual(parseMinTopup({ lawyer: "500" }), { ...DEFAULT_MIN_TOPUP_SAR });
  assert.deepEqual(parseMinTopup(null), { ...DEFAULT_MIN_TOPUP_SAR });
  assert.equal(minTopupIssue({ lawyer: -1 }) !== null, true);
  assert.equal(minTopupIssue({ lawyer: 500, individual: 100 }), null);
});

test("below the minimum: refused with the audit row (actor_type user); at the minimum: ok, no row", async () => {
  const stored = (q: FakeQuery) => (q.table === "platform_settings" ? { data: { value: { lawyer: 500 } } } : { data: null });
  const { client, log } = fakeDb(stored);
  const low = await checkMinTopup(client, { userId: USER, userType: "lawyer", itemId: "topup-100", baseNetHalalas: 10_000 });
  assert.deepEqual(low, { ok: false, status: 403, error: "الحد الأدنى للشحن لحسابك ٥٠٠ نقطة (٥٠٠ ريال قبل الضريبة)", code: "topup_below_minimum" });
  const row = audits(log)[0]?.payload as Record<string, unknown>;
  assert.equal(row.actor_id, USER);
  assert.equal(row.actor_type, "user");
  assert.equal(row.action, "topup_below_minimum");
  assert.deepEqual(row.metadata, { user_type: "lawyer", min_sar: 500, price_halalas: 10_000 });

  const { client: c2, log: l2 } = fakeDb(stored);
  assert.deepEqual(await checkMinTopup(c2, { userId: USER, userType: "lawyer", itemId: "topup-500", baseNetHalalas: 50_000 }), { ok: true });
  assert.equal(audits(l2).length, 0);
});

test("the admin's setting is read (a firm raised to 1,000) and a failed audit write never changes the answer", async () => {
  const { client } = fakeDb((q) => {
    if (q.table === "platform_settings") return { data: { value: { firm: 1000 } } };
    if (q.table === "admin_audit_events") return { error: { code: "42501", message: "denied" } };
    return { data: null };
  });
  const r = await checkMinTopup(client, { userId: USER, userType: "firm", itemId: "topup-500", baseNetHalalas: 50_000 });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error, "الحد الأدنى للشحن لحسابك ١٬٠٠٠ نقطة (١٬٠٠٠ ريال قبل الضريبة)");
});

test("checkout: a lawyer below his stored minimum gets the minimum, not the generic audience refusal", async () => {
  const { client, log } = fakeDb((q) =>
    q.table === "profiles"
      ? { data: { user_type: "lawyer" } }
      : q.table === "platform_settings"
        ? { data: { value: { lawyer: 500 } } }
        : { data: null },
  );
  const deps = {
    admin: client,
    client: {} as CheckoutDeps["client"],
    now: () => new Date("2026-11-20T08:00:00.000Z"),
  } as CheckoutDeps;
  const r = await startCheckoutWith(deps, { user: { id: USER }, itemId: "topup-100", billing: "once", origin: "https://example.test", publishableKey: "pk_test" });
  assert.equal(r.status, 403);
  assert.deepEqual(r.body, { error: "الحد الأدنى للشحن لحسابك ٥٠٠ نقطة (٥٠٠ ريال قبل الضريبة)", code: "topup_below_minimum" });
  assert.equal(audits(log).length, 1);
  assert.equal(log.some((q) => q.table === "payment_orders"), false, "nothing written for the order");
});

test("checkoutCore: one localized call, before the audience check, for top-ups only", () => {
  const src = readFileSync(join(import.meta.dirname, "checkoutCore.ts"), "utf8");
  const at = src.indexOf("await checkMinTopup(admin,");
  assert.ok(at > -1);
  assert.ok(src.indexOf("if (!buyerAllowed(known, userType))") > at);
  assert.equal(src.split("checkMinTopup(").length - 1, 1);
  assert.match(src, /known\.kind === "topup" && typeof known\.listedPrices\[input\.billing\] === "number"/);
});
