// Unit tests for the pure modules of the lawyer signup verification (owner
// decisions ٢٠–٢١, migration 20261124_70). SYNTHETIC values only.
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
import { identityChannelAvailable, readSignupProviderConfig } from "./providerConfig.ts";
import { decideLawyerSignup, REASON_AR, type DecisionInput } from "./decision.ts";
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
    EVOLUTION_API_URL: "http://evolution.invalid",
    EVOLUTION_API_KEY: "k",
    EVOLUTION_INSTANCE_NAME: "i",
    RESEND_API_KEY: "k",
    EMAIL_FROM: "a@b.test",
    GEMINI_API_KEY: "k",
  };
  const off = readSignupProviderConfig(creds);
  assert.deepEqual(
    { w: off.whatsapp, s: off.sms, e: off.email, a: off.ai, i: off.instantApproval },
    { w: false, s: false, e: false, a: false, i: false },
  );
  const on = readSignupProviderConfig({
    ...creds,
    LAWYER_OTP_WHATSAPP: "on",
    LAWYER_OTP_SMS: "on",
    LAWYER_SMS_PROVIDER: "anything",
    LAWYER_OTP_EMAIL: "ON",
    LAWYER_LICENCE_AI: "on",
    LAWYER_INSTANT_APPROVAL: "on",
  });
  assert.equal(on.whatsapp, true);
  assert.equal(on.sms, false, "no SMS adapter is implemented yet");
  assert.equal(on.email, true);
  assert.equal(on.ai, true);
  assert.equal(on.aiModel, "gemini-2.5-flash");
  assert.equal(on.instantApproval, true);
  assert.equal(identityChannelAvailable(on), true);
});

test("no pepper → no code channel at all", () => {
  const c = readSignupProviderConfig({
    EVOLUTION_API_URL: "u", EVOLUTION_API_KEY: "k", EVOLUTION_INSTANCE_NAME: "i", LAWYER_OTP_WHATSAPP: "on",
    RESEND_API_KEY: "k", EMAIL_FROM: "a@b.test", LAWYER_OTP_EMAIL: "on",
  });
  assert.equal(c.pepper, null);
  assert.equal(c.whatsapp, false);
  assert.equal(c.email, false);
  assert.equal(identityChannelAvailable(c), false);
});

// ── decision table ────────────────────────────────────────────────────────────
const ALL_GOOD: DecisionInput = {
  alreadyVerified: false,
  practiceKind: "advocate",
  registryStatus: "valid",
  nameMatch: "exact",
  otherVerifiedClaims: 0,
  hasRegistryMobile: true,
  licenceImageUploaded: true,
  aiStatus: "match",
  identityOtpVerified: true,
  identityOtpLicenceMatches: true,
  identityChannelAvailable: true,
  mobileChangeRequested: false,
  emailThrowaway: false,
  instantApprovalEnabled: true,
};

test("approve only when every condition holds", () => {
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
  const d = decideLawyerSignup({ ...ALL_GOOD, licenceImageUploaded: false, registryStatus: "not_found", identityOtpVerified: false });
  assert.equal(d.outcome, "pending");
  assert.equal(d.next, "upload_licence");
  assert.deepEqual(d.reasons, ["registry_not_found"]);
});

test("every hard reason holds the account and never offers a code", () => {
  const cases: Array<[Partial<DecisionInput>, string]> = [
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
  for (const [patch, reason] of cases) {
    const d = decideLawyerSignup({ ...ALL_GOOD, identityOtpVerified: false, ...patch });
    assert.equal(d.outcome, "review", reason);
    assert.equal(d.next, null, `${reason}: no code may be sent`);
    assert.ok((d.reasons as string[]).includes(reason), reason);
  }
});

test("the OTP step: offered only with a registry mobile and a working channel", () => {
  const before = { ...ALL_GOOD, identityOtpVerified: false };
  assert.deepEqual(decideLawyerSignup(before), { outcome: "pending", next: "identity_otp", reasons: [] });
  assert.deepEqual(decideLawyerSignup({ ...before, hasRegistryMobile: false }).reasons, ["no_registry_mobile"]);
  assert.deepEqual(decideLawyerSignup({ ...before, identityChannelAvailable: false }), {
    outcome: "review", next: null, reasons: ["otp_unavailable"],
  });
});

test("a code proved for another licence does not count", () => {
  assert.deepEqual(decideLawyerSignup({ ...ALL_GOOD, identityOtpLicenceMatches: false }).reasons, ["licence_changed"]);
});

test("AI skipped (no key / switch off) → human review, never approval", () => {
  const d = decideLawyerSignup({ ...ALL_GOOD, aiStatus: "skipped" });
  assert.equal(d.outcome, "review");
  assert.deepEqual(d.reasons, ["ai_skipped"]);
});

test("every reason code has an Arabic line for the admin", () => {
  for (const [k, v] of Object.entries(REASON_AR)) assert.ok(v.length > 4, k);
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
