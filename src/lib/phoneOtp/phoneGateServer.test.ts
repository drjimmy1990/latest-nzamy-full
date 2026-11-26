import { test } from "node:test";
import assert from "node:assert/strict";

// Synthetic values only; no network — fetch is replaced for the whole file.
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://db.example.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";

const SINCE = "2026-12-01T00:00:00.000Z";
const calls: string[] = [];
let gateAnswer: "held" | "free" | "staff" | "error" = "held";

globalThis.fetch = (async (input: string | URL) => {
  const url = String(input);
  calls.push(url);
  if (url.includes("/rest/v1/platform_settings")) {
    return new Response(JSON.stringify([{ value: { enabled: true, enabled_at: SINCE } }]), { status: 200 });
  }
  if (url.includes("/rest/v1/rpc/phone_otp_gate")) {
    if (gateAnswer === "error") return new Response("{}", { status: 500 });
    if (gateAnswer === "staff") return new Response(JSON.stringify({ gated: false, reason: "staff" }), { status: 200 });
    return new Response(JSON.stringify({ gated: gateAnswer === "held", reason: gateAnswer === "held" ? "unverified" : "verified" }), { status: 200 });
  }
  return new Response("{}", { status: 404 });
}) as typeof fetch;

const { phoneGateVerdict, hasTokenPass, sessionTokenKey } = await import("./phoneGateServer.ts");

const gateCalls = () => calls.filter((u) => u.includes("phone_otp_gate")).length;

test("an account created before the switch-on is never held and never asks the database", async () => {
  const before = gateCalls();
  assert.equal(await phoneGateVerdict({ id: "u-old", created_at: "2026-11-30T23:59:59Z" }), "pass");
  assert.equal(gateCalls(), before);
});

test("a new account the database holds is held, and the answer is not kept", async () => {
  gateAnswer = "held";
  const before = gateCalls();
  assert.equal(await phoneGateVerdict({ id: "u-new", created_at: "2026-12-02T00:00:00Z" }), "held");
  assert.equal(await phoneGateVerdict({ id: "u-new", created_at: "2026-12-02T00:00:00Z" }), "held");
  assert.equal(gateCalls(), before + 2, "a held answer is read again every time");
});

test("once confirmed, the next request passes and the pass is kept (per user and per token)", async () => {
  gateAnswer = "free";
  const key = await sessionTokenKey(["Bearer x", "sb-ref-auth-token=abc"]);
  assert.ok(key && /^[0-9a-f]{64}$/.test(key));
  assert.equal(hasTokenPass(key!), false);
  assert.equal(await phoneGateVerdict({ id: "u-new", created_at: "2026-12-02T00:00:00Z" }, key), "pass");
  assert.equal(hasTokenPass(key!), true);
  const before = gateCalls();
  gateAnswer = "held";
  assert.equal(await phoneGateVerdict({ id: "u-new", created_at: "2026-12-02T00:00:00Z" }), "pass", "kept for a minute");
  assert.equal(gateCalls(), before);
});

test("a failed gate read holds a NEW account only (fail closed), never an old one", async () => {
  gateAnswer = "error";
  assert.equal(await phoneGateVerdict({ id: "u-other", created_at: "2026-12-03T00:00:00Z" }), "held");
  assert.equal(await phoneGateVerdict({ id: "u-old-2", created_at: "2026-01-01T00:00:00Z" }), "pass");
});

test("an exempt account once seen keeps passing while the gate read fails", async () => {
  gateAnswer = "staff";
  assert.equal(await phoneGateVerdict({ id: "u-staff", created_at: "2026-12-04T00:00:00Z" }), "pass");
  gateAnswer = "error";
  // Two minutes later: the 60 s pass is gone, only the 24 h "known exempt" remains.
  const realNow = Date.now;
  const later = realNow() + 2 * 60 * 1000;
  Date.now = () => later;
  try {
    assert.equal(await phoneGateVerdict({ id: "u-staff", created_at: "2026-12-04T00:00:00Z" }), "pass");
    assert.equal(await phoneGateVerdict({ id: "u-never-seen", created_at: "2026-12-04T00:00:00Z" }), "held");
  } finally {
    Date.now = realNow;
  }
});

test("the token key: same material → same key; nothing → null", async () => {
  assert.equal(await sessionTokenKey(["a", "b"]), await sessionTokenKey(["a", "b"]));
  assert.notEqual(await sessionTokenKey(["a", "b"]), await sessionTokenKey(["a", "c"]));
  assert.equal(await sessionTokenKey(["", ""]), null);
});
