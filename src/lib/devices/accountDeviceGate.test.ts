/**
 * accountDeviceGate.test.ts — batch l19, owner ٢٣٣: the I/O half of the
 * whole-account device limit, with a fake PostgREST (no network). Every
 * refusal, every pass, the first-device rule and the fail-open + alert rule.
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/devices/accountDeviceGate.test.ts
 */
import test, { beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  __resetAccountDeviceGateForTests,
  accountDeviceOutcome,
  forgetAccountDevices,
  forgetAccountDeviceSwitch,
  loadAccountDeviceSwitch,
} from "./accountDeviceGate.ts";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://db.example.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";

const USER = "11111111-1111-4111-8111-111111111111";
const COOKIE = "A".repeat(43);
const PHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const PC_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

type Call = { url: string; body: Record<string, unknown> | null };

/** A fake fetch: `switchOn` answers the settings read, `gate` the RPC (a status, an HTTP error, or a throw). */
function fakeFetch(opts: {
  switchOn?: boolean | "fail" | "missing";
  gate?: string | { http: number; code?: string } | "throw" | "timeout" | "junk";
}) {
  const calls: Call[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    calls.push({ url, body });
    if (url.includes("/rest/v1/library_monitor_settings")) {
      const s = opts.switchOn ?? false;
      if (s === "fail") return new Response("{}", { status: 500 });
      if (s === "missing") return new Response(JSON.stringify({ code: "42703" }), { status: 400 });
      return new Response(JSON.stringify([{ account_device_limit_enabled: s }]), { status: 200 });
    }
    if (url.includes("/rpc/account_device_gate")) {
      const g = opts.gate ?? "ok";
      if (g === "throw") throw new TypeError("fetch failed");
      if (g === "timeout") throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
      if (g === "junk") return new Response(JSON.stringify([{ status: "maybe" }]), { status: 200 });
      if (typeof g === "object") return new Response(JSON.stringify({ code: g.code ?? "XX000" }), { status: g.http });
      return new Response(JSON.stringify([{ status: g, device_id: null, device_kind: null }]), { status: 200 });
    }
    if (url.includes("/rpc/library_monitor_notify_admins")) return new Response("", { status: 204 });
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  return {
    impl,
    calls,
    gateCalls: () => calls.filter((c) => c.url.includes("/rpc/account_device_gate")).length,
    alerts: () => calls.filter((c) => c.url.includes("/rpc/library_monitor_notify_admins")).length,
  };
}

const facts = (over: Partial<{ deviceId: string | null; userAgent: string; chUaMobile: string | null; userId: string }> = {}) => ({
  userId: over.userId ?? USER,
  deviceId: "deviceId" in over ? over.deviceId : COOKIE,
  userAgent: over.userAgent ?? PC_UA,
  chUaMobile: over.chUaMobile ?? null,
});

beforeEach(() => {
  __resetAccountDeviceGateForTests();
  mock.timers.reset();
});

// ── switch OFF: nothing changes ──
test("switch off: pass, no cookie minted, the gate is never called", async () => {
  const f = fakeFetch({ switchOn: false, gate: "refused" });
  for (const d of [COOKIE, null]) {
    assert.deepEqual(await accountDeviceOutcome(facts({ deviceId: d }), f.impl), { kind: "pass", setDeviceId: null });
  }
  assert.equal(f.gateCalls(), 0);
  assert.equal(f.alerts(), 0);
});

test("the migration not run (column missing): off, no alert, and not asked again for 10 minutes", async () => {
  const f = fakeFetch({ switchOn: "missing" });
  assert.deepEqual(await accountDeviceOutcome(facts(), f.impl), { kind: "pass", setDeviceId: null });
  const reads = f.calls.length;
  forgetAccountDevices(USER);
  assert.deepEqual(await accountDeviceOutcome(facts(), f.impl), { kind: "pass", setDeviceId: null });
  assert.equal(f.calls.length, reads, "no second read within the retry window");
  assert.equal(f.alerts(), 0);
});

// ── a request without a device cookie ──
test("switch on, no device cookie: a fresh id is minted, asked about at once, and set when allowed", async () => {
  const f = fakeFetch({ switchOn: true, gate: "pending" });
  const out = await accountDeviceOutcome(facts({ deviceId: null }), f.impl);
  assert.equal(out.kind, "pass");
  assert.ok(out.kind === "pass" && out.setDeviceId && /^[A-Za-z0-9_-]{43}$/.test(out.setDeviceId));
  assert.equal(f.gateCalls(), 1);
  const call = f.calls.find((c) => c.url.includes("/rpc/account_device_gate"));
  assert.ok(out.kind === "pass" && call?.body?.p_device_hash === createHash("sha256").update(out.setDeviceId!, "utf8").digest("hex"),
    "the gate is asked about the very id that is set");
  // A malformed cookie is treated as none.
  const bad = await accountDeviceOutcome(facts({ deviceId: "forged" }), f.impl);
  assert.ok(bad.kind === "pass" && bad.setDeviceId && bad.setDeviceId !== "forged");
});

test("deleting the cookie never opens a door: a fresh id whose class is taken is refused at once (and no cookie is set)", async () => {
  const f = fakeFetch({ switchOn: true, gate: "refused" });
  assert.deepEqual(await accountDeviceOutcome(facts({ deviceId: null }), f.impl), { kind: "refuse" });
  assert.deepEqual(await accountDeviceOutcome(facts({ deviceId: null }), f.impl), { kind: "refuse" });
  assert.equal(f.gateCalls(), 2);
});

test("parallel cookie-less first requests each get their own candidate id and none is refused", async () => {
  const f = fakeFetch({ switchOn: true, gate: "pending" });
  const outs = await Promise.all(Array.from({ length: 12 }, () => accountDeviceOutcome(facts({ deviceId: null }), f.impl)));
  assert.ok(outs.every((o) => o.kind === "pass" && o.setDeviceId));
  assert.equal(new Set(outs.map((o) => (o.kind === "pass" ? o.setDeviceId : ""))).size, 12, "12 different ids");
});

test("a fresh id when the gate fails: pass (fail open), the id is still set, one alert", async () => {
  const f = fakeFetch({ switchOn: true, gate: { http: 500 } });
  const out = await accountDeviceOutcome(facts({ deviceId: null }), f.impl);
  assert.ok(out.kind === "pass" && out.setDeviceId);
  assert.equal(f.alerts(), 1);
});

test("a known device's cookie is renewed when the gate is asked (never on a memo hit)", async () => {
  const f = fakeFetch({ switchOn: true, gate: "ok" });
  assert.deepEqual(await accountDeviceOutcome(facts(), f.impl), { kind: "pass", setDeviceId: COOKIE });
  assert.deepEqual(await accountDeviceOutcome(facts(), f.impl), { kind: "pass", setDeviceId: null });
});

// ── the gate's answers ──
test("refused → refuse, and a refusal is never memoised (an admin reset applies on the next request)", async () => {
  const f = fakeFetch({ switchOn: true, gate: "refused" });
  assert.deepEqual(await accountDeviceOutcome(facts(), f.impl), { kind: "refuse" });
  assert.deepEqual(await accountDeviceOutcome(facts(), f.impl), { kind: "refuse" });
  assert.equal(f.gateCalls(), 2);
});

test("registered / ok / pending → pass, remembered 60 s for that device only", async () => {
  mock.timers.enable({ apis: ["Date"], now: 1_000_000 });
  const f = fakeFetch({ switchOn: true, gate: "registered" });
  assert.deepEqual(await accountDeviceOutcome(facts(), f.impl), { kind: "pass", setDeviceId: COOKIE });
  assert.deepEqual(await accountDeviceOutcome(facts(), f.impl), { kind: "pass", setDeviceId: null });
  assert.equal(f.gateCalls(), 1, "memoised");
  await accountDeviceOutcome(facts({ deviceId: "B".repeat(43) }), f.impl);
  assert.equal(f.gateCalls(), 2, "another device is asked about");
  mock.timers.tick(61_000);
  await accountDeviceOutcome(facts(), f.impl);
  assert.equal(f.gateCalls(), 3, "asked again after a minute");
});

test("forgetAccountDevices drops the memo (an admin reset in this process)", async () => {
  const f = fakeFetch({ switchOn: true, gate: "ok" });
  await accountDeviceOutcome(facts(), f.impl);
  forgetAccountDevices(USER);
  await accountDeviceOutcome(facts(), f.impl);
  assert.equal(f.gateCalls(), 2);
});

test("exempt (admin / staff) → pass for every device of that user without asking again", async () => {
  const f = fakeFetch({ switchOn: true, gate: "exempt" });
  await accountDeviceOutcome(facts(), f.impl);
  for (const d of ["B".repeat(43), "C".repeat(43), null]) {
    assert.deepEqual(await accountDeviceOutcome(facts({ deviceId: d }), f.impl), { kind: "pass", setDeviceId: null });
  }
  assert.equal(f.gateCalls(), 1);
});

test("disabled from the gate (switched off meanwhile) → pass and the switch is taken as off", async () => {
  const f = fakeFetch({ switchOn: true, gate: "disabled" });
  await accountDeviceOutcome(facts(), f.impl);
  await accountDeviceOutcome(facts({ deviceId: "B".repeat(43) }), f.impl);
  assert.equal(f.gateCalls(), 1);
});

test("what the gate is sent: the user, the SHA-256 of the cookie, the class and a label", async () => {
  const f = fakeFetch({ switchOn: true, gate: "registered" });
  await accountDeviceOutcome(facts({ userAgent: PHONE_UA }), f.impl);
  const call = f.calls.find((c) => c.url.includes("/rpc/account_device_gate"));
  assert.ok(call?.body);
  assert.equal(call.body.p_user, USER);
  assert.equal(call.body.p_device_hash, createHash("sha256").update(COOKIE, "utf8").digest("hex"));
  assert.equal(call.body.p_kind, "mobile");
  assert.equal(call.body.p_label, "جوال — iPhone");
  __resetAccountDeviceGateForTests();
  const g = fakeFetch({ switchOn: true, gate: "registered" });
  await accountDeviceOutcome(facts({ userAgent: PC_UA, chUaMobile: "?0" }), g.impl);
  assert.equal(g.calls.find((c) => c.url.includes("/rpc/account_device_gate"))?.body?.p_kind, "desktop");
});

// ── fail open, with an admin alert ──
for (const [name, gate] of [
  ["an HTTP 500", { http: 500 }],
  ["a network error", "throw"],
  ["a timeout", "timeout"],
  ["an unknown answer", "junk"],
] as const) {
  test(`${name} from the gate: pass (fail open) and one admin alert`, async () => {
    const f = fakeFetch({ switchOn: true, gate });
    assert.deepEqual(await accountDeviceOutcome(facts(), f.impl), { kind: "pass", setDeviceId: null });
    assert.equal(f.alerts(), 1);
    const alert = f.calls.find((c) => c.url.includes("/rpc/library_monitor_notify_admins"));
    assert.equal(alert?.body?.p_href, "/dashboard/admin/security?tab=library_devices");
    assert.doesNotMatch(String(alert?.body?.p_body), /test-service-key|example\.invalid/);
  });
}

test("the alert is throttled: one per 30 minutes per process", async () => {
  mock.timers.enable({ apis: ["Date"], now: 5_000_000 });
  const f = fakeFetch({ switchOn: true, gate: { http: 503 } });
  for (let i = 0; i < 5; i++) assert.equal((await accountDeviceOutcome(facts(), f.impl)).kind, "pass");
  assert.equal(f.alerts(), 1);
  mock.timers.tick(31 * 60 * 1000);
  forgetAccountDeviceSwitch();
  await accountDeviceOutcome(facts(), f.impl);
  assert.equal(f.alerts(), 2);
});

test("the gate function missing (PGRST202): pass, no alert (the migration simply is not run)", async () => {
  const f = fakeFetch({ switchOn: true, gate: { http: 404, code: "PGRST202" } });
  assert.deepEqual(await accountDeviceOutcome(facts(), f.impl), { kind: "pass", setDeviceId: null });
  assert.equal(f.alerts(), 0);
});

test("the switch unreadable with nothing read before: off (fail open) and an alert", async () => {
  const f = fakeFetch({ switchOn: "fail", gate: "refused" });
  assert.deepEqual(await accountDeviceOutcome(facts(), f.impl), { kind: "pass", setDeviceId: null });
  assert.equal(f.gateCalls(), 0);
  assert.equal(f.alerts(), 1);
});

test("the switch unreadable after it was read ON: stays on (the last answer read)", async () => {
  mock.timers.enable({ apis: ["Date"], now: 9_000_000 });
  const on = fakeFetch({ switchOn: true });
  assert.equal(await loadAccountDeviceSwitch(on.impl), true);
  mock.timers.tick(31_000);
  const broken = fakeFetch({ switchOn: "fail", gate: "refused" });
  assert.equal(await loadAccountDeviceSwitch(broken.impl), true);
  assert.deepEqual(await accountDeviceOutcome(facts(), broken.impl), { kind: "refuse" });
});

test("no service key (a misconfigured server): pass, never a lock-out", async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  try {
    const f = fakeFetch({ switchOn: true, gate: "refused" });
    assert.deepEqual(await accountDeviceOutcome(facts(), f.impl), { kind: "pass", setDeviceId: null });
    assert.equal(f.gateCalls(), 0);
  } finally {
    process.env.NEXT_PUBLIC_SUPABASE_URL = url;
  }
});

test("no user id: pass without any read", async () => {
  const f = fakeFetch({ switchOn: true, gate: "refused" });
  assert.deepEqual(await accountDeviceOutcome(facts({ userId: "" }), f.impl), { kind: "pass", setDeviceId: null });
  assert.equal(f.calls.length, 0);
});
