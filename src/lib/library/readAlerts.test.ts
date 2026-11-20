/**
 * readAlerts.test.ts — batch l11 (O19 / R67): the staff e-mail for an account
 * put under review carries the reference, the rules and the numbers, and
 * never the reader's name or address.
 *
 * Run: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/library/readAlerts.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { parseClaimedFlags, reviewFlagEmail } from "./readAlerts.ts";
import { REVIEW_RULE_AR } from "./monitorSettings.ts";

test("the two new rules have Arabic names", () => {
  assert.equal(REVIEW_RULE_AR.sequential, "فتح وثائق كثيرة تباعاً بسرعة");
  assert.equal(REVIEW_RULE_AR.parallel, "قراءة من جلسات كثيرة في وقت واحد");
});

test("claimed rows: odd rows dropped, fields typed", () => {
  const flags = parseClaimedFlags([
    { reference: "REV-1", rule: "parallel", rules: ["parallel", "near_cap"], details: { parallel_sessions: 3 }, action_taken: "notify", created_at: "2026-11-20T10:00:00Z", user_type: "admin" },
    { rule: "x" },
    null,
  ]);
  assert.equal(flags.length, 1);
  assert.deepEqual(flags[0].rules, ["parallel", "near_cap"]);
  assert.equal(flags[0].userType, "admin");
  assert.deepEqual(parseClaimedFlags(null), []);
});

test("the message: reference, rules in Arabic, numbers, the admin link; no personal data", () => {
  const [flag] = parseClaimedFlags([
    { reference: "REV-ABC123", rule: "sequential", rules: ["sequential"], details: { sequence_docs: 24, docs_today: 30, day_limit: 50, user_email: "reader@example.com", name: "Reader" }, action_taken: "slow", user_type: "lawyer" },
  ]);
  const mail = reviewFlagEmail(flag, "https://example.com/dashboard/admin/security?tab=library_activity");
  assert.match(mail.subject, /REV-ABC123/);
  assert.match(mail.text, /فتح وثائق كثيرة تباعاً بسرعة/);
  assert.match(mail.text, /وثائق متتابعة بسرعة: 24/);
  assert.match(mail.text, /أُبطئت قراءته للمكتبة تلقائياً/);
  assert.match(mail.text, /نوع الحساب: محامٍ/);
  assert.match(mail.html, /dir="rtl"/);
  assert.match(mail.html, /https:\/\/example\.com\/dashboard\/admin\/security\?tab=library_activity/);
  assert.doesNotMatch(mail.text + mail.html, /reader@example\.com|Reader/);
  const noLink = reviewFlagEmail(flag, null);
  assert.doesNotMatch(noLink.html, /<a /);
});
