/**
 * Owner answer ٢٣٥ §2 (27 Nov 2026, batch l18-answers): a confirmed mobile
 * belongs to one account. The app refuses a number confirmed elsewhere with
 * one neutral sentence before it writes or sends anything; the database
 * (20261208_50) refuses a second confirmation for every writer.
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
  PHONE_UNUSABLE_AR,
} from "./confirmedPhone.ts";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");

test("the owner's neutral sentence, word for word", () => {
  assert.equal(PHONE_UNUSABLE_AR, "تعذّر استعمال هذا الرقم، استعمل رقمًا آخر أو تواصل معنا");
  assert.doesNotMatch(PHONE_UNUSABLE_AR, /موثّق|حساب آخر|مسجّل/);
});

test("the three stored spellings of one number (as 20261208_20 / _50 compare them)", () => {
  assert.deepEqual(confirmedPhoneSpellings("+966500000001"), ["+966500000001", "966500000001", "0500000001"]);
  assert.deepEqual(confirmedPhoneSpellings("weird"), ["weird"]);
});

test("the database refusal is recognised only by its own message", () => {
  assert.equal(isConfirmedPhoneDbError({ code: "23505", message: "confirmed_phone_taken: another account…" }), true);
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
  assert.equal((start.match(/error: PHONE_UNUSABLE_AR/g) ?? []).length, 3);
  const verify = svc.slice(svc.indexOf("export async function verifyPhoneOtp"));
  assert.ok(verify.indexOf("confirmedPhoneTakenElsewhere(svc, user.id, phone.e164)") < verify.indexOf('svc.rpc("phone_otp_verify"'));
  assert.match(verify, /if \(isConfirmedPhoneDbError\(error\)\) return \{ ok: false, reason: "phone_taken", error: PHONE_UNUSABLE_AR \};/);
  const vroute = read("src/app/api/v1/auth/phone-otp/verify/route.ts");
  assert.match(vroute, /out\.reason === "phone_taken" \? 409 : 400/);
});

test("PATCH /profile refuses a CHANGE to a number confirmed elsewhere, with the service client", () => {
  const route = read("src/app/api/v1/profile/route.ts");
  assert.match(route, /if \(ownPhone !== phoneDecision\.e164 && \(await confirmedPhoneTakenElsewhere\(svc, user\.id, phoneDecision\.e164\)\) === true\) \{\n\s+return NextResponse\.json\(\{ error: PHONE_UNUSABLE_AR, field: "phone" \}, \{ status: 409 \}\);/);
});

test("the verify screen opens the number field on a taken number", () => {
  const panel = read("src/components/auth/PhoneOtpPanel.tsx");
  assert.equal((panel.match(/body\?\.reason === "phone_taken"\) (setChanging\(true\)|\{)/g) ?? []).length, 2);
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
