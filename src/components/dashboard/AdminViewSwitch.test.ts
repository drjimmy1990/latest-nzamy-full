/**
 * AdminViewSwitch.test.ts — S6-T16 (slice A §6.1.2, preflight R27).
 *
 * Source test: the «عرض كـ» switch lists every role and sub-role from
 * ADMIN_SWITCH_OPTIONS, offers «تجاوز الأدمن» / «محاكاة القيود», says it is
 * UI only, and still renders only for the REAL admin role.
 *
 * Run: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/components/dashboard/AdminViewSwitch.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./AdminViewSwitch.tsx", import.meta.url), "utf8");

test("S6: the switch lists every role and says it is UI-only", () => {
  assert.match(src, /import \{[^}]*\bADMIN_SWITCH_OPTIONS\b[^}]*\} from "@\/lib\/nav\/adminSimulation";/);
  assert.match(src, /محاكاة القيود/);
  assert.match(src, /تجاوز الأدمن/);
  assert.match(src, /يغيّر القوائم والعرض فقط — الخادم يعاملك كأدمن ولا تُخصم نقاطك/);
  assert.match(src, /userType !== "admin"/);
  assert.doesNotMatch(src, /OPTIONS: Array</, "the two hard-coded buttons are gone");
  assert.match(src, /<optgroup/);
  assert.doesNotMatch(src, /text-gray-(?:100|200)\b/);
});

test("S6: the switch writes only this tab's UI state, gated on the real role", () => {
  // Hooks run before the gate; the gate itself is unchanged.
  assert.match(src, /if \(loading \|\| userType !== "admin"\) return null;/);
  assert.match(src, /useAdminSimulation\(!loading && userType === "admin"\)/);
  // On choose: the view, then the simulation, then navigation.
  assert.match(src, /setAdminView\(opt\.sim\.view\);\s*setAdminSimulation\(\{ \.\.\.opt\.sim, mode \}\);/);
  assert.match(src, /if \(!isUnderHref\(pathname, opt\.href\)\) router\.push\(opt\.href\);/);
  // Nothing here talks to the server.
  assert.doesNotMatch(src, /\bfetch\s*\(|setDemoSession|supabase|headers/);
});
