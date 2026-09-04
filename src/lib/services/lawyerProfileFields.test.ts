import test from "node:test";
import assert from "node:assert/strict";
import { slugIssue, suggestSlug, educationIssue, COURTS, COURT_AR, LANGUAGES, LANGUAGE_AR, servicePriceLabelAr, isCourtCode, isLanguageCode } from "./lawyerProfileFields.ts";

test("slug rules mirror the CHECK: lowercase, 3–40, no leading/trailing dash, not reserved", () => {
  assert.equal(slugIssue("ahmad-alghamdi"), null);
  assert.equal(slugIssue(""), null, "no slug is allowed");
  assert.ok(slugIssue("Ahmad"));
  assert.ok(slugIssue("-ahmad"));
  assert.ok(slugIssue("ab"));
  assert.ok(slugIssue("browse"), "reserved");
  assert.ok(slugIssue("a".repeat(41)));
});

test("a Latin name suggests a slug; an Arabic name suggests nothing", () => {
  assert.equal(suggestSlug("Ahmad Al-Ghamdi"), "ahmad-al-ghamdi");
  assert.equal(suggestSlug("أحمد الغامدي"), "");
});

test("education entries are validated as a list of degree/institution/year", () => {
  assert.equal(educationIssue([]), null);
  assert.equal(educationIssue([{ degree: "بكالوريوس القانون", institution: "جامعة الملك سعود", year: 2012 }]), null);
  assert.ok(educationIssue([{ degree: "", institution: "x", year: null }]));
  assert.ok(educationIssue([{ degree: "x", institution: "y", year: 1800 }]));
});

test("every court and language code has an Arabic label", () => {
  for (const c of COURTS) assert.ok(COURT_AR[c.code]);
  for (const l of LANGUAGES) assert.ok(LANGUAGE_AR[l.code]);
  assert.equal(isCourtCode("commercial"), true);
  assert.equal(isCourtCode("mars"), false);
  assert.equal(isLanguageCode("en"), true);
});

test("price labels", () => {
  assert.equal(servicePriceLabelAr("fixed", 300), "300 ر.س");
  assert.equal(servicePriceLabelAr("from", 300), "يبدأ من 300 ر.س");
  assert.equal(servicePriceLabelAr("hourly", 500), "500 ر.س / ساعة");
  assert.equal(servicePriceLabelAr("quote", null), "بحسب الحالة");
});
