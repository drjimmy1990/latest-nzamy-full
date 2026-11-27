/**
 * Owner answer ٢٣٥ §2 (27 Nov 2026, batch l18-answers): a confirmed mobile
 * belongs to one account. The app refuses a number confirmed elsewhere
 * before it writes or sends anything; the database (20261208_50) refuses a
 * second confirmation for every writer. Batch l19: on the sign-up and the
 * confirmation / change screens the refusal is the owner's own sentence
 * (it names the reason) with three links; /login and /forgot-password stay
 * neutral.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/phoneOtp/confirmedPhone.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  confirmedPhoneSpellings,
  confirmedPhoneTakenElsewhere,
  isConfirmedPhoneDbError,
  isPhoneTakenText,
  PHONE_TAKEN_AR,
  PHONE_TAKEN_CODE,
  PHONE_TAKEN_LINKS,
  PROFILE_PHONE_CHANGE_LIMIT,
} from "./confirmedPhone.ts";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");

test("l19 (owner ٢٣٥): the owner's sentence word for word, and his three links in his order", () => {
  assert.equal(PHONE_TAKEN_AR, "هذا الرقم مستخدم من قبل في حساب آخر. يمكنك تسجيل الدخول به بدلاً من ذلك، أو استعادة كلمة المرور، أو التواصل معنا إذا واجهتك مشكلة.");
  assert.doesNotMatch(PHONE_TAKEN_AR, /موثّق|محامٍ|محامي|عميل|موظف/, "never says what kind the other account is");
  assert.equal(PHONE_TAKEN_CODE, "phone_taken");
  assert.deepEqual(PHONE_TAKEN_LINKS.map((l) => l.href), ["/login", "/forgot-password", "/contact"]);
  assert.deepEqual(PHONE_TAKEN_LINKS.map((l) => l.signOutFirst), [true, true, true], "the signed-in (often phone-held) new account signs out before each page, or it is bounced back");
  assert.equal(isPhoneTakenText(PHONE_TAKEN_AR), true);
  assert.equal(isPhoneTakenText("تعذّر استعمال هذا الرقم، استعمل رقمًا آخر أو تواصل معنا"), false);
  assert.equal(isPhoneTakenText(undefined), false);
});

test("l19: the old neutral sentence is gone from the sign-up / confirmation / change answers", () => {
  for (const f of [
    "src/lib/phoneOtp/confirmedPhone.ts",
    "src/lib/phoneOtp/service.ts",
    "src/app/api/v1/profile/route.ts",
    "src/lib/lawyerSignup/verifiedPhone.ts",
    "src/components/auth/PhoneOtpPanel.tsx",
  ]) {
    assert.doesNotMatch(read(f), /تعذّر استعمال هذا الرقم|PHONE_UNUSABLE_AR|This number cannot be used/, f);
  }
});

test("l19: /login and /forgot-password stay neutral — they never carry the sentence or the notice", () => {
  for (const f of ["src/app/login/page.tsx", "src/app/forgot-password/page.tsx"]) {
    const src = read(f);
    assert.doesNotMatch(src, /PHONE_TAKEN|PhoneTakenNotice|confirmedPhone|مستخدم من قبل في حساب آخر/, f);
  }
});

test("l19: PhoneTakenNotice draws the sentence, signs out before /login and /forgot-password, and links /contact", () => {
  const notice = read("src/components/auth/PhoneTakenNotice.tsx");
  assert.match(notice, /isAr \? PHONE_TAKEN_AR : PHONE_TAKEN_EN/);
  assert.match(notice, /PHONE_TAKEN_LINKS\.map/);
  assert.match(notice, /signOutFirst && link\.signOutFirst \?/);
  // l19 review S1: the prop defaults to signing out (new, held accounts); Settings opts out.
  assert.match(notice, /signOutFirst = true,/);
  const leave = notice.slice(notice.indexOf("async function leaveTo"), notice.indexOf("const linkCls"));
  assert.ok(leave.indexOf('signOut({ scope: "local" })') > 0 && leave.indexOf("window.location.assign(href)") > leave.indexOf("signOut("), "sign out first, then a full load");
  assert.match(notice, /<Link key=\{link\.href\} href=\{link\.href\}/);
});

test("the three stored spellings of one number (as 20261208_20 / _50 compare them)", () => {
  assert.deepEqual(confirmedPhoneSpellings("+966500000001"), ["+966500000001", "966500000001", "0500000001"]);
  assert.deepEqual(confirmedPhoneSpellings("weird"), ["weird"]);
});

test("the database refusal is recognised only by its own message", () => {
  assert.equal(isConfirmedPhoneDbError({ code: "23505", message: "confirmed_phone_taken: another account…" }), true);
  assert.equal(isConfirmedPhoneDbError({ code: "23505", message: 'duplicate key value violates unique constraint "profiles_confirmed_phone_unique"' }), true);
  assert.equal(isConfirmedPhoneDbError({ code: "23505", message: "verified_phone_taken: …" }), false);
  assert.equal(isConfirmedPhoneDbError({ code: "23514", message: "confirmed_phone_taken" }), false);
  assert.equal(isConfirmedPhoneDbError(null), false);
});

type Call = { op: string; args: unknown[] };
function fakeSvc(result: { data: unknown; error: unknown } | Error) {
  const calls: Call[] = [];
  const chain: Record<string, unknown> = {};
  for (const op of ["select", "in", "not", "neq"]) {
    chain[op] = (...args: unknown[]) => { calls.push({ op, args }); return chain; };
  }
  chain.limit = (...args: unknown[]) => {
    calls.push({ op: "limit", args });
    return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
  };
  return { svc: { from: (t: string) => { calls.push({ op: "from", args: [t] }); return chain; } }, calls };
}

test("confirmedPhoneTakenElsewhere: confirmed rows of OTHER accounts, every spelling; null when unreadable", async () => {
  const hit = fakeSvc({ data: [{ id: "other" }], error: null });
  assert.equal(await confirmedPhoneTakenElsewhere(hit.svc as never, "me", "+966500000001"), true);
  assert.deepEqual(hit.calls.find((c) => c.op === "in")?.args, ["phone", ["+966500000001", "966500000001", "0500000001"]]);
  assert.deepEqual(hit.calls.find((c) => c.op === "not")?.args, ["phone_verified_at", "is", null]);
  assert.deepEqual(hit.calls.find((c) => c.op === "neq")?.args, ["id", "me"]);
  assert.equal(await confirmedPhoneTakenElsewhere(fakeSvc({ data: [], error: null }).svc as never, "me", "+966500000001"), false);
  assert.equal(await confirmedPhoneTakenElsewhere(fakeSvc({ data: null, error: { code: "XX" } }).svc as never, "me", "+966500000001"), null);
  assert.equal(await confirmedPhoneTakenElsewhere(fakeSvc(new Error("down")).svc as never, "me", "+966500000001"), null);
});

test("phone-otp start checks BEFORE it moves the profile and before it issues a code; verify checks and maps the guard", () => {
  const svc = read("src/lib/phoneOtp/service.ts");
  const start = svc.slice(svc.indexOf("export async function startPhoneOtp"), svc.indexOf("export type VerifyOutcome"));
  const check = start.indexOf("confirmedPhoneTakenElsewhere(svc, user.id, parsed.e164)");
  const write = start.indexOf('.update({ phone: parsed.e164 })');
  assert.ok(check > 0 && write > check, "the newPhone check runs before the profile update");
  const issueCheck = start.indexOf("confirmedPhoneTakenElsewhere(svc, user.id, phone.e164)");
  assert.ok(issueCheck > 0 && issueCheck < start.indexOf('svc.rpc("phone_otp_issue"'), "no code is issued for a taken number");
  assert.doesNotMatch(start, /حساب موثّق آخر/);
  assert.equal((start.match(/reason: "phone_taken", error: PHONE_TAKEN_AR/g) ?? []).length, 3);
  const verify = svc.slice(svc.indexOf("export async function verifyPhoneOtp"));
  assert.ok(verify.indexOf("confirmedPhoneTakenElsewhere(svc, user.id, phone.e164)") < verify.indexOf('svc.rpc("phone_otp_verify"'));
  assert.match(verify, /if \(isConfirmedPhoneDbError\(error\)\) return \{ ok: false, reason: "phone_taken", error: PHONE_TAKEN_AR \};/);
  assert.equal((verify.match(/reason: "phone_taken", error: PHONE_TAKEN_AR/g) ?? []).length, 2);
  const vroute = read("src/app/api/v1/auth/phone-otp/verify/route.ts");
  assert.match(vroute, /out\.reason === "phone_taken" \? 409 : 400/);
});

test("PATCH /profile refuses a CHANGE to a number confirmed elsewhere, with the service client", () => {
  const route = read("src/app/api/v1/profile/route.ts");
  assert.match(route, /if \(ownPhone !== phoneDecision\.e164 && \(await confirmedPhoneTakenElsewhere\(svc, user\.id, phoneDecision\.e164\)\) === true\) \{\n\s+return NextResponse\.json\(\{ error: PHONE_TAKEN_AR, field: "phone", code: PHONE_TAKEN_CODE \}, \{ status: 409 \}\);/);
  assert.match(route, /return NextResponse\.json\(\{ error: VERIFIED_PHONE_PROFILE_REFUSAL_AR, field: "phone", code: PHONE_TAKEN_CODE \}, \{ status: 409 \}\);/);
});

test("the verify screen opens the number field on a taken number and shows the owner's notice (l19)", () => {
  const panel = read("src/components/auth/PhoneOtpPanel.tsx");
  assert.equal((panel.match(/if \(body\?\.reason === PHONE_TAKEN_CODE\) \{\n\s+setChanging\(true\);/g) ?? []).length, 2);
  assert.equal((panel.match(/setMessage\(\{ ok: false, text: "", taken: true \}\);\n\s+return;/g) ?? []).length, 2);
  assert.match(panel, /\{message\?\.taken && <PhoneTakenNotice isAr=\{isAr\} \/>\}/);
  assert.match(panel, /\{message && !message\.taken && \(/);
});

test("l19: settings and the onboarding phone step show the notice for the sentence, other errors as before", () => {
  const tab = read("src/app/settings/components/tabs/ProfileTab.tsx");
  assert.match(tab, /\{error && isPhoneTakenText\(error\) && <PhoneTakenNotice isAr=\{lang !== "en"\} signOutFirst=\{false\} \/>\}/);
  assert.match(tab, /\{error && !isPhoneTakenText\(error\) && \(/);
  const ob = read("src/app/onboarding/page.tsx");
  assert.match(ob, /\{saveError && isPhoneTakenText\(saveError\) && <PhoneTakenNotice isAr=\{isAr\} className="mb-4" \/>\}/);
  assert.match(ob, /\{saveError && !isPhoneTakenText\(saveError\) && \(/);
  // the server's Arabic text reaches saveError unchanged (so the match can fire)
  assert.ok(ob.includes("return /[\\u0600-\\u06ff]/.test(raw) ? raw : GENERIC_SAVE_ERROR;"), "arabicError keeps Arabic text");
  assert.match(ob, /setSaveError\(arabicError\(err\)\);/);
  assert.ok(/return \/\[.{3}\]\/\.test\(raw\) \? raw : /.test(tab), "arabicProfileError keeps Arabic text");
});

test("20261208_50: the guard fires after the clearing guard, on INSERT and UPDATE OF phone, phone_verified_at; the index only without duplicates", () => {
  const sql = read("supabase/migrations/20261208_50_l18_confirmed_phone_unique.sql");
  assert.ok("trg_phone_verified_guard" < "trg_phone_verified_unique", "BEFORE triggers fire by name");
  assert.match(sql, /create trigger trg_phone_verified_unique\n\s+before insert or update of phone, phone_verified_at on public\.profiles/);
  assert.match(sql, /using errcode = '23505', constraint = 'confirmed_phone_unique'/);
  assert.match(sql, /raise exception 'confirmed_phone_taken: /);
  assert.match(sql, /if v_shared > 0 then/);
  assert.doesNotMatch(sql.toLowerCase(), /\bdelete from\b|\bupdate public\.profiles\b/);
  const report = read("supabase/migrations/20261208_51_duplicate_phones_report.sql");
  assert.doesNotMatch(report.toLowerCase().replace(/--.*$/gm, ""), /\b(insert|update|delete|alter|create|drop|truncate)\b/);
  assert.match(report, /'…' \|\| pg_catalog\.right\(f\.number, 3\)/);
});

// l18 review S2: a number change is bounded per account BEFORE the
// confirmed-elsewhere question is asked (the phone-otp/start bound).
test("PATCH /profile: a per-account limit on number changes comes before the taken-elsewhere check", () => {
  const route = read("src/app/api/v1/profile/route.ts");
  assert.deepEqual({ ...PROFILE_PHONE_CHANGE_LIMIT }, { limit: 8, windowMs: 10 * 60_000 });
  const limit = route.indexOf("rateLimit(`profile-phone:u:${user.id}`, PROFILE_PHONE_CHANGE_LIMIT)");
  const check = route.indexOf("confirmedPhoneTakenElsewhere(svc, user.id, phoneDecision.e164)");
  assert.ok(limit > 0 && check > limit, "the limit is spent before the question is asked");
  assert.match(route, /if \(!tries\.ok\) \{\n\s+return NextResponse\.json\(\n[^\n]+\n\s+\{ status: 429,/);
});
