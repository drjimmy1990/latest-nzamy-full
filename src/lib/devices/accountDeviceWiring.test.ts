/**
 * accountDeviceWiring.test.ts — batch l19, owner ٢٣٣ (LIVE-17): where the
 * whole-account device limit is wired, and the holes it must not leave.
 * Source contract (regex over the files) plus the readers' refusal parser.
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/devices/accountDeviceWiring.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { readerRefusalFrom, deviceRefusalOf } from "../library/readerRefusal.ts";
import { ACCOUNT_DEVICE_LIMIT_AR } from "./accountDevice.ts";

const SRC = path.resolve(import.meta.dirname, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), "utf8").replace(/\r\n/g, "\n");

test("proxy: ONE isolated hook in the page branch, after the phone gate and before the profiles read", () => {
  const src = read("proxy.ts");
  assert.equal(src.match(/accountDevicePageGate\(/g)?.length, 1, "called once");
  assert.match(src, /import \{ accountDevicePageGate \} from "@\/lib\/devices\/accountDeviceProxy";/);
  const call = src.indexOf("const deviceRefused = await accountDevicePageGate(req, user, supabaseResponse);");
  assert.ok(call > 0);
  assert.match(src.slice(call, call + 160), /if \(deviceRefused\) return deviceRefused;/);
  const phone = src.indexOf("if ((await phoneGateVerdict(user)) === \"held\") {", src.indexOf("const nextWithPathname"));
  const profiles = src.indexOf('.select("user_type, phone, onboarding_completed")');
  assert.ok(phone > 0 && phone < call, "after the WhatsApp phone gate");
  assert.ok(profiles > call, "before the shared profiles read (and every early return after it)");
  // The page branch only: not in the API branch 1b.
  const apiBranch = src.slice(src.indexOf("if (isSupabaseMode && isProtectedApiPath(pathname)) {"), src.indexOf('if (pathname === "/ai/orders") {'));
  assert.doesNotMatch(apiBranch, /accountDevice/);
});

test("/device-limit is public (not PROTECTED: no loop), private to search engines, and exists", () => {
  const proxy = read("proxy.ts");
  const list = proxy.slice(proxy.indexOf("const PROTECTED = ["), proxy.indexOf("];", proxy.indexOf("const PROTECTED = [")));
  assert.doesNotMatch(list, /"\/device/);
  assert.ok(!list.split("\n").some((l) => /"\/d"|"\/de"/.test(l)));
  const page = read("app/device-limit/page.tsx");
  assert.match(page, /\{ACCOUNT_DEVICE_LIMIT_AR\}/);
  assert.match(page, /href="\/contact"/);
  // Signing out here ends THIS session only, never the two registered devices'.
  assert.match(page, /signOut\(\{ scope: "local" \}\)/);
  assert.doesNotMatch(page, /LibraryDeviceList|\/revoke/);
  assert.match(read("app/device-limit/layout.tsx"), /robots: PRIVATE_ROBOTS/);
  assert.match(read("lib/publicSeo/privatePages.ts"), /"\/device-limit"/);
});

test("the proxy hook: refuses with a redirect that carries the refreshed cookies; mints on the pass-through", () => {
  const src = read("lib/devices/accountDeviceProxy.ts");
  assert.match(src, /url\.pathname = ACCOUNT_DEVICE_LIMIT_PATH;/);
  assert.match(src, /response\.cookies\.getAll\(\)\.forEach\(\(cookie\) => refused\.cookies\.set\(cookie\)\);/);
  assert.match(src, /response\.cookies\.set\(\s*ACCOUNT_DEVICE_COOKIE,\s*outcome\.setDeviceId,/);
  assert.match(src, /\} catch \{\s*return null;\s*\}/, "an error is never a refusal");
});

test("the library routes use the account gate, never check or hand a cookie to a Bearer caller", () => {
  const src = read("lib/library/deviceLimitServer.ts");
  assert.match(src, /if \(!userId \|\| !entitled\) return null;/);
  assert.match(src, /await accountDeviceOutcome\(\{/);
  assert.match(src, /if \(bearerOnly\) return null;/);
  assert.match(src, /if \(outcome\.setDeviceId\) \{/);
  assert.match(src, /NextResponse\.json\(accountDeviceRefusalBody\(\), \{\s*status: 403,\s*headers: \{ "Cache-Control": "private, no-store" \},/);
  // The library-only gate and its e-mail code are retired from the read path.
  assert.doesNotMatch(src, /rpc\("library_device_gate"|rpc\("library_device_check"|p_code_required/);
  assert.doesNotMatch(src.replace(/\/\*[\s\S]*?\*\//g, ""), /(?<!account_)device_limit_enabled/);
  assert.doesNotMatch(src, /request\.json\(/);
});

test("while the account limit is on, signing out frees no place and a user cannot remove his own devices", () => {
  const signOut = read("app/api/v1/library/devices/sign-out/route.ts");
  const on = signOut.indexOf("if (await accountDeviceLimitOn()) return NextResponse.json({ released: 0 }, { headers: NO_STORE });");
  assert.ok(on > 0);
  assert.ok(on < signOut.indexOf("revokeLibraryDevice(user.id"), "decided before any revoke");
  const revoke = read("app/api/v1/library/devices/[id]/revoke/route.ts");
  const gate = revoke.indexOf("if (await accountDeviceLimitOn()) {");
  assert.ok(gate > 0);
  assert.match(revoke.slice(gate, gate + 260), /ACCOUNT_DEVICE_SWITCH_AR, code: "device_switch_admin_only"[\s\S]*status: 403/);
  assert.ok(gate < revoke.indexOf("revokeLibraryDevice(user.id"), "decided before any revoke");
  // The lists the user sees are read-only then.
  assert.match(read("app/settings/components/tabs/LibraryDevicesPanel.tsx"), /readOnly=\{data\.enabled\}/);
  assert.match(read("app/laws/my/_DevicesBlock.tsx"), /readOnly=\{data\.enabled\}/);
  assert.match(read("components/library/LibraryDeviceList.tsx"), /\{!readOnly && \(/);
});

test("the admin reset is the same library_device_revoke admin_reset, staff-gated and audited", () => {
  const admin = read("app/api/v1/admin/users/[id]/library-devices/route.ts");
  assert.match(admin, /requireStaff\("library\.lock_lift"\)/);
  assert.match(admin, /"admin_reset"/);
  assert.match(admin, /logAdminAction\(/);
  const settings = read("app/api/v1/admin/library-monitor/devices/route.ts");
  assert.match(settings, /requireStaff\("settings\.write"\)/);
  assert.match(settings, /\.update\(\{ account_device_limit_enabled: patch\.enabled,/);
  assert.doesNotMatch(settings, /(?<!account_)device_limit_enabled: |device_limit:/, "the old library switch is never written");
  assert.match(settings, /logAdminAction\(/);
});

test("readers: account_device_limit → the contact card (no list, no removal)", () => {
  const body = { error: ACCOUNT_DEVICE_LIMIT_AR, code: "account_device_limit" };
  const r = readerRefusalFrom(403, body, 0);
  assert.deepEqual(r, { kind: "device", messageAr: ACCOUNT_DEVICE_LIMIT_AR, limit: 2, devices: [], mode: "account" });
  assert.deepEqual(deviceRefusalOf(403, body), r);
  const fallback = readerRefusalFrom(403, { code: "account_device_limit" }, 0);
  assert.ok(fallback?.kind === "device" && fallback.messageAr.includes("جوال واحد وحاسوب واحد"));
  const notice = read("components/library/LibraryDeviceLimitNotice.tsx");
  assert.match(notice, /if \(refusal\.mode === "account"\) return <AccountDeviceLimitCard messageAr=\{refusal\.messageAr\} \/>;/);
  const card = notice.slice(notice.indexOf("export function AccountDeviceLimitCard"), notice.indexOf("/** The refusal as a whole page"));
  assert.match(card, /href="\/contact"/);
  assert.doesNotMatch(card, /LibraryDeviceList/);
});

test("the migration ships the switch OFF, exempts admins and staff, and takes the revoke's advisory lock", () => {
  const sql = fs.readFileSync(path.resolve(SRC, "..", "supabase", "migrations", "20261209_40_l19_account_device_limit.sql"), "utf8");
  assert.match(sql, /add column if not exists account_device_limit_enabled boolean not null default false;/);
  assert.match(sql, /pg_advisory_xact_lock\(pg_catalog\.hashtextextended\('library_device:' \|\| p_user::text, 0\)\)/);
  assert.match(sql, /if v_type = 'admin' then/);
  assert.match(sql, /from public\.platform_staff ps where ps\.user_id = p_user/);
  assert.match(sql, /set search_path = ''/);
  assert.match(sql, /grant execute on function public\.account_device_gate\(uuid, text, text, text\) to service_role;/);
  assert.doesNotMatch(sql, /grant [^;]*account_device_gate[^;]* to (anon|authenticated)/);
  // The old library gate is left as it is (not re-created here).
  assert.doesNotMatch(sql, /create or replace function public\.library_device_gate/);
  assert.match(sql, /raise notice '20261209_40 verify: OK/);
});
