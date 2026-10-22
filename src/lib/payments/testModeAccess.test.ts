/**
 * testModeAccess.test.ts — who may pay while the Moyasar gateway is in TEST
 * mode (B1 final review, finding 1): platform staff and the accounts in
 * public.test_accounts only. Everyone else, guests included, sees the gateway
 * as disabled, exactly as GET /api/v1/payments/status, POST
 * /api/v1/payments/checkout and /checkout then behave. Live is not gated.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { fakeDb, has, type FakeHandler } from "./fakeDb.test-helper.ts";
import {
  checkoutModeAllowed,
  gatewayStateFor,
  readTestModeAccess,
  testModeAllowed,
  viewerGatewayState,
} from "./testModeAccess.ts";
import type { PaymentGatewayState } from "../paymentGatewayPolicy.ts";

const USER = "00000000-0000-0000-0000-0000000a0001";
const DISABLED: PaymentGatewayState = { status: "disabled", provider: null, disabled: true };
const TEST_ON: PaymentGatewayState = { status: "test", provider: "moyasar", disabled: false };
const LIVE_ON: PaymentGatewayState = { status: "live", provider: "moyasar", disabled: false };

/** profiles → userType; platform_staff / test_accounts → a row when listed. */
function db(opts: {
  userType?: string | null;
  staff?: boolean;
  testAccount?: boolean;
  over?: FakeHandler;
}) {
  return fakeDb((q) => {
    const r = opts.over?.(q);
    if (r) return r;
    if (q.table === "profiles") return { data: opts.userType ? { user_type: opts.userType } : null };
    if (q.table === "platform_staff") return { data: opts.staff ? { user_id: USER } : null };
    if (q.table === "test_accounts") return { data: opts.testAccount ? { user_id: USER } : null };
    return { data: null };
  });
}

// ── the pure rule ───────────────────────────────────────────────────────────

test("testModeAllowed: test mode only for staff or a listed test account; live is not gated", () => {
  assert.equal(testModeAllowed({ mode: "test", isStaff: true, isTestAccount: false }), true);
  assert.equal(testModeAllowed({ mode: "test", isStaff: false, isTestAccount: true }), true);
  assert.equal(testModeAllowed({ mode: "test", isStaff: true, isTestAccount: true }), true);
  assert.equal(testModeAllowed({ mode: "test", isStaff: false, isTestAccount: false }), false);
  assert.equal(testModeAllowed({ mode: "live", isStaff: false, isTestAccount: false }), true);
  assert.equal(testModeAllowed({ mode: "live", isStaff: true, isTestAccount: true }), true);
  // anything else is closed
  for (const mode of ["disabled", "", "TEST", null, undefined, 1]) {
    assert.equal(testModeAllowed({ mode, isStaff: true, isTestAccount: true }), false, String(mode));
  }
});

test("gatewayStateFor: a refused viewer in test mode sees exactly the disabled state", () => {
  assert.deepEqual(gatewayStateFor(TEST_ON, false), DISABLED);
  assert.deepEqual(gatewayStateFor(TEST_ON, true), TEST_ON);
  assert.deepEqual(gatewayStateFor(LIVE_ON, false), LIVE_ON);
  assert.deepEqual(gatewayStateFor(DISABLED, true), DISABLED);
});

// ── the lookups ─────────────────────────────────────────────────────────────

test("readTestModeAccess: an admin profile is staff; every query is keyed by the user's id only", async () => {
  const { client, log } = db({ userType: "admin" });
  assert.deepEqual(await readTestModeAccess(client, USER), { isStaff: true, isTestAccount: false });
  assert.ok(log.length > 0);
  for (const q of log) {
    assert.equal(q.op, "select", q.table);
    assert.deepEqual(q.filters.length, 1, q.table);
    assert.ok(has(q, "eq", q.table === "profiles" ? "id" : "user_id", USER), q.table);
  }
  assert.deepEqual(log.map((q) => q.table).sort(), ["platform_staff", "profiles", "test_accounts"]);
});

test("readTestModeAccess: a platform_staff row is staff; a test_accounts row is a test account", async () => {
  assert.deepEqual(await readTestModeAccess(db({ userType: "lawyer", staff: true }).client, USER), {
    isStaff: true,
    isTestAccount: false,
  });
  assert.deepEqual(await readTestModeAccess(db({ userType: "lawyer", testAccount: true }).client, USER), {
    isStaff: false,
    isTestAccount: true,
  });
  assert.deepEqual(await readTestModeAccess(db({ userType: "individual" }).client, USER), {
    isStaff: false,
    isTestAccount: false,
  });
});

test("readTestModeAccess: no user id reads nothing and allows nothing", async () => {
  const { client, log } = db({ userType: "admin", staff: true, testAccount: true });
  assert.deepEqual(await readTestModeAccess(client, null), { isStaff: false, isTestAccount: false });
  assert.deepEqual(await readTestModeAccess(client, ""), { isStaff: false, isTestAccount: false });
  assert.equal(log.length, 0);
});

test("readTestModeAccess: test_accounts missing (42P01 / PGRST205) → not a test account, logged once", async () => {
  const warned: unknown[][] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => void warned.push(args);
  try {
    for (const code of ["42P01", "PGRST205", "42P01"]) {
      const { client } = db({
        userType: "lawyer",
        over: (q) => (q.table === "test_accounts" ? { error: { code, message: "missing" } } : undefined),
      });
      assert.deepEqual(await readTestModeAccess(client, USER), { isStaff: false, isTestAccount: false });
    }
  } finally {
    console.warn = original;
  }
  assert.equal(warned.filter((a) => String(a[0]).includes("test_accounts")).length, 1);
});

test("readTestModeAccess: platform_staff missing → the admin profile still counts; a lawyer does not", async () => {
  const missing: FakeHandler = (q) =>
    q.table === "platform_staff" ? { error: { code: "42P01", message: "missing" } } : undefined;
  const original = console.warn;
  console.warn = () => {};
  try {
    assert.equal((await readTestModeAccess(db({ userType: "admin", over: missing }).client, USER)).isStaff, true);
    assert.equal((await readTestModeAccess(db({ userType: "lawyer", over: missing }).client, USER)).isStaff, false);
  } finally {
    console.warn = original;
  }
});

test("readTestModeAccess: any other read error, or a throw, fails closed", async () => {
  const original = console.error;
  console.error = () => {};
  try {
    const failing: FakeHandler = () => ({ error: { code: "57014", message: "timeout" } });
    assert.deepEqual(
      await readTestModeAccess(db({ userType: "admin", staff: true, testAccount: true, over: failing }).client, USER),
      { isStaff: false, isTestAccount: false },
    );
    const throwing: FakeHandler = () => {
      throw new Error("boom");
    };
    assert.deepEqual(
      await readTestModeAccess(db({ userType: "admin", staff: true, testAccount: true, over: throwing }).client, USER),
      { isStaff: false, isTestAccount: false },
    );
  } finally {
    console.error = original;
  }
});

// ── GET /api/v1/payments/status ─────────────────────────────────────────────

test("status: live and disabled pass through without a session read or a lookup", async () => {
  for (const state of [LIVE_ON, DISABLED]) {
    let asked = 0;
    const out = await viewerGatewayState(state, {
      userId: async () => {
        asked++;
        return USER;
      },
      admin: async () => {
        asked++;
        return db({}).client;
      },
    });
    assert.deepEqual(out, state);
    assert.equal(asked, 0);
  }
});

test("status in test mode: a guest gets the disabled state; the service client is never built", async () => {
  let built = 0;
  const out = await viewerGatewayState(TEST_ON, {
    userId: async () => null,
    admin: async () => {
      built++;
      return db({ userType: "admin" }).client;
    },
  });
  assert.deepEqual(out, DISABLED);
  assert.equal(built, 0);
});

test("status in test mode: an ordinary account gets the disabled state; staff and test accounts get test", async () => {
  const viewer = (opts: Parameters<typeof db>[0]) =>
    viewerGatewayState(TEST_ON, { userId: async () => USER, admin: async () => db(opts).client });
  assert.deepEqual(await viewer({ userType: "lawyer" }), DISABLED);
  assert.deepEqual(await viewer({ userType: "individual" }), DISABLED);
  assert.deepEqual(await viewer({ userType: "admin" }), TEST_ON);
  assert.deepEqual(await viewer({ userType: "lawyer", staff: true }), TEST_ON);
  assert.deepEqual(await viewer({ userType: "firm", testAccount: true }), TEST_ON);
});

test("status in test mode: a failing session read or service client is the disabled state, never a throw", async () => {
  const original = console.error;
  console.error = () => {};
  try {
    assert.deepEqual(
      await viewerGatewayState(TEST_ON, {
        userId: async () => {
          throw new Error("auth down");
        },
        admin: async () => db({ userType: "admin" }).client,
      }),
      DISABLED,
    );
    assert.deepEqual(
      await viewerGatewayState(TEST_ON, {
        userId: async () => USER,
        admin: async () => {
          throw new Error("no service key");
        },
      }),
      DISABLED,
    );
  } finally {
    console.error = original;
  }
});

// ── POST /api/v1/payments/checkout ──────────────────────────────────────────

test("checkout: live is never looked up; test mode only for staff and test accounts", async () => {
  const live = db({ userType: "lawyer" });
  assert.equal(await checkoutModeAllowed(live.client, "live", USER), true);
  assert.equal(live.log.length, 0);

  assert.equal(await checkoutModeAllowed(db({ userType: "lawyer" }).client, "test", USER), false);
  assert.equal(await checkoutModeAllowed(db({ userType: "admin" }).client, "test", USER), true);
  assert.equal(await checkoutModeAllowed(db({ userType: "lawyer", staff: true }).client, "test", USER), true);
  assert.equal(await checkoutModeAllowed(db({ userType: "individual", testAccount: true }).client, "test", USER), true);
});

test("checkout in test mode: test_accounts missing → refused (only staff pass)", async () => {
  const missing: FakeHandler = (q) =>
    q.table === "test_accounts" ? { error: { code: "42P01", message: "missing" } } : undefined;
  const original = console.warn;
  console.warn = () => {};
  try {
    assert.equal(await checkoutModeAllowed(db({ userType: "lawyer", over: missing }).client, "test", USER), false);
    assert.equal(await checkoutModeAllowed(db({ userType: "admin", over: missing }).client, "test", USER), true);
  } finally {
    console.warn = original;
  }
});
