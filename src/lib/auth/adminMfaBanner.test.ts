/**
 * adminMfaBanner.test.ts — batch l14: the admin console says plainly when
 * two-step sign-in is not enforced for admin accounts (the env switch
 * ADMIN_MFA_ENFORCE itself is unchanged), and the device-limit panel offers
 * one device or two only.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ADMIN_MFA_OFF_BODY_AR, ADMIN_MFA_OFF_TITLE_AR, adminMfaOffBannerShown } from "./adminMfaBanner.ts";
import { adminMfaMode } from "./staffMfa.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");

test("the banner shows for a staff caller while the mode is rollout, never otherwise", () => {
  assert.equal(adminMfaOffBannerShown({ isStaff: true, mode: "rollout" }), true);
  assert.equal(adminMfaOffBannerShown({ isStaff: true, mode: "required" }), false);
  assert.equal(adminMfaOffBannerShown({ isStaff: false }), false);
  assert.equal(adminMfaOffBannerShown({ isStaff: "true", mode: "rollout" }), false);
  assert.equal(adminMfaOffBannerShown(null), false);
  assert.equal(adminMfaOffBannerShown("rollout"), false);
  // the env switch is unchanged: unset → rollout (the banner shows), required → no banner
  assert.equal(adminMfaMode({}), "rollout");
  assert.equal(adminMfaMode({ ADMIN_MFA_ENFORCE: "required" }), "required");
  assert.match(ADMIN_MFA_OFF_TITLE_AR, /متوقف/);
  // l16 (C46): the text names no server variable; it says who switches it on.
  assert.match(ADMIN_MFA_OFF_BODY_AR, /إعدادات الخادم بطلب إلى الفريق التقني/);
  assert.doesNotMatch(ADMIN_MFA_OFF_BODY_AR, /[A-Za-z]/);
});

test("the banner sits on the console home and on «الأمان والحماية»; the two-step panel shows the OFF state as an alert", () => {
  const home = read("src", "app", "dashboard", "admin", "page.tsx");
  const security = read("src", "app", "dashboard", "admin", "security", "page.tsx");
  const panel = read("src", "app", "dashboard", "admin", "security", "TwoFactorPanel.tsx");
  const banner = read("src", "components", "admin", "AdminMfaOffBanner.tsx");
  assert.match(home, /<AdminMfaOffBanner \/>/);
  assert.match(security, /<AdminMfaOffBanner showLink=\{tab !== "two_factor"\} \/>/);
  assert.match(banner, /fetch\("\/api\/v1\/auth\/mfa\/status"/);
  assert.match(banner, /setShown\(adminMfaOffBannerShown\(b\)\)/);
  assert.match(banner, /role="alert"/);
  assert.match(panel, /الإلزام متوقف:/);
  assert.match(panel, /border-amber-500\/40/);
});

// Batch l19 (owner ٢٣٣): the limit is the whole account's, fixed at one phone + one computer —
// one switch, no number (the l14 «one device or two» choice is gone with the library-only limit).
test("the device-limit panel is one switch for the whole account (1 phone + 1 computer), and never touches the switch by itself", () => {
  const panel = read("src", "app", "dashboard", "admin", "security", "LibraryDevicesPanel.tsx");
  assert.match(panel, /جوال واحد \+ حاسوب واحد/);
  assert.doesNotMatch(panel, /<option value=/);
  assert.match(panel, /body: JSON\.stringify\(\{ enabled \}\)/);
  assert.match(panel, /useState\(false\)/);
  assert.doesNotMatch(panel, /ملف الترحيل/);
});

test("l16 C46: the admin screens print no server variable, migration file, question number or English console title", () => {
  const strip = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  const screens: Array<[string[], RegExp[]]> = [
    [["src", "app", "dashboard", "admin", "security", "TwoFactorPanel.tsx"], [/ADMIN_MFA_ENFORCE/]],
    [["src", "app", "dashboard", "admin", "security", "LibraryDevicesPanel.tsx"], [/DEVICE_CODE_PEPPER/, /LAWYER_OTP_PEPPER/]],
    [["src", "app", "dashboard", "admin", "settings", "_components", "SignupPhoneOtpCard.tsx"], [/ZERNIO_API_KEY/, /ZERNIO_WHATSAPP_ACCOUNT_ID/, /\(LAWYER_OTP_PEPPER\)/, /ملف الترحيل/]],
    [["src", "app", "dashboard", "admin", "settings", "_components", "PaymentRulesCard.tsx"], [/\(founder_topup_discount_expires\)/, /س١١٤/]],
    [["src", "app", "dashboard", "admin", "settings", "_components", "SimpleContractPriceCard.tsx"], [/السؤال ١٢٣/, /n8n/]],
    [["src", "app", "dashboard", "admin", "settings", "_components", "DrafterRevisionsCard.tsx"], [/السؤال ١٦٦/]],
    [["src", "app", "dashboard", "admin", "ai-usage", "page.tsx"], [/فعّل أداة echo-fast/, /<Play size=\{14\} \/> \{tool\}/]],
    [["src", "components", "admin", "AdminSidebar.tsx"], [/Admin Panel/, /<Scales\b/]],
  ];
  for (const [path, gone] of screens) {
    const code = strip(read(...path));
    for (const re of gone) assert.doesNotMatch(code, re, `${path.at(-1)}: ${re}`);
  }
});
