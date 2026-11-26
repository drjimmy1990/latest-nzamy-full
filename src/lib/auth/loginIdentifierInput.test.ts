/**
 * loginIdentifierInput.test.ts — batch l18 (LIVE-16): the one «البريد
 * الإلكتروني أو رقم الجوال» field on /login (and /forgot-password), plus the
 * page wiring (source read: the .tsx cannot load under node --test).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { classifyLoginInput, loginInputMessage, looksLikePhoneInput } from "./loginIdentifierInput.ts";

test("an «@» makes it an e-mail: trimmed, lower-cased", () => {
  assert.deepEqual(classifyLoginInput("  Some.One@Example.TEST "), { ok: true, kind: "email", value: "some.one@example.test" });
  for (const bad of ["a@b", "@x.sa", "a b@c.sa", "a@@b.sa"]) {
    assert.deepEqual(classifyLoginInput(bad), { ok: false, reason: "email" }, bad);
  }
});

test("every spelling of a Saudi mobile folds to E.164", () => {
  for (const v of ["0512345678", "512345678", "966512345678", "+966512345678", "00966512345678", "+966 51 234 5678", "051-234-5678", "٠٥١٢٣٤٥٦٧٨"]) {
    assert.deepEqual(classifyLoginInput(v), { ok: true, kind: "phone", value: "+966512345678" }, v);
  }
});

test("Saudi mobiles only: foreign numbers, landlines, 920 and short numbers are refused with the «سعودي» sentence", () => {
  for (const v of ["+201001234567", "+971501234567", "0112345678", "920012345", "05123", "+9660512345678"]) {
    const r = classifyLoginInput(v);
    assert.deepEqual(r, { ok: false, reason: "not_saudi_mobile" }, v);
    assert.match(loginInputMessage(r, true), /رقم جوال سعودياً صحيحاً يبدأ بـ 05/);
    assert.match(loginInputMessage(r, true), /لا تُقبل أرقام من خارج المملكة/);
  }
});

test("letters without an «@» are neither; empty is empty", () => {
  assert.deepEqual(classifyLoginInput("someone"), { ok: false, reason: "neither" });
  assert.deepEqual(classifyLoginInput("05abc"), { ok: false, reason: "neither" });
  assert.deepEqual(classifyLoginInput("   "), { ok: false, reason: "empty" });
  assert.deepEqual(classifyLoginInput(null), { ok: false, reason: "empty" });
  assert.equal(loginInputMessage({ ok: true, kind: "email", value: "a@b.sa" }, true), "");
  assert.match(loginInputMessage({ ok: false, reason: "neither" }, true), /بريداً إلكترونياً، أو رقم جوال سعودياً/);
});

test("the icon follows what is typed (display only)", () => {
  assert.equal(looksLikePhoneInput("05"), true);
  assert.equal(looksLikePhoneInput("٠٥١"), true);
  assert.equal(looksLikePhoneInput("a@b"), false);
  assert.equal(looksLikePhoneInput(""), false);
});

const strip = (s: string) => s.replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "");
const read = (p: string) => strip(readFileSync(new URL(p, import.meta.url), "utf8"));

test("/login: one field, no e-mail / mobile tabs, classified before anything is sent", () => {
  const login = read("../../app/login/page.tsx");
  assert.doesNotMatch(login, /setInputMode|inputMode === "phone"|switchToPhone/, "the two tabs are gone");
  assert.match(login, /const typed = classifyLoginInput\(identifier\);/);
  assert.match(login, /if \(!typed\.ok\) \{\s*setError\(loginInputMessage\(typed, isAr\)\);\s*return;/);
  assert.match(login, /mode: typed\.kind,/);
  // type="text": a browser e-mail field would refuse a mobile before submit.
  assert.match(login, /id="login-identifier"\s*type="text"/);
  assert.match(login, /autoComplete="username"/);
  assert.match(login, /\{txt\.idLabel\}/);
  assert.doesNotMatch(login, /saudiMobileOrNull/);
  const classify = login.indexOf("classifyLoginInput(identifier)");
  const send = login.indexOf('fetch("/api/v1/auth/sign-in"');
  assert.ok(classify > 0 && send > classify);
});

test("/forgot-password: the same field takes the mobile only while the WhatsApp choice is on", () => {
  const forgot = read("../../app/forgot-password/page.tsx");
  assert.match(forgot, /\{waOn \? t\.idLabel : t\.emailLabel\}/);
  assert.match(forgot, /type=\{waOn \? "text" : "email"\}/);
  assert.match(forgot, /const typed = classifyLoginInput\(email\);\s*if \(!typed\.ok\)/);
  assert.match(forgot, /typed\.kind === "email" \? \{ email: typed\.value \} : \{ phone: typed\.value \}/);
  assert.match(forgot, /body: JSON\.stringify\(\{ \.\.\.target, turnstileToken/);
  assert.match(forgot, /body: JSON\.stringify\(\{ \.\.\.waTarget, code: waCode/, "verify sends the identifier start was asked for");
  assert.match(forgot, /waOn && typed\.ok && typed\.kind === "phone" \? t\.linkNeedsEmail : t\.invalidEmail/, "the e-mail link never fires for a mobile");
});
