/**
 * accountFreezeGates.test.ts — where D6's freeze is enforced, read as source
 * (proxy.ts, assertRole.ts and the routes import next/server and Supabase, so
 * `node --test` cannot run them; the technique of proxy.membership.test.ts).
 *
 *   1. proxy.ts — page branch: right after the `!user` login redirect and
 *      BEFORE the `!rbacRule && !onboardingGateApplies` early return, a frozen
 *      account is redirected to /account-frozen with the refreshed cookies;
 *      API branch: right after the 401, a 403. No new client, no query.
 *   2. assertRole — after its `!user` 401, before its profiles read.
 *   3. /account-frozen is not a PROTECTED prefix (no redirect loop), and the
 *      self-service routes stay outside assertRole and the gated API prefixes.
 *   4. The cron fails closed on CRON_SECRET; the self routes act on the
 *      caller's own session; the purge order is deleteUser, then Storage.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/auth/accountFreezeGates.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ACCOUNT_FROZEN_PATH } from "./accountFreeze.ts";
import { isProtectedApiPath } from "./routeAccess.ts";

const SRC = join(import.meta.dirname, "..", "..");
const read = (rel: string) => readFileSync(join(SRC, ...rel.split("/")), "utf8").replace(/\r\n/g, "\n");

/** Source without comment lines, so prose naming a call neither satisfies nor breaks a pin. */
function codeOnly(source: string): string {
  return source
    .split("\n")
    .filter((line) => {
      const t = line.trimStart();
      return !t.startsWith("*") && !t.startsWith("/*") && !t.startsWith("//");
    })
    .join("\n");
}

const proxy = codeOnly(read("proxy.ts"));
const assertRole = codeOnly(read("lib/auth/assertRole.ts"));

test("proxy: the freeze is read from the user getUser() returned — no client, no query, no user_metadata", () => {
  assert.ok(proxy.includes('from "@/lib/auth/accountFreeze"'), "imports the pure module");
  assert.equal((proxy.match(/freezeStateFromUser\(user\)/g) ?? []).length, 2, "both branches, on the user object");
  assert.equal(proxy.includes("createServiceClient"), false, "the proxy never acquires a service client");
  assert.equal(proxy.includes("account_deletion_requests"), false, "no table read for the freeze");
  assert.equal(proxy.includes("user_metadata"), false, "user_metadata is the user's to write — never a gate");
});

test("proxy page branch: after the login redirect, before every early return; cookies carried", () => {
  const pageStart = proxy.indexOf("let supabaseResponse = nextWithPathname();");
  assert.ok(pageStart > -1);
  const loginAt = proxy.indexOf('loginUrl.pathname = "/login";', pageStart);
  const freezeAt = proxy.indexOf("freezeStateFromUser(user).frozen", pageStart);
  const earlyAt = proxy.indexOf("if (!rbacRule && !onboardingGateApplies) return supabaseResponse;", pageStart);
  const profileAt = proxy.indexOf('.from("profiles")', pageStart);
  assert.ok(loginAt > -1 && freezeAt > loginAt, "after the anonymous redirect");
  assert.ok(freezeAt < earlyAt && freezeAt < profileAt, "before the early return and the profiles read");
  const block = proxy.slice(freezeAt, earlyAt);
  assert.ok(block.includes("frozenUrl.pathname = ACCOUNT_FROZEN_PATH;"), "redirects to the frozen page");
  assert.ok(block.includes("supabaseResponse.cookies.getAll().forEach((cookie) => frozenRedirect.cookies.set(cookie))"), "with the refreshed cookies");
  assert.ok(block.includes("return frozenRedirect;"));
});

test("proxy API branch: a frozen account is a 403 right after the 401", () => {
  const unauthAt = proxy.indexOf('if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });');
  const freezeAt = proxy.indexOf("freezeStateFromUser(user).frozen");
  const apiReturnAt = proxy.indexOf("return apiResponse;");
  assert.ok(unauthAt > -1 && freezeAt > unauthAt && freezeAt < apiReturnAt);
  assert.ok(proxy.slice(freezeAt, apiReturnAt).includes("status: 403"));
});

test("/account-frozen is not protected and not a gated API path — no redirect loop", () => {
  const protectedList = proxy.slice(proxy.indexOf("const PROTECTED = ["), proxy.indexOf("];", proxy.indexOf("const PROTECTED = [")));
  assert.equal(protectedList.includes(ACCOUNT_FROZEN_PATH), false);
  for (const p of protectedList.match(/"([^"]+)"/g) ?? []) {
    assert.equal(ACCOUNT_FROZEN_PATH.startsWith(p.slice(1, -1)), false, `${p} would cover the frozen page`);
  }
  assert.equal(isProtectedApiPath("/api/v1/me/account-deletion"), false);
  assert.equal(isProtectedApiPath("/api/v1/me/account-deletion/cancel"), false);
});

test("assertRole: frozen → 403 after the 401 and before the profiles read", () => {
  const unauthAt = assertRole.indexOf("{ status: 401 }");
  const freezeAt = assertRole.indexOf("freezeStateFromUser(user).frozen");
  const profileAt = assertRole.indexOf(".from('profiles')");
  assert.ok(unauthAt > -1 && freezeAt > unauthAt && freezeAt < profileAt);
  assert.ok(assertRole.slice(freezeAt, profileAt).includes("status: 403"));
});

test("self-service routes: own session only, outside assertRole, metadata written after the row", () => {
  const route = codeOnly(read("app/api/v1/me/account-deletion/route.ts"));
  const cancel = codeOnly(read("app/api/v1/me/account-deletion/cancel/route.ts"));
  for (const code of [route, cancel]) {
    assert.equal(code.includes("assertRole("), false, "a frozen account must still reach these routes");
    assert.equal(/p_user/.test(code), false, "the self routes pass no user id to the database");
  }
  const rpcAt = route.indexOf('supabase.rpc("request_account_deletion"');
  const syncAt = route.indexOf("syncFreezeMetadata(service, user.id, { frozen: true");
  const undoAt = route.indexOf('await supabase.rpc("cancel_account_deletion")');
  assert.ok(rpcAt > -1 && syncAt > rpcAt && undoAt > syncAt, "row, then metadata, and a failed metadata write cancels the row");
  assert.ok(route.indexOf("phraseMatches(body?.confirm, DELETE_CONFIRM_PHRASE_AR)") < rpcAt, "the typed phrase comes first");
  assert.ok(cancel.indexOf('supabase.rpc("cancel_account_deletion")') < cancel.indexOf("frozen: false"), "cancel, then lift");
});

test("an admin freeze: /cancel answers 409 with the support copy, the frozen page offers no restore", () => {
  const cancel = codeOnly(read("app/api/v1/me/account-deletion/cancel/route.ts"));
  const adminAt = cancel.indexOf("isAdminFreeze(still.request.requested_by)");
  const liftAt = cancel.indexOf("frozen: false");
  assert.ok(adminAt > -1 && adminAt < liftAt, "an admin freeze is answered before the copy is lifted");
  assert.ok(cancel.slice(adminAt, adminAt + 200).includes("ADMIN_FREEZE_AR") && cancel.slice(adminAt, adminAt + 200).includes("status: 409"));
  const page = codeOnly(read("app/account-frozen/page.tsx"));
  assert.ok(page.includes("isAdminFreeze(body.data.request.requestedBy)"), "the page reads who froze the account");
  assert.ok(page.includes('state.status !== "purging" && !state.byAdmin && ('), "no restore button on an admin freeze");
  assert.ok(page.includes("{ADMIN_FREEZE_AR}"), "it says the administration froze it");
});

test("cron: fails closed on CRON_SECRET, and the purge deletes the account before its files", () => {
  const cron = codeOnly(read("app/api/v1/cron/account-purge/route.ts"));
  const authAt = cron.indexOf('cronSecretMatches(request.headers.get("x-cron-secret"), process.env.CRON_SECRET)');
  const clientAt = cron.indexOf("createServiceClient()");
  assert.ok(authAt > -1 && authAt < clientAt, "the secret is checked before any client exists");
  assert.ok(cron.slice(authAt, clientAt).includes("status: 401"));
  assert.ok(cron.includes('skipped: "schema_missing"'), "before 20261026_70 the job is a no-op, not a 500");

  const lib = codeOnly(read("lib/accountDeletion/accountDeletionServer.ts"));
  const prepareAt = lib.indexOf('rpc("account_purge_prepare"');
  const deleteAt = lib.indexOf("auth.admin.deleteUser(");
  const listAt = lib.indexOf('rpc("account_purge_storage_paths"');
  const removeAt = lib.indexOf(".storage.from(STORAGE_BUCKET).remove(");
  assert.ok(prepareAt > -1 && prepareAt < deleteAt && deleteAt < listAt && listAt < removeAt,
    "prepare (a dry run) → deleteUser → the file list → Storage");
  assert.equal(/storage_paths/.test(lib.slice(prepareAt, deleteAt)), false, "prepare decides no file");
  // The documents folder is never listed to delete it — a firm file 70 moved
  // to the owner stays in the member's folder; only the database's
  // after-delete list (what no surviving row references) decides. The one
  // listing is the branding bucket's u/<id>/ folder (final review, item 3):
  // it holds only that lawyer's own vault logos, whose row cascades with him
  // (63's CHECK ties a vault's logo_path to its owner's folder); f/<firm>/ is never listed.
  const lists = [...lib.matchAll(/\.list\(/g)];
  assert.equal(lists.length, 1, "one listing only");
  assert.equal(/storage\.from\(STORAGE_BUCKET\)\.list\(/.test(lib), false, "the documents bucket is never listed");
  assert.ok(lib.includes("const folder = `u/${userId.toLowerCase()}`;"), "the listing is the lawyer's own branding folder");
  assert.ok(lib.includes("admin.storage.from(BRANDING_BUCKET)"), "on the branding bucket");
  assert.ok(lib.indexOf("removeLawyerBrandingWith(admin, args.userId)") > deleteAt, "and only after the account is deleted");
  // a prepare error the database answered is blocked, never re-claimed daily
  const prepErr = lib.slice(lib.indexOf("if (prep.error) {"), lib.indexOf("const prepared ="));
  assert.ok(prepErr.includes('prep.error.code ? "blocked" : "retry"'), "a coded prepare error is terminal");
});
