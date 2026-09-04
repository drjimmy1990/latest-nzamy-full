import test from "node:test";
import assert from "node:assert/strict";
import { findOffPlatformContact, hasOffPlatformContact, offPlatformContactIssue, stripOffPlatformContact } from "./contactSanitizer.ts";

test("a Saudi mobile in any of its usual spellings is caught, Arabic-Indic digits included", () => {
  for (const s of ["تواصل 0501234567", "+966 50 123 4567", "00966501234567", "٠٥٠١٢٣٤٥٦٧", "05-0123-4567"]) {
    assert.ok(hasOffPlatformContact(s), s);
    assert.equal(findOffPlatformContact(s)[0].kind === "phone" || findOffPlatformContact(s)[0].kind === "whatsapp", true, s);
  }
});

test("e-mails, links and handles are caught, including the disguised forms", () => {
  assert.equal(findOffPlatformContact("راسلني a.b@example.com")[0].kind, "email");
  assert.equal(findOffPlatformContact("راسلني ahmad (at) gmail (dot) com")[0].kind, "email");
  assert.equal(findOffPlatformContact("wa.me/966501234567")[0].kind, "url");
  assert.equal(findOffPlatformContact("https://t.me/ahmadlaw")[0].kind, "url");
  assert.equal(findOffPlatformContact("تابعني @ahmad_law")[0].kind, "handle");
  assert.equal(findOffPlatformContact("واتساب: ٠٥٠١٢٣٤٥٦٧")[0].kind, "whatsapp");
});

test("ordinary legal text with numbers is NOT contact", () => {
  for (const s of [
    "المادة ١٨٧ من نظام المرافعات الشرعية",
    "خبرة ١٢ عاماً في القضايا التجارية، السجل التجاري ١٠١٠١٢٣٤٥٦",
    "الحكم رقم ٤٤٣٠٥ لعام ١٤٤٥هـ",
    "جلسة الساعة ١٠:٣٠ صباحاً بتاريخ ٢٠٢٦-٠٩-١٠",
  ]) assert.equal(hasOffPlatformContact(s), false, s);
});

test("the refusal names what was found, in Arabic", () => {
  assert.equal(offPlatformContactIssue("نبذة نظيفة"), null);
  const issue = offPlatformContactIssue("اتصل 0501234567 أو a@b.com");
  assert.ok(issue && issue.includes("رقم هاتف") && issue.includes("بريد إلكتروني") && issue.includes("المنصّة"));
});

test("stripping replaces every hit and keeps the rest", () => {
  const out = stripOffPlatformContact("للتواصل 0501234567 أو a.b@example.com شكراً");
  assert.equal(out.includes("0501234567"), false);
  assert.equal(out.includes("example.com"), false);
  assert.ok(out.startsWith("للتواصل [محذوف]") && out.endsWith("شكراً"));
});
