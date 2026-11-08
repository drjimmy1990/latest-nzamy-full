/**
 * device-limit.routes.test.ts — owner answer ٤٢٧: every library route that
 * sends a subscriber the full text calls the device check, with the
 * ENTITLED flag (never a guest, never the free-item whitelist), before it
 * builds the answer; and the pieces around it (logout, settings, admin,
 * readers) are wired. Source contract (regex over the files).
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/app/api/library/device-limit.routes.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, "..", "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), "utf8");

const ROUTES: ReadonlyArray<{ file: string; entitled: RegExp; after: RegExp; before: RegExp }> = [
  {
    file: "app/api/library/laws/[slug]/route.ts",
    entitled: /enforceLibraryDevice\(userId, isSubscriber\)/,
    after: /hasFullLibraryAccess\(userId\)/,
    before: /formatArticleWithPaywall\(a, hasFullAccess/,
  },
  {
    file: "app/api/library/decrees/[id]/route.ts",
    entitled: /enforceLibraryDevice\(userId, isSubscriber\)/,
    after: /hasFullLibraryAccess\(userId\)/,
    before: /const response = \{/,
  },
  {
    file: "app/api/library/precedents/[slug]/route.ts",
    entitled: /enforceLibraryDevice\(userId, hasFullAccess\)/,
    after: /await getLibraryAccessForUser\(userId\)/,
    before: /hasAccess: hasFullAccess/,
  },
  {
    file: "app/api/library/books/[slug]/route.ts",
    entitled: /enforceLibraryDevice\(userId, freeLimit === -1 && !isWhitelisted\)/,
    after: /const probe = await checkLibraryAccess\(userId, slug, 0, "feqh"\)/,
    before: /hasAccess: hasFullAccess/,
  },
  {
    file: "app/api/library/scoped-search/route.ts",
    entitled: /enforceLibraryDevice\(userId, hasFullAccess\)/,
    after: /await getLibraryAccessForUser\(userId\)/,
    before: /const serverOnly = await createServiceClient\(\)/,
  },
];

for (const r of ROUTES) {
  test(`${r.file}: device-checked with the entitled flag, after access is known and before the text`, () => {
    const src = read(r.file);
    assert.match(src, /import \{ enforceLibraryDevice \} from '@\/lib\/library\/deviceLimitServer';/);
    const call = src.search(r.entitled);
    assert.ok(call > 0, "enforceLibraryDevice(userId, <entitled>) is called");
    assert.equal(src.match(/enforceLibraryDevice\(/g)?.length, 1, "called once");
    assert.match(src.slice(call, call + 200), /if \(deviceRefusal\) return deviceRefusal;/);
    const after = src.search(r.after);
    const before = src.search(r.before);
    assert.ok(after > 0 && after < call, "after the entitlement read");
    assert.ok(before > call, "before the answer is built");
  });
}

test("the server half fails open and keys the cookie strictly", () => {
  const src = read("lib/library/deviceLimitServer.ts");
  assert.match(src, /if \(!userId \|\| !entitled\) return null;/);
  // Ruling E: a Bearer caller with no device cookie is NOT waved through — it
  // goes to cookielessGateDecision (403 device_cookie_required while the limit
  // is on), and is never handed a minted cookie.
  const bearer = src.indexOf('if (isBearerWithoutDeviceCookie(hdrs.get("authorization"), id)) {');
  assert.ok(bearer > 0, "the Bearer branch exists");
  const branch = src.slice(bearer, src.indexOf("}", bearer));
  assert.match(branch, /return finish\(userId, null, cookielessGateDecision\(await readCookielessState\(userId\)\)\);/);
  assert.ok(bearer < src.indexOf("newDeviceId("), "decided before any id is minted");
  assert.doesNotMatch(src, /isBearerWithoutDeviceCookie\([^)]*\)\) return null;/);
  assert.match(src, /abortSignal\(AbortSignal\.timeout\(RPC_TIMEOUT_MS\)\)/);
  assert.match(src, /noteMissing\(error\.code\)/);
  assert.match(src, /"Cache-Control": "private, no-store"/);
  // never decides from the request body or a client-sent user id
  assert.doesNotMatch(src, /request\.json\(/);
});

test("logout releases the device before signOut, without waiting on it", () => {
  const src = read("hooks/useUser.ts");
  assert.match(src, /releaseLibraryDevice\(\)\.finally\(\(\) => \{\s*supabase\.auth\.signOut\(\)/);
  assert.match(src, /\/api\/v1\/library\/devices\/sign-out/);
  assert.match(src, /AbortSignal\.timeout\(1500\)/);
});

test("the user's routes take the user from the session; the admin's are staff-gated and audited", () => {
  for (const f of [
    "app/api/v1/library/devices/route.ts",
    "app/api/v1/library/devices/[id]/revoke/route.ts",
    "app/api/v1/library/devices/sign-out/route.ts",
  ]) {
    const src = read(f);
    assert.match(src, /supabase\.auth\.getUser\(\)/, f);
    assert.doesNotMatch(src, /request\.json\(/, f);
  }
  const admin = read("app/api/v1/admin/users/[id]/library-devices/route.ts");
  assert.match(admin, /requireStaff\("library\.lock_lift"\)/);
  assert.match(admin, /requireStaff\("read"\)/);
  assert.match(admin, /logAdminAction\(/);
  assert.match(admin, /"admin_reset"/);
  const settings = read("app/api/v1/admin/library-monitor/devices/route.ts");
  assert.match(settings, /requireStaff\("settings\.write"\)/);
  assert.match(settings, /logAdminAction\(/);
  // The «نشاط المكتبة» settings route keeps its fixed column list (no 500 before the migration).
  assert.doesNotMatch(read("lib/library/monitorSettings.ts"), /device_limit/);
});

test("every reader shows the device refusal", () => {
  assert.match(read("app/laws/[slug]/page.tsx"), /readerRefusal\.kind === "device"[\s\S]{0,80}<LibraryDeviceLimitNotice refusal=\{readerRefusal\}/);
  assert.match(read("app/laws/[slug]/page.tsx"), /res\.status === 423 \|\| res\.status === 429 \|\| res\.status === 403/);
  for (const f of ["app/book/[slug]/page.tsx", "app/precedents/[slug]/page.tsx", "app/laws/orders/[slug]/page.tsx"]) {
    const src = read(f);
    assert.match(src, /readerRefusalFrom\(403,/, f);
    assert.match(src, /if \(deviceRefusal\) return <LibraryDeviceLimitPage refusal=\{deviceRefusal\} \/>;/, f);
  }
});

test("«أجهزتي» in settings, the admin tab and the user-page card are mounted", () => {
  assert.match(read("app/settings/components/tabs/SecurityTab.tsx"), /<LibraryDevicesPanel \/>/);
  assert.match(read("app/dashboard/admin/security/page.tsx"), /tab==="library_devices" && <LibraryDevicesPanel/);
  assert.match(read("app/dashboard/admin/users/[id]/page.tsx"), /<UserLibraryDevicesCard userId=\{U\.id\}/);
});

test("the migration ships the limit OFF at 2, service-role-only functions, a per-user advisory lock", () => {
  const sql = fs.readFileSync(path.resolve(SRC, "..", "supabase", "migrations", "20261108_20_library_device_limit.sql"), "utf8");
  assert.match(sql, /device_limit_enabled boolean not null default false/);
  assert.match(sql, /device_limit int not null default 2/);
  assert.match(sql, /pg_advisory_xact_lock\(hashtextextended\('library_device:' \|\| p_user::text, 0\)\)/);
  assert.match(sql, /revoke all on function public\.library_device_check\(uuid, text, text\) from public, anon, authenticated;/);
  assert.match(sql, /grant execute on function public\.library_device_check\(uuid, text, text\) to service_role;/);
  assert.match(sql, /set search_path = ''/);
});
