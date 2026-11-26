/**
 * lawyerSignupInlinePhone.test.ts — A-10 / E-15 (batch l16): a lawyer picks
 * his licence photo ONCE. The batch-15 redirect to /verify-phone dropped the
 * in-memory File, so the photo was asked again on /register/provider/verify.
 * Now the WhatsApp step runs inline on the sign-up's last step and the licence
 * panel (which uploads the same File) mounts only after it.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/phoneOtp/lawyerSignupInlinePhone.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("the lawyer's sign-up keeps the WhatsApp step but never leaves the page for it", () => {
  const page = code("src/app/register/provider/page.tsx");
  assert.doesNotMatch(page, /verify-phone\?next=\/register\/provider\/verify/, "no full redirect that drops the File");
  assert.match(page, /if \(signUpData\.session && \(await phoneOtpRequiredNow\(\)\)\) \{\s*if \(!needsLicenceProofFor\(providerType\)\) \{\s*window\.location\.assign\("\/verify-phone"\);/);
  assert.match(page, /setPhoneStepPending\(true\)/);
  // The phone panel first; the licence panel (with the File) only after it.
  const phone = page.indexOf("<PhoneOtpPanel");
  const licence = page.indexOf("<LawyerVerificationPanel isAr={isAr} initialFile={licenceFile}");
  assert.ok(phone > 0 && licence > phone, "PhoneOtpPanel renders before the licence panel");
  // l16 review: stable callbacks; the licence panel's phone_unverified refusal comes back to this step
  assert.match(page, /signupHasSession && phoneStepPending \? \(\s*<PhoneOtpPanel showSignOut=\{false\} onDone=\{onPhoneDone\} \/>/);
  assert.match(page, /const onPhoneDone = useCallback\(\(\) => setPhoneStepPending\(false\), \[\]\);/);
  assert.match(page, /const onPhoneUnverified = useCallback\(\(\) => setPhoneStepPending\(true\), \[\]\);/);
  assert.match(page, /<LawyerVerificationPanel [^>]*onPhoneUnverified=\{onPhoneUnverified\} \/>/);
  const panel = code("src/components/lawyerSignup/LawyerVerificationPanel.tsx");
  assert.match(panel, /if \(inline\) inline\(\);\s*else window\.location\.assign\("\/verify-phone\?next=\/register\/provider\/verify"\);/);
});

test("/verify-phone still works on its own: the same panel, ?next= kept", () => {
  const page = code("src/app/verify-phone/page.tsx");
  assert.match(page, /<PhoneOtpPanel onDone=\{goOn\} \/>/);
  assert.match(page, /safePhoneNext\(/);
  const panel = code("src/components/auth/PhoneOtpPanel.tsx");
  for (const route of ["/api/v1/auth/phone-otp/status", "/api/v1/auth/phone-otp/start", "/api/v1/auth/phone-otp/verify"]) {
    assert.ok(panel.includes(route), route);
  }
  assert.doesNotMatch(panel, /window\.location\.assign\(next/, "the panel itself never navigates after success");
});
