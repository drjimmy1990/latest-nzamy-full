/**
 * Source pins for POST /api/v1/cron/task-reminders and
 * POST /api/v1/cron/contract-payment-reminders (batch l11-remind), and for the
 * firm invitation e-mail in POST /api/v1/firm/invitations. The routes import
 * next/server and the service client, so they cannot run under node --test;
 * the planners, builders and the once-only senders are executed in
 * src/lib/email/{taskReminders,contractPaymentReminders,firmInviteEmail,reminderInApp}.test.ts.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isGeneralRateLimitedApiPath } from "../../../../../lib/rateLimitRoutes.ts";

const tasks = readFileSync(join(import.meta.dirname, "route.ts"), "utf8");
const payments = readFileSync(join(import.meta.dirname, "../contract-payment-reminders/route.ts"), "utf8");
const invites = readFileSync(join(import.meta.dirname, "../../firm/invitations/route.ts"), "utf8");

for (const [name, src, path] of [
  ["task-reminders", tasks, "/api/v1/cron/task-reminders"],
  ["contract-payment-reminders", payments, "/api/v1/cron/contract-payment-reminders"],
] as const) {
  test(`${name}: the cron secret is checked before any database work; not rate-limited`, () => {
    const post = src.slice(src.indexOf("export async function POST("));
    const checkAt = post.indexOf('cronSecretMatches(request.headers.get("x-cron-secret"), process.env.CRON_SECRET)');
    const unauthAt = post.indexOf("status: 401");
    const dbAt = post.indexOf("createServiceClient(");
    assert.ok(checkAt > -1 && unauthAt > checkAt && dbAt > unauthAt);
    assert.equal(isGeneralRateLimitedApiPath("POST", path), false);
    assert.match(src, /export const dynamic = "force-dynamic";/);
  });

  test(`${name}: in-app runs without Resend; e-mail only when configured; both once-only`, () => {
    const post = src.slice(src.indexOf("export async function POST("), src.indexOf("async function sendInApp("));
    // POST itself has no Resend gate — the in-app notices must go out while e-mail is off
    assert.doesNotMatch(post, /emailConfigured/);
    assert.ok(post.indexOf("await sendInApp(") < post.indexOf("await sendEmails("));
    assert.match(src, /await notifyReminderOnce\(/);
    assert.match(src, /await sendReminderOnce\(/);
    assert.doesNotMatch(src, /\bsendEmail\(|recordNotification\(/, "never an unmarked send");
    const mail = src.slice(src.indexOf("async function sendEmails("));
    assert.match(mail, /if \(!emailConfigured\(process\.env\)\) return \{ \.\.\.report, skipped: "email_unavailable" \}/);
    // a database without 20261201_45 stops the run before anything is sent
    assert.match(post, /if \(inApp\.skipped === "schema_missing"\)/);
    assert.match(src, /if \(outcome === "schema_missing"\) return \{ \.\.\.report, skipped: "schema_missing" \}/);
  });
}

test("task-reminders: open tasks due today or tomorrow; assignees re-checked against ACTIVE membership", () => {
  assert.match(tasks, /const today = riyadhDayPlus\(now, 0\);\s*const tomorrow = riyadhDayPlus\(now, 1\);/);
  assert.match(tasks, /\.select\(TASK_REMINDER_COLUMNS\)\s*\.in\("status", \[\.\.\.TASK_OPEN_STATUSES\]\)\s*\.gte\("due_date", today\)\s*\.lte\("due_date", tomorrow\)/);
  assert.match(tasks, /\.from\("firm_members"\)[\s\S]*?\.eq\("status", "active"\)/);
  assert.match(tasks, /kind: "task_due_1d_app", subjectId: p\.task\.id, recipientUserId: p\.userId, dueOn: p\.dueOn/);
  assert.match(tasks, /kind: "task_due_1d", subjectId: p\.task\.id, recipientUserId: p\.userId, dueOn: p\.dueOn/);
  assert.match(tasks, /\["reminders"\]/);
  const fail = tasks.slice(tasks.indexOf('"[cron/task-reminders] firm_members:"'));
  assert.ok(fail.indexOf("activeMembers.clear();") > -1 && fail.indexOf("activeMembers.clear();") < fail.indexOf("break;"));
});

test("owner ٤٥: the e-mail builders get who / when / the date — never the task or installment row", () => {
  assert.match(tasks, /taskEmailMessage\(p\.via, p\.when, p\.dueOn, process\.env, /);
  assert.match(payments, /paymentEmailMessage\(p\.stage, p\.daysLeft, p\.dueOn, p\.contractId, process\.env, /);
  assert.doesNotMatch(tasks + payments, /EmailMessage\([^)]*p\.(task|payment)\b/);
});

test("contract-payment-reminders: unpaid installments in the 30-days-back .. 3-days-ahead window, to the contract's lawyer", () => {
  assert.match(payments, /const from = riyadhDayPlus\(now, -OVERDUE_LOOKBACK_DAYS\);/);
  assert.match(payments, /const to = riyadhDayPlus\(now, PAYMENT_DUE_SOON_DAYS\);/);
  assert.match(payments, /\.select\(CONTRACT_PAYMENT_COLUMNS\)\s*\.in\("status", \[\.\.\.PAYMENT_UNPAID_STATUSES\]\)\s*\.gte\("due_on", from\)\s*\.lte\("due_on", to\)/);
  assert.match(payments, /kind: p\.stage === "overdue" \? "contract_pay_overdue_app" : "contract_pay_due_app"/);
  assert.match(payments, /kind: p\.stage === "overdue" \? "contract_pay_overdue" : "contract_pay_due"/);
  assert.match(payments, /recipientUserId: p\.ownerId/);
  assert.match(payments, /\["reminders", "financial"\]/);
});

test("firm invitation e-mail: shared once-only sender, capped, token never logged or keyed", () => {
  const fn = invites.slice(invites.indexOf("async function emailInvitation("), invites.indexOf("export async function GET("));
  assert.ok(fn.length > 100);
  assert.match(fn, /if \(!emailConfigured\(process\.env\)\) return false;/);
  assert.match(fn, /if \(!message\) return false;/);
  assert.match(fn, /\.eq\("kind", "firm_invite"\)/);
  assert.match(fn, /if \(\(count \?\? 0\) >= FIRM_INVITE_DAILY_CAP\) return false;/);
  assert.match(fn, /kind: "firm_invite",\s*subjectId: firmInviteSubjectId\(input\.firmId, input\.email, input\.invitationId\),\s*recipientUserId: input\.inviterId,/);
  assert.doesNotMatch(invites, /\bsendEmail\(/, "only through the once-only sender");
  // no log line carries the path, the link, the token or the address
  for (const line of invites.split("\n").filter((l) => /console\.(error|warn|info|log)\(/.test(l))) {
    assert.doesNotMatch(line, /\bpath\b|token|link|input\.email|\bemail\b[,)]/, line.trim());
  }
  const post = invites.slice(invites.indexOf("export async function POST("));
  assert.match(post, /const emailed = await emailInvitation\(\{/);
  assert.match(post, /data: \{ id: created\.id, path, expiresAt: created\.expires_at, notified, emailed \}/);
  // the e-mail is sent only after the invitation exists
  assert.ok(post.indexOf("create_firm_team_invitation") < post.indexOf("await emailInvitation("));
});
