// Unit tests for the pure modules of the lawyer signup verification (owner
// decisions ٢٠–٢١ and ٢٧ — e-mail only —, migration 20261124_70). SYNTHETIC values only.
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/lawyerSignup/lawyerSignup.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  compareNames,
  isFourPartName,
  nameMatchAccepted,
  normRegistryLicence,
  normRegistryName,
  registryNameKey,
} from "./nameLicence.ts";
import { maskEmail, maskedMobile, mobileHint } from "./mask.ts";
import { emailDomain, isThrowawayEmail, THROWAWAY_DOMAINS } from "./throwawayEmail.ts";
import { cleanOtpInput, generateOtpCode, hashOtpCode, hashOtpTarget, otpPepper } from "./otpCode.ts";
import { readSignupProviderConfig } from "./providerConfig.ts";
import { decideLawyerSignup, LEGACY_REASON_AR, reasonLineAr, REASON_AR, type DecisionInput } from "./decision.ts";
import { compareExtracted, parseModelAnswer } from "./aiLicenceCheck.ts";

// ── normalisers: the SQL verify vectors of 20261122_40 ───────────────────────
test("normRegistryName mirrors lawyer_registry_norm_name (SQL verify vector)", () => {
  assert.equal(normRegistryName("أَحْمَد  إبراهيم عبدالله آل مـوسى"), "احمد ابراهيم عبدالله ال موسي");
  assert.equal(normRegistryName("  "), null);
  assert.equal(normRegistryName(null), null);
  assert.equal(normRegistryName("مؤمن‏ة"), "مومنه");
});

test("normRegistryLicence mirrors lawyer_registry_norm_licence (SQL verify vectors)", () => {
  assert.equal(normRegistryLicence(" ١٢ / ٣٤٥٦ "), "12/3456");
  assert.equal(normRegistryLicence("12-3456"), "12/3456");
  assert.equal(normRegistryLicence("12__3456"), "12/3456");
  assert.equal(normRegistryLicence("/99001/"), "99001");
  assert.equal(normRegistryLicence("۱۲۳"), "123");
  assert.equal(normRegistryLicence(" / "), null);
});

test("the mirror's character tables are the ones in the SQL file", () => {
  const sql = readFileSync(join(import.meta.dirname, "../../../supabase/migrations/20261122_40_lawyer_registry.sql"), "utf8");
  assert.ok(sql.includes("'أإآٱىئؤة',\n             'ااااييوه'") || sql.includes("'أإآٱىئؤة',\r\n             'ااااييوه'"));
  assert.ok(sql.includes("'٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹-–—_\\',"));
});

test("registryNameKey drops the spaces («عبد الله» = «عبدالله»)", () => {
  assert.equal(registryNameKey("عبد الله"), registryNameKey("عبدالله"));
});

test("isFourPartName: four Arabic words or more", () => {
  assert.equal(isFourPartName("سالم أحمد إبراهيم الاختباري"), true);
  assert.equal(isFourPartName("سالم أحمد الاختباري"), false);
  assert.equal(isFourPartName("Salem Ahmed Ibrahim Test"), false);
  assert.equal(isFourPartName("سالم أحمد إبراهيم 123"), false);
  assert.equal(isFourPartName(""), false);
});

test("compareNames: exact, subset, different, none", () => {
  assert.equal(compareNames("سَالِم أحمد إبراهيم الاختباري", "سالم احمد ابراهيم الاختباري"), "exact");
  assert.equal(compareNames("ناصر عبدالله يحيى التجريبي", "ناصر عبد الله يحيى التجريبي"), "exact");
  assert.equal(compareNames("سالم أحمد إبراهيم الاختباري", "سالم أحمد إبراهيم محمد الاختباري"), "subset");
  assert.equal(compareNames("سالم أحمد الاختباري", "سالم أحمد إبراهيم الاختباري"), "different", "three words is not a subset match");
  assert.equal(compareNames("سالم أحمد إبراهيم المختلف", "سالم أحمد إبراهيم الاختباري"), "different");
  assert.equal(compareNames("", "سالم"), "none");
  assert.equal(nameMatchAccepted("subset"), true);
  assert.equal(nameMatchAccepted("different"), false);
  assert.equal(nameMatchAccepted(null), false);
});

// ── masks ────────────────────────────────────────────────────────────────────
test("mobileHint: last two digits of a usable number only", () => {
  assert.equal(mobileHint("+966500000011"), "11");
  assert.equal(mobileHint("٠٥٠٠٠٠٠٠٢٢"), "22");
  assert.equal(mobileHint("1234"), null);
  assert.equal(mobileHint(null), null);
  assert.equal(maskedMobile("11"), "••••••••11");
  assert.equal(maskedMobile("1"), null);
});

test("maskEmail keeps the first character and the domain", () => {
  assert.equal(maskEmail("lawyer@example.test"), "l•••@example.test");
  assert.equal(maskEmail("bad"), null);
  assert.equal(maskEmail("@x.com"), null);
});

// ── throwaway domains ─────────────────────────────────────────────────────────
test("isThrowawayEmail: listed domains and their sub-domains, case-insensitive", () => {
  assert.equal(isThrowawayEmail("x@mailinator.com"), true);
  assert.equal(isThrowawayEmail("x@MOHMAL.COM"), true);
  assert.equal(isThrowawayEmail("x@inbox.yopmail.com"), true);
  assert.equal(isThrowawayEmail("x@yopmail.com."), true);
  assert.equal(isThrowawayEmail("x@gmail.com"), false);
  assert.equal(isThrowawayEmail("x@notmailinator.co"), false);
  assert.equal(isThrowawayEmail("x@mailinator.com.example.test"), false, "a suffix match only");
  assert.equal(isThrowawayEmail("no-at-sign"), false);
  assert.equal(emailDomain("A@B.Co"), "b.co");
  for (const d of THROWAWAY_DOMAINS) assert.equal(d, d.toLowerCase(), `${d} must be lower case`);
  assert.equal(new Set(THROWAWAY_DOMAINS).size, THROWAWAY_DOMAINS.length, "no duplicates");
});

// ── OTP ──────────────────────────────────────────────────────────────────────
test("generateOtpCode keeps leading zeros and six digits", () => {
  assert.equal(generateOtpCode(() => 42), "000042");
  assert.equal(generateOtpCode(() => 999999), "999999");
  assert.match(generateOtpCode(), /^\d{6}$/);
});

test("cleanOtpInput accepts Arabic-Indic digits and spaces, rejects the rest", () => {
  assert.equal(cleanOtpInput("١٢٣ ٤٥٦"), "123456");
  assert.equal(cleanOtpInput("12345"), null);
  assert.equal(cleanOtpInput("12345a"), null);
  assert.equal(cleanOtpInput(123456), null);
});

test("hashOtpCode is keyed, and bound to the user and the purpose", () => {
  const p = "p".repeat(32);
  const a = hashOtpCode(p, "u1", "identity", "123456");
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(a, hashOtpCode(p, "u1", "identity", "123456"));
  assert.notEqual(a, hashOtpCode(p, "u2", "identity", "123456"));
  assert.notEqual(a, hashOtpCode(p, "u1", "email", "123456"));
  assert.notEqual(a, hashOtpCode("q".repeat(32), "u1", "identity", "123456"));
  assert.notEqual(hashOtpTarget(p, "+966500000011"), hashOtpTarget(p, "+966500000022"));
  assert.equal(hashOtpTarget(p, " A@B.test "), hashOtpTarget(p, "a@b.test"));
});

test("otpPepper: 32 characters or none", () => {
  assert.equal(otpPepper("short"), null);
  assert.equal(otpPepper(undefined), null);
  assert.equal(otpPepper("x".repeat(32)), "x".repeat(32));
});

// ── provider switches ─────────────────────────────────────────────────────────
test("no provider is on with credentials alone — every one needs its =on switch", () => {
  const creds = {
    LAWYER_OTP_PEPPER: "x".repeat(40),
    RESEND_API_KEY: "k",
    EMAIL_FROM: "a@b.test",
    GEMINI_API_KEY: "k",
  };
  const off = readSignupProviderConfig(creds);
  assert.deepEqual({ e: off.email, a: off.ai, i: off.instantApproval }, { e: false, a: false, i: false });
  const on = readSignupProviderConfig({
    ...creds,
    LAWYER_OTP_EMAIL: "ON",
    LAWYER_LICENCE_AI: "on",
    LAWYER_INSTANT_APPROVAL: "on",
  });
  assert.equal(on.email, true);
  assert.equal(on.ai, true);
  assert.equal(on.aiModel, "gemini-2.5-flash");
  assert.equal(on.instantApproval, true);
});

test("decision ٢٧: the signup has no WhatsApp / SMS channel at all, whatever the environment says", () => {
  const c = readSignupProviderConfig({
    LAWYER_OTP_PEPPER: "x".repeat(40),
    LAWYER_OTP_WHATSAPP: "on", LAWYER_OTP_SMS: "on", LAWYER_SMS_PROVIDER: "any",
    ZERNIO_API_KEY: "k", ZERNIO_BASE_URL: "u", ZERNIO_WHATSAPP_SENDER: "s",
    EVOLUTION_API_URL: "u", EVOLUTION_API_KEY: "k", EVOLUTION_INSTANCE_NAME: "i",
  });
  assert.deepEqual(Object.keys(c).sort(), ["ai", "aiModel", "email", "instantApproval", "pepper"]);
  assert.equal(c.email, false, "the e-mail switch and Resend are still needed");
});

test("no pepper → no code channel at all", () => {
  const c = readSignupProviderConfig({ RESEND_API_KEY: "k", EMAIL_FROM: "a@b.test", LAWYER_OTP_EMAIL: "on" });
  assert.equal(c.pepper, null);
  assert.equal(c.email, false);
});

// ── decision table ────────────────────────────────────────────────────────────
const ALL_GOOD: DecisionInput = {
  alreadyVerified: false,
  accountBlocked: false,
  practiceKind: "advocate",
  registryStatus: "valid",
  nameMatch: "exact",
  otherVerifiedClaims: 0,
  licenceImageUploaded: true,
  aiStatus: "match",
  emailOtpVerified: true,
  emailChannelAvailable: true,
  mobileChangeRequested: false,
  emailThrowaway: false,
  instantApprovalEnabled: true,
};

test("approve only when every condition holds — the e-mail code included", () => {
  assert.deepEqual(decideLawyerSignup(ALL_GOOD), { outcome: "approve", next: null, reasons: [] });
  assert.equal(decideLawyerSignup({ ...ALL_GOOD, nameMatch: "subset" }).outcome, "approve");
});

test("the switch off → review, with every other condition met", () => {
  assert.deepEqual(decideLawyerSignup({ ...ALL_GOOD, instantApprovalEnabled: false }), {
    outcome: "review", next: null, reasons: ["instant_approval_off"],
  });
});

test("already verified wins over everything", () => {
  assert.equal(decideLawyerSignup({ ...ALL_GOOD, alreadyVerified: true, registryStatus: "not_found" }).outcome, "verified");
});

test("the photo is asked first, even for an account that will be held", () => {
  const d = decideLawyerSignup({ ...ALL_GOOD, licenceImageUploaded: false, registryStatus: "not_found", emailOtpVerified: false });
  assert.equal(d.outcome, "pending");
  assert.equal(d.next, "upload_licence");
  assert.deepEqual(d.reasons, ["registry_not_found"]);
});

test("every hard reason holds the account, before the e-mail step and after it", () => {
  const cases: Array<[Partial<DecisionInput>, string]> = [
    [{ accountBlocked: true }, "account_not_pending"],
    [{ practiceKind: "consultant" }, "consultant_not_in_registry"],
    [{ registryStatus: "expired" }, "registry_expired"],
    [{ registryStatus: "unverifiable" }, "registry_unverifiable"],
    [{ registryStatus: "not_found" }, "registry_not_found"],
    [{ registryStatus: "no_licence" }, "registry_no_licence"],
    [{ registryStatus: "unavailable" }, "registry_unavailable"],
    [{ registryStatus: "not_checked" }, "registry_not_checked"],
    [{ nameMatch: "different" }, "name_mismatch"],
    [{ nameMatch: "none" }, "name_mismatch"],
    [{ otherVerifiedClaims: 1 }, "licence_claimed"],
    [{ mobileChangeRequested: true }, "mobile_change"],
    [{ emailThrowaway: true }, "throwaway_email"],
    [{ aiStatus: "mismatch" }, "ai_mismatch"],
    [{ aiStatus: "doubt" }, "ai_doubt"],
    [{ aiStatus: "error" }, "ai_error"],
    [{ aiStatus: "pending" }, "ai_error"],
  ];
  for (const emailOtpVerified of [false, true]) {
    for (const [patch, reason] of cases) {
      const d = decideLawyerSignup({ ...ALL_GOOD, emailOtpVerified, ...patch });
      assert.equal(d.outcome, "review", reason);
      assert.equal(d.next, null, `${reason}: held, no further step`);
      assert.ok((d.reasons as string[]).includes(reason), reason);
    }
  }
});

test("the e-mail step: offered when the channel works, else a human reviews", () => {
  const before = { ...ALL_GOOD, emailOtpVerified: false };
  assert.deepEqual(decideLawyerSignup(before), { outcome: "pending", next: "email_otp", reasons: [] });
  assert.deepEqual(decideLawyerSignup({ ...before, emailChannelAvailable: false }), {
    outcome: "review", next: null, reasons: ["email_unavailable"],
  });
  assert.equal(decideLawyerSignup({ ...before, instantApprovalEnabled: false }).next, "email_otp", "the code is asked even while approval is manual");
});

test("batch l15: a mobile confirmed by the WhatsApp sign-up code stands in for the e-mail code", () => {
  const before = { ...ALL_GOOD, emailOtpVerified: false };
  assert.deepEqual(decideLawyerSignup({ ...before, phoneOtpVerified: true }), { outcome: "approve", next: null, reasons: [] });
  assert.deepEqual(decideLawyerSignup({ ...before, phoneOtpVerified: true, emailChannelAvailable: false }), {
    outcome: "approve", next: null, reasons: [],
  }, "no e-mail channel needed once the mobile is confirmed");
  assert.deepEqual(decideLawyerSignup({ ...before, phoneOtpVerified: false }), { outcome: "pending", next: "email_otp", reasons: [] });
  assert.equal(decideLawyerSignup({ ...before, phoneOtpVerified: true, nameMatch: "different" }).outcome, "review", "hard reasons still hold");
  assert.equal(decideLawyerSignup({ ...before, phoneOtpVerified: true, instantApprovalEnabled: false }).outcome, "review");
});

test("decision ٢٧: no registry-mobile, WhatsApp or SMS input exists in the table any more", () => {
  const keys = Object.keys(ALL_GOOD);
  for (const gone of ["hasRegistryMobile", "identityOtpVerified", "identityOtpLicenceMatches", "identityChannelAvailable"]) {
    assert.equal(keys.includes(gone), false, gone);
  }
  const src = readFileSync(join(import.meta.dirname, "decision.ts"), "utf8");
  assert.equal(/identity_otp|identityOtp/.test(src), false);
});

test("AI skipped (no key / switch off) → human review, never approval", () => {
  const d = decideLawyerSignup({ ...ALL_GOOD, aiStatus: "skipped" });
  assert.equal(d.outcome, "review");
  assert.deepEqual(d.reasons, ["ai_skipped"]);
});

test("every reason code has an Arabic line for the admin — the old ones too", () => {
  for (const [k, v] of Object.entries(REASON_AR)) assert.ok(v.length > 4, k);
  for (const old of ["no_registry_mobile", "otp_unavailable", "licence_changed", "approval_error"]) {
    assert.ok(LEGACY_REASON_AR[old], old);
    assert.notEqual(reasonLineAr(old), old);
  }
  assert.equal(reasonLineAr("email_unavailable"), REASON_AR.email_unavailable);
  assert.equal(reasonLineAr("something_new"), "something_new");
});

// ── AI answer ─────────────────────────────────────────────────────────────────
test("parseModelAnswer reads the JSON object and nothing else", () => {
  const x = parseModelAnswer('```json\n{"is_licence": true, "name": "سالم أحمد إبراهيم الاختباري", "licence_number": "99001", "expiry_gregorian": "2099-01-01"}\n```');
  assert.deepEqual(x, { isLicence: true, name: "سالم أحمد إبراهيم الاختباري", licenceNumber: "99001", expiry: "2099-01-01" });
  assert.equal(parseModelAnswer("no json"), null);
  assert.equal(parseModelAnswer('{"name": "x"}'), null, "is_licence is required");
  assert.equal(parseModelAnswer('{"is_licence": true, "expiry_gregorian": "1/1/2099"}')?.expiry, null);
  assert.equal(parseModelAnswer(null), null);
});

const REF = {
  typedName: "سالم أحمد إبراهيم الاختباري",
  licenceNo: "99001",
  registryName: "سالم احمد ابراهيم الاختباري",
  registryExpiry: "2099-01-01",
  today: "2026-11-17",
};
const READ = { isLicence: true, name: "سَالِم أحمد إبراهيم الاختباري", licenceNumber: "٩٩٠٠١", expiry: "2099-01-01" };

test("compareExtracted: match", () => {
  assert.equal(compareExtracted(READ, REF).verdict, "match");
  assert.equal(compareExtracted({ ...READ, expiry: null }, REF).verdict, "match", "a Hijri-only date does not hold it");
});

test("compareExtracted: mismatch for a different licence, an expired date, or not a licence", () => {
  assert.equal(compareExtracted({ ...READ, licenceNumber: "99002" }, REF).verdict, "mismatch");
  assert.equal(compareExtracted({ ...READ, expiry: "2020-01-01" }, REF).verdict, "mismatch");
  assert.equal(compareExtracted({ ...READ, isLicence: false }, REF).verdict, "mismatch");
});

test("compareExtracted: doubt when something is unread or only differs", () => {
  assert.equal(compareExtracted({ ...READ, licenceNumber: null }, REF).verdict, "doubt");
  assert.equal(compareExtracted({ ...READ, name: null }, REF).verdict, "doubt");
  assert.equal(compareExtracted({ ...READ, name: "اسم آخر تماماً مختلف" }, REF).verdict, "doubt");
  assert.equal(compareExtracted({ ...READ, expiry: "2098-01-01" }, REF).verdict, "doubt");
});

// ── admin queue line ──────────────────────────────────────────────────────────
import { describeSignupView, shapeSignupView } from "./adminView.ts";

test("the admin line shows the e-mail check; never a full registry mobile", () => {
  const v = shapeSignupView(
    {
      decision: "review",
      decision_reasons: ["email_unavailable", 7],
      registry_status: "valid",
      name_match: "exact",
      full_name_input: "سالم أحمد إبراهيم الاختباري",
      mobile_hint: "11",
      email_throwaway: false,
    },
    { purpose: "signup", ai_status: "skipped", ai_result: { skipped: true }, created_at: "2026-11-17T09:00:00Z" },
    "https://storage.invalid/signed",
    { created_at: "2026-11-17T09:30:00Z", delivery: "failed" },
  );
  assert.deepEqual(v.reasons, ["email_unavailable"]);
  assert.equal(v.image?.url, "https://storage.invalid/signed");
  const d = describeSignupView(v);
  assert.equal(d.headline, "محجوز للمراجعة البشرية");
  assert.ok(d.lines.some((l) => l.includes("رمز البريد غير مفعّل")));
  assert.ok(d.lines.some((l) => l.startsWith("رمز البريد: أُرسل") && l.includes("تعذّر التسليم")));
  assert.ok(d.lines.some((l) => l.includes("ينتهي بـ 11")));
  assert.equal(d.lines.some((l) => l.includes("رمز جوال السجل")), false, "no registry-mobile code line on a new row");
  assert.equal(d.lines.some((l) => l.includes("رقمي تغيّر")), false);
});

test("the e-mail line: confirmed / not sent / throwaway", () => {
  const confirmed = describeSignupView(shapeSignupView({ decision: "approved", decided_by: "system", email_otp_verified_at: "2026-11-18T10:00:00Z", email_otp_hint: "l•••@example.test" }, null, null, null));
  assert.ok(confirmed.lines.includes("رمز البريد: مؤكَّد (l•••@example.test)"));
  assert.ok(describeSignupView(shapeSignupView({ decision: "pending" }, null, null, null)).lines.includes("رمز البريد: لم يُرسل"));
  assert.ok(describeSignupView(shapeSignupView({ decision: "review", email_throwaway: true }, null, null, null)).lines.some((l) => l.includes("نطاق مؤقت")));
});

test("rows from before the e-mail-only change keep their old lines, in Arabic", () => {
  const v = shapeSignupView(
    {
      decision: "review",
      decision_reasons: ["otp_unavailable", "mobile_change"],
      identity_otp_verified_at: "2026-11-10T10:00:00Z",
      identity_otp_channel: "sms",
      mobile_change_new_mobile: "+966500000099",
      mobile_change_requested_at: "2026-11-17T10:00:00Z",
    },
    null,
    null,
    null,
  );
  const d = describeSignupView(v);
  assert.ok(d.lines.some((l) => l.includes("قاعدة قديمة")), "a legacy reason is shown in Arabic");
  assert.ok(d.lines.some((l) => l.includes("رمز جوال السجل (قبل التوثيق بالبريد): مؤكَّد (رسالة نصية)")));
  assert.ok(d.lines.some((l) => l.includes("+966500000099")), "the admin still sees the new mobile of an old «رقمي تغيّر»");
});

test("an admin decision on the account wins over a stale signup headline", () => {
  const v = shapeSignupView({ decision: "review" }, null, null, null);
  assert.equal(describeSignupView(v, "verified").headline, "اعتمدته الإدارة");
  assert.equal(describeSignupView(v, "verified").tone, "good");
  assert.equal(describeSignupView(v, "rejected").tone, "bad");
  assert.equal(describeSignupView(shapeSignupView({ decision: "approved", decided_by: "system" }, null, null, null), "verified").headline, "اعتُمد فورياً بعد التحقق");
});

// ── the signup UI and routes: e-mail only ──────────────────────────────────────
test("decision ٢٧: the signup UI and routes carry no WhatsApp / SMS step and no «رقمي تغيّر»", async () => {
  const { existsSync } = await import("node:fs");
  const root = join(import.meta.dirname, "../../..");
  for (const gone of ["identity/start", "identity/verify", "mobile-change"]) {
    assert.equal(existsSync(join(root, "src/app/api/v1/lawyer/signup-verification", gone, "route.ts")), false, gone);
  }
  const panel = readFileSync(join(root, "src/components/lawyerSignup/LawyerVerificationPanel.tsx"), "utf8");
  for (const word of ["رقمي تغيّر", "WhatsappLogo", "identity/start", "mobile-change", "واتساب", "رسالة نصية"]) {
    assert.equal(panel.includes(word), false, word);
  }
  assert.ok(panel.includes("email/verify"));
  const lookup = readFileSync(join(root, "src/app/register/provider/components/LawyerRegistryLookup.tsx"), "utf8");
  assert.equal(lookup.includes("يصل إلى هذا الجوال"), false, "no promise of a code to the registry mobile");
});

// ── owner 18 Nov: the licence photo always says where it stands ────────────────
test("the licence photo shows selected / uploaded / not-yet-uploaded, never silence", () => {
  const root = join(import.meta.dirname, "../../..");
  const steps = readFileSync(join(root, "src/app/register/provider/components/Steps.tsx"), "utf8");
  assert.ok(steps.includes("تم اختيار صورة الترخيص"), "step 2 shows a selected state");
  assert.ok(steps.includes("تُرفع بعد إنشاء الحساب وتأكيد بريدك"), "step 2 says when it is uploaded");
  const panel = readFileSync(join(root, "src/components/lawyerSignup/LawyerVerificationPanel.tsx"), "utf8");
  assert.ok(panel.includes("state.licenceUploaded"), "the panel reads the server's licenceUploaded");
  assert.ok(panel.includes("تم رفع صورة الترخيص"), "the panel confirms the upload");
  assert.ok(panel.includes("لم تُرفع بعد"), "the sign-in card says the chosen photo is not uploaded yet");
  assert.ok(panel.includes("جارٍ رفع الصورة"), "the upload button shows progress");
});
