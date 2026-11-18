/**
 * Source pins for POST /api/v1/cron/hearing-reminders and
 * POST /api/v1/cron/poa-reminders (reminder e-mails). The routes import
 * next/server and the service client, so they cannot run under node --test;
 * the planners and the once-only sender are executed in src/lib/email/*.test.ts.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isGeneralRateLimitedApiPath } from "../../../../../lib/rateLimitRoutes.ts";

const hearing = readFileSync(join(import.meta.dirname, "route.ts"), "utf8");
const poa = readFileSync(join(import.meta.dirname, "../poa-reminders/route.ts"), "utf8");

for (const [name, src, path] of [
  ["hearing-reminders", hearing, "/api/v1/cron/hearing-reminders"],
  ["poa-reminders", poa, "/api/v1/cron/poa-reminders"],
] as const) {
  test(`${name}: the cron secret is checked first, then e-mail availability, before any database work`, () => {
    const post = src.slice(src.indexOf("export async function POST("));
    const checkAt = post.indexOf('cronSecretMatches(request.headers.get("x-cron-secret"), process.env.CRON_SECRET)');
    const unauthAt = post.indexOf("status: 401");
    const availAt = post.indexOf("if (!emailConfigured(process.env))");
    const dbAt = post.indexOf("createServiceClient(");
    assert.ok(checkAt > -1 && unauthAt > checkAt, "401 on a wrong secret");
    assert.ok(availAt > unauthAt && dbAt > availAt, "no Resend → nothing read, nothing written");
    assert.match(post, /skipped: "email_unavailable"/);
    assert.equal(isGeneralRateLimitedApiPath("POST", path), false);
  });

  test(`${name}: every e-mail goes through the once-only sender, and a missing log table stops the run`, () => {
    assert.match(src, /await sendReminderOnce\(/);
    assert.doesNotMatch(src, /\bsendEmail\(/, "never the raw sender: that would skip the once-only row");
    assert.match(src, /if \(outcome === "schema_missing"\) return NextResponse\.json\(\{ \.\.\.report, skipped: "schema_missing" \}\)/);
    assert.match(src, /loadEmailRecipients\(admin,/);
    assert.match(src, /export const dynamic = "force-dynamic";/);
  });
}

test("hearing-reminders: tomorrow's scheduled hearings, assignees re-checked against ACTIVE firm membership", () => {
  assert.match(hearing, /const tomorrow = riyadhDayPlus\(now, 1\);/);
  assert.match(hearing, /\.eq\("status", "scheduled"\)\s*\.eq\("hearing_date", tomorrow\)/);
  assert.match(hearing, /\.from\("firm_members"\)[\s\S]*?\.eq\("status", "active"\)/);
  assert.match(hearing, /hearingEmailRecipients\(h, activeMembers\)/);
  assert.match(hearing, /kind: "hearing_1d", subjectId: p\.h\.id, recipientUserId: p\.userId, dueOn: p\.h\.hearing_date/);
  assert.match(hearing, /\["hearing"\]/, "the «hearing» category mutes it");
  // a failed membership read drops the assignees, never the owners
  const fail = hearing.slice(hearing.indexOf('"[cron/hearing-reminders] firm_members:"'));
  assert.ok(fail.indexOf("activeMembers.clear();") > -1 && fail.indexOf("activeMembers.clear();") < fail.indexOf("break;"));
});

test("owner ٤٥: the routes never read case or client columns for the e-mails", () => {
  assert.match(hearing, /\.from\("hearings"\)\s*\/\/[^\n]*\n\s*\.select\(HEARING_EMAIL_COLUMNS\)/);
  assert.match(poa, /\.from\("contracts"\)\s*\/\/[^\n]*\n\s*\.select\(POA_EMAIL_COLUMNS\)/);
  const hearingLib = readFileSync(join(import.meta.dirname, "../../../../../lib/email/hearingEmailReminders.ts"), "utf8");
  const poaLib = readFileSync(join(import.meta.dirname, "../../../../../lib/email/poaEmailReminders.ts"), "utf8");
  const cols = (src: string, name: string) => /"([^"]+)"/.exec(src.slice(src.indexOf(`export const ${name} =`)))?.[1] ?? "";
  for (const c of ["title", "court_name", "location", "hearing_time"]) {
    assert.equal(cols(hearingLib, "HEARING_EMAIL_COLUMNS").split(/,\s*/).includes(c), false, `hearings: no ${c}`);
  }
  for (const c of ["title", "counterparty_name", "client_id"]) {
    assert.equal(cols(poaLib, "POA_EMAIL_COLUMNS").split(/,\s*/).includes(c), false, `contracts: no ${c}`);
  }
  assert.ok(cols(hearingLib, "HEARING_EMAIL_COLUMNS").includes("hearing_date"));
  assert.ok(cols(poaLib, "POA_EMAIL_COLUMNS").includes("ends_on"));
});

test("poa-reminders: power-of-attorney contracts, not ended, ending within 30 days, owner only", () => {
  assert.match(poa, /\.eq\("contract_type", "power_of_attorney"\)/);
  assert.match(poa, /\.not\("status", "in", `\(\$\{POA_ENDED_STATUSES\.join\(","\)\}\)`\)/);
  assert.match(poa, /\.gte\("ends_on", today\)\s*\.lte\("ends_on", horizon\)/);
  assert.match(poa, /kind: r\.offset === 7 \? "poa_7d" : "poa_30d"/);
  assert.match(poa, /\["reminders"\]/);
});
