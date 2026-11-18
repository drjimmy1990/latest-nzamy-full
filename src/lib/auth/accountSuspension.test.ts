/**
 * accountSuspension.test.ts — TODO 3.5 (owner package 17 Nov, ticket S7): a
 * real admin suspension. The pure decision and the server writes (with a fake
 * service client) are exercised; the gates are read as source, because
 * proxy.ts, assertRole.ts, apiAuth.ts and the route import next/server.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/auth/accountSuspension.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ACCOUNT_SUSPENSION_KEY,
  ACCOUNT_SUSPENDED_PATH,
  SUSPENSION_BAN_DURATION,
  LIFT_BAN_DURATION,
  isBanActive,
  isSuspendedUser,
  suspendedAppMetadata,
  activeSuspensionAppMetadata,
} from "./accountSuspension.ts";
import { suspendAccountWith, liftSuspensionWith, readSuspendedIds } from "../accountSuspension/suspensionServer.ts";
import { translateAuthError } from "./translateAuthError.ts";
import { usersPatchActions } from "./staffDecision.ts";

const NOW = Date.parse("2026-11-17T20:00:00Z");

// ── The decision ────────────────────────────────────────────────────────────

test("isSuspendedUser: a running GoTrue ban, or the app's copy saying so", () => {
  assert.equal(isSuspendedUser({ banned_until: "2126-11-17T20:00:00Z" }, NOW), true);
  assert.equal(isSuspendedUser({ app_metadata: { [ACCOUNT_SUSPENSION_KEY]: { status: "suspended" } } }, NOW), true);
});

test("isSuspendedUser: everything else is NOT suspended", () => {
  for (const user of [
    null,
    undefined,
    "x",
    {},
    { banned_until: null },
    { banned_until: "" },
    { banned_until: "not a date" },
    { banned_until: "2026-11-17T19:59:59Z" }, // a ban that has ended
    { app_metadata: { [ACCOUNT_SUSPENSION_KEY]: { status: "active" } } },
    { app_metadata: { [ACCOUNT_SUSPENSION_KEY]: "suspended" } },
    { app_metadata: { other: { status: "suspended" } } },
  ]) {
    assert.equal(isSuspendedUser(user, NOW), false, JSON.stringify(user));
  }
});

test("isSuspendedUser never reads user_metadata (the user can write it)", () => {
  assert.equal(isSuspendedUser({ user_metadata: { [ACCOUNT_SUSPENSION_KEY]: { status: "suspended" } } }, NOW), false);
  // …and a user cannot lift his own suspension through it either
  assert.equal(
    isSuspendedUser({
      banned_until: "2126-01-01T00:00:00Z",
      user_metadata: { [ACCOUNT_SUSPENSION_KEY]: { status: "active" } },
    }, NOW),
    true,
  );
  const src = readFileSync(new URL("./accountSuspension.ts", import.meta.url), "utf8");
  assert.equal(/\.user_metadata|\["user_metadata"\]/.test(src), false);
});

test("isBanActive: a parseable time after now", () => {
  assert.equal(isBanActive("2026-11-17T20:00:01Z", NOW), true);
  assert.equal(isBanActive("2026-11-17T20:00:00Z", NOW), false);
  assert.equal(isBanActive(12345, NOW), false);
});

test("the app_metadata writes keep every other key", () => {
  const existing = { provider: "email", providers: ["email"], account_deletion: { status: "active" } };
  const s = suspendedAppMetadata(existing, "admin-1", "2026-11-17T20:00:00Z");
  assert.deepEqual(s, { ...existing, account_suspension: { status: "suspended", at: "2026-11-17T20:00:00Z", by: "admin-1" } });
  assert.equal(isSuspendedUser({ app_metadata: s }, NOW), true);
  const a = activeSuspensionAppMetadata(s, "admin-2", "2026-11-18T08:00:00Z");
  assert.deepEqual(a, { ...existing, account_suspension: { status: "active", at: "2026-11-18T08:00:00Z", by: "admin-2" } });
  assert.equal(isSuspendedUser({ app_metadata: a }, NOW), false);
  assert.deepEqual(suspendedAppMetadata(null, "a", "t"), { account_suspension: { status: "suspended", at: "t", by: "a" } });
});

// ── The server writes, with a fake service client ───────────────────────────

type Call = { kind: string; args: unknown[] };
function fakeAdmin(opts: {
  user?: Record<string, unknown> | null;
  getError?: { message: string; status?: number } | null;
  updateError?: { message: string } | null;
  rpc?: Record<string, { data?: unknown; error?: { code?: string; message?: string } | null } | (() => never)>;
}) {
  const calls: Call[] = [];
  const admin = {
    auth: {
      admin: {
        getUserById: async (id: string) => {
          calls.push({ kind: "getUserById", args: [id] });
          if (opts.getError) return { data: { user: null }, error: opts.getError };
          return { data: { user: opts.user === undefined ? { id, app_metadata: { provider: "email" } } : opts.user }, error: null };
        },
        updateUserById: async (id: string, attrs: unknown) => {
          calls.push({ kind: "updateUserById", args: [id, attrs] });
          return { data: { user: { id } }, error: opts.updateError ?? null };
        },
      },
    },
    rpc: async (fn: string, params: unknown) => {
      calls.push({ kind: "rpc", args: [fn, params] });
      const r = opts.rpc?.[fn];
      if (typeof r === "function") r();
      return { data: r && typeof r !== "function" ? r.data ?? null : null, error: r && typeof r !== "function" ? r.error ?? null : null };
    },
  };
  // The fake implements only what the module calls.
  return { admin: admin as unknown as Parameters<typeof suspendAccountWith>[0], calls };
}

const ARGS = { userId: "u-1", actorId: "admin-1", nowIso: "2026-11-17T20:00:00Z" };

test("suspend: ONE GoTrue update carries the ban and the gates' copy, then the sessions end", async () => {
  const { admin, calls } = fakeAdmin({ rpc: { admin_revoke_user_sessions: { data: 2 } } });
  const r = await suspendAccountWith(admin, ARGS);
  assert.deepEqual(r, { ok: true, sessions: { state: "ended", count: 2 } });
  assert.deepEqual(calls.map((c) => c.kind), ["getUserById", "updateUserById", "rpc"]);
  assert.deepEqual(calls[1].args, ["u-1", {
    ban_duration: SUSPENSION_BAN_DURATION,
    app_metadata: { provider: "email", account_suspension: { status: "suspended", at: ARGS.nowIso, by: "admin-1" } },
  }]);
  assert.deepEqual(calls[2].args, ["admin_revoke_user_sessions", { p_user: "u-1" }]);
  assert.equal(SUSPENSION_BAN_DURATION, "876000h");
});

test("suspend: a failed ban is a failed suspension, and nothing else runs", async () => {
  const { admin, calls } = fakeAdmin({ updateError: { message: "boom" } });
  const r = await suspendAccountWith(admin, ARGS);
  assert.deepEqual(r, { ok: false, status: 500, error: "boom" });
  assert.equal(calls.some((c) => c.kind === "rpc"), false);
});

test("suspend: an unknown account is a 404", async () => {
  const { admin } = fakeAdmin({ getError: { message: "User not found", status: 404 } });
  const r = await suspendAccountWith(admin, ARGS);
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.status, 404);
});

test("suspend: before 20261124_60 runs the account is still suspended; the outcome says the sessions were not ended", async () => {
  const missing = fakeAdmin({ rpc: { admin_revoke_user_sessions: { error: { code: "PGRST202", message: "not found" } } } });
  assert.deepEqual(await suspendAccountWith(missing.admin, ARGS), { ok: true, sessions: { state: "migration_missing" } });
  const failed = fakeAdmin({ rpc: { admin_revoke_user_sessions: { error: { code: "57014", message: "timeout" } } } });
  assert.deepEqual(await suspendAccountWith(failed.admin, ARGS), { ok: true, sessions: { state: "failed", error: "57014" } });
  const threw = fakeAdmin({ rpc: { admin_revoke_user_sessions: () => { throw new Error("network"); } } });
  assert.deepEqual(await suspendAccountWith(threw.admin, ARGS), { ok: true, sessions: { state: "failed", error: "network" } });
});

test("lift: ban_duration none and the copy marked active, keeping other keys", async () => {
  const { admin, calls } = fakeAdmin({
    user: { id: "u-1", app_metadata: { provider: "email", account_suspension: { status: "suspended" } } },
  });
  assert.deepEqual(await liftSuspensionWith(admin, ARGS), { ok: true });
  assert.deepEqual(calls[1].args, ["u-1", {
    ban_duration: LIFT_BAN_DURATION,
    app_metadata: { provider: "email", account_suspension: { status: "active", at: ARGS.nowIso, by: "admin-1" } },
  }]);
  const bad = fakeAdmin({ updateError: { message: "nope" } });
  assert.deepEqual(await liftSuspensionWith(bad.admin, ARGS), { ok: false, status: 500, error: "nope" });
});

test("readSuspendedIds: the banned subset; null (unknown) when the function is missing or fails", async () => {
  const ok = fakeAdmin({ rpc: { admin_suspended_user_ids: { data: ["b"] } } });
  assert.deepEqual([...((await readSuspendedIds(ok.admin, ["a", "b", "b", ""])) ?? [])], ["b"]);
  assert.deepEqual(ok.calls[0].args, ["admin_suspended_user_ids", { p_ids: ["a", "b"] }]);
  const missing = fakeAdmin({ rpc: { admin_suspended_user_ids: { error: { code: "42883" } } } });
  assert.equal(await readSuspendedIds(missing.admin, ["a"]), null);
  const none = fakeAdmin({});
  assert.deepEqual([...((await readSuspendedIds(none.admin, [])) ?? ["x"])], []);
  assert.equal(none.calls.length, 0, "no read for an empty page");
});

// ── Sign-in and the staff action ─────────────────────────────────────────────

test("sign-in: GoTrue's user_banned is said plainly, in Arabic", () => {
  const msg = translateAuthError({ code: "user_banned", status: 403, message: "User is banned" }, { context: "login", isAr: true });
  assert.match(msg, /تم إيقاف هذا الحساب بقرار من الإدارة/);
  assert.match(translateAuthError({ status: 400, message: "User is banned" }, { context: "login", isAr: true }), /إيقاف/);
  // CAP-06 is otherwise intact
  assert.equal(translateAuthError({ code: "user_not_found", status: 400 }, { context: "login", isAr: true }), "بيانات الدخول غير صحيحة");
});

test("lifting a suspension needs the same staff action as suspending", () => {
  assert.deepEqual(usersPatchActions({ status: "suspended" }), ["users.suspend"]);
  assert.deepEqual(usersPatchActions({ status: "active" }), ["users.suspend"]);
});

// ── The gates, read as source ────────────────────────────────────────────────

const SRC = join(import.meta.dirname, "..", "..");
const read = (rel: string) => readFileSync(join(SRC, ...rel.split("/")), "utf8").replace(/\r\n/g, "\n");
const code = (s: string) =>
  s.split("\n").filter((l) => !/^\s*(\*|\/\*|\/\/)/.test(l)).join("\n");

test("proxy API branch: a suspended account is a 403 after the freeze check, before the pass-through", () => {
  const proxy = code(read("proxy.ts"));
  const frozenAt = proxy.indexOf('return NextResponse.json({ error: ACCOUNT_FROZEN_AR, code: "account_frozen" }, { status: 403 });');
  const suspAt = proxy.indexOf("if (isSuspendedUser(user)) {", frozenAt);
  const passAt = proxy.indexOf("return apiResponse;");
  assert.ok(frozenAt > -1 && suspAt > frozenAt && suspAt < passAt);
  assert.ok(proxy.slice(suspAt, passAt).includes("status: 403"));
});

test("proxy page branch: a suspended session goes to /account-suspended before any early return", () => {
  const proxy = code(read("proxy.ts"));
  const pageStart = proxy.indexOf("let supabaseResponse = nextWithPathname();");
  const frozenAt = proxy.indexOf("return frozenRedirect;", pageStart);
  const suspAt = proxy.indexOf("if (isSuspendedUser(user)) {", pageStart);
  const earlyAt = proxy.indexOf("if (!rbacRule && !onboardingGateApplies) return supabaseResponse;", pageStart);
  assert.ok(frozenAt > -1 && suspAt > frozenAt && suspAt < earlyAt);
  const block = proxy.slice(suspAt, earlyAt);
  assert.ok(block.includes("suspendedUrl.pathname = ACCOUNT_SUSPENDED_PATH;"));
  assert.ok(block.includes("supabaseResponse.cookies.getAll().forEach((cookie) => suspendedRedirect.cookies.set(cookie))"));
  assert.equal(proxy.includes("user_metadata"), false);
  assert.equal(proxy.includes("createServiceClient"), false);
});

test("/account-suspended is not PROTECTED (no redirect loop) and exists", () => {
  const proxy = read("proxy.ts");
  const list = /const PROTECTED = \[([\s\S]*?)\];/.exec(proxy);
  assert.ok(list);
  const prefixes = [...list[1].replace(/\/\/.*$/gm, "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.equal(prefixes.some((p) => ACCOUNT_SUSPENDED_PATH.startsWith(p)), false);
  const page = read("app/account-suspended/page.tsx");
  assert.ok(page.includes("ACCOUNT_SUSPENDED_AR"));
});

test("assertRole refuses a suspended account before its profiles read", () => {
  const src = code(read("lib/auth/assertRole.ts"));
  const suspAt = src.indexOf("if (isSuspendedUser(user)) {");
  const profileAt = src.indexOf(".from('profiles')");
  assert.ok(suspAt > -1 && suspAt < profileAt);
  assert.ok(src.slice(suspAt, profileAt).includes("status: 403"));
});

test("requireApiUser refuses a suspended account even with allowFrozen; frozenAccountResponse does too", () => {
  const src = code(read("lib/auth/apiAuth.ts"));
  const req = src.slice(src.indexOf("export async function requireApiUser("), src.indexOf("export function frozenAccountResponse("));
  const suspAt = req.indexOf("const suspended = suspendedAccountResponse(user);");
  const allowAt = req.indexOf("if (!options.allowFrozen)");
  assert.ok(suspAt > -1 && suspAt < allowAt, "before (outside) the allowFrozen branch");
  const frozen = src.slice(src.indexOf("export function frozenAccountResponse("), src.indexOf("export function suspendedAccountResponse("));
  assert.ok(frozen.indexOf("suspendedAccountResponse(user)") < frozen.indexOf("freezeStateFromUser(user)"));
  const resp = src.slice(src.indexOf("export function suspendedAccountResponse("));
  assert.ok(resp.includes("if (!isSuspendedUser(user)) return null;") && resp.includes("status: 403"));
});

test("users PATCH: refuses the caller's own account and an admin account before any write; the ban precedes the freeze (owner ٢٥)", () => {
  const route = code(read("app/api/v1/admin/users/[id]/route.ts"));
  const patch = route.slice(route.indexOf("export async function PATCH("), route.indexOf("export async function DELETE("));
  const writeAt = patch.indexOf(".update(updateData)");
  const selfAt = patch.indexOf("userId.toLowerCase() === actorId.toLowerCase()");
  const adminAt = patch.indexOf('"لا يمكن إيقاف حساب مشرف — أزل صلاحية الإشراف أولاً"');
  assert.ok(selfAt > -1 && selfAt < writeAt);
  assert.ok(adminAt > -1 && adminAt < writeAt);
  const banAt = patch.indexOf("await suspendAccountWith(adminClient,");
  const freezeAt = patch.indexOf("await freezeEntitlementsWith(adminClient,");
  assert.ok(banAt > -1 && banAt < freezeAt, "the access stops first, then the freeze");
  assert.equal(patch.includes('.from("subscriptions")'), false, "owner ٢٥: a suspension cancels no subscription");
  assert.equal(patch.includes('tier: "free"'), false, "owner ٢٥: the auth tier is not reset");
  const liftAt = patch.indexOf("await liftSuspensionWith(adminClient,");
  const thawAt = patch.indexOf("await thawEntitlementsWith(adminClient,");
  assert.ok(liftAt > -1 && liftAt < thawAt, "the ban is lifted, then the suspended days come back");
  assert.ok(patch.includes('"user_unsuspended"'));
});
