/**
 * route.test.ts — source contract for POST /api/v1/cron/library-grant-reminders
 * (owner note ١٨ C06). The route imports next/server and the service client,
 * so it cannot run under `node --test`; its wiring is pinned in the source.
 * The planner is executed in src/lib/libraryAccessReminders.test.ts and the
 * table in supabase/migrations/20261030_66_library_grant_reminders.sql.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isGeneralRateLimitedApiPath } from "../../../../../lib/rateLimitRoutes.ts";

const src = readFileSync(join(import.meta.dirname, "route.ts"), "utf8");
const sql = readFileSync(
  join(import.meta.dirname, "../../../../../../supabase/migrations/20261030_66_library_grant_reminders.sql"),
  "utf8",
);

test("the cron secret is checked (timing-safe helper) before any database work", () => {
  const post = src.slice(src.indexOf("export async function POST("));
  const checkAt = post.indexOf('cronSecretMatches(request.headers.get("x-cron-secret"), process.env.CRON_SECRET)');
  assert.ok(checkAt > -1);
  assert.ok(post.indexOf("status: 401") > checkAt);
  assert.ok(post.indexOf("createServiceClient(") > post.indexOf("status: 401"));
  assert.equal(isGeneralRateLimitedApiPath("POST", "/api/v1/cron/library-grant-reminders"), false);
});

test("candidates are bounded and skip revoked grants; chains are read in chunks", () => {
  assert.match(src, /\.is\("revoked_at", null\)\s*\.gt\("ends_at", nowIso\)\s*\.lte\("ends_at", horizonIso\)/);
  assert.match(src, /\.limit\(REMINDER_CANDIDATE_LIMIT\)/);
  assert.match(src, /\.in\("user_id", userIds\.slice\(i, i \+ ID_CHUNK\)\)/);
  assert.match(src, /const ID_CHUNK = 300;/);
  assert.match(src, /planLibraryReminders\(rows, now\)/);
});

test("idempotent: the marker is inserted first (ignore duplicates) and the notice goes out only for a new marker", () => {
  const loop = src.slice(src.indexOf("for (const r of due)"));
  const upsertAt = loop.indexOf('.from("library_grant_reminders")');
  const ignoreAt = loop.indexOf('{ onConflict: "grant_id,offset_days", ignoreDuplicates: true }');
  const skipAt = loop.indexOf("if (!inserted || inserted.length === 0)");
  const notifyAt = loop.indexOf("await recordNotification(");
  assert.ok(upsertAt > -1 && ignoreAt > upsertAt, "marker with ON CONFLICT DO NOTHING");
  assert.ok(skipAt > ignoreAt && notifyAt > skipAt, "an existing marker → no notice");
  assert.equal(src.split("recordNotification(").length - 1, 1, "one notice call, inside the loop");
});

test("before the SQL runs: 200 schema_missing and nothing sent", () => {
  assert.match(src, /const SCHEMA_MISSING = new Set\(\["42P01", "PGRST205", "42703", "PGRST204"\]\)/);
  assert.match(src, /skipped: "schema_missing"/);
});

test("migration 66: the primary key is the idempotency, the table is service role only, and it checks itself", () => {
  assert.match(sql, /primary key \(grant_id, offset_days\)/);
  assert.match(sql, /check \(offset_days in \(7, 3\)\)/);
  assert.match(sql, /references public\.library_access_grants\(id\) on delete cascade/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on public\.library_grant_reminders from public, anon, authenticated;/);
  assert.doesNotMatch(sql, /create policy/i);
  assert.match(sql, /^begin;$/m);
  assert.match(sql, /^commit;$/m);
  assert.match(sql, /20261030_66 verify:/);
  assert.match(sql, /as server_can_write;\s*$/);
});

test("e-mail (step 4): after the in-app loop, its own once-only rows, never stopping the in-app answer", () => {
  const post = src.slice(src.indexOf("export async function POST("), src.indexOf("async function sendLibraryReminderEmails("));
  const loopAt = post.indexOf("for (const r of due)");
  const emailAt = post.indexOf("const email = await sendLibraryReminderEmails(admin, due, now);");
  assert.ok(loopAt > -1 && emailAt > loopAt, "the e-mail step runs after the in-app notices");
  assert.match(post, /return NextResponse\.json\(\{ ok: true, candidates: userIds\.length, due: due\.length, sent, already, errors, email \}\);/);
  const step = src.slice(src.indexOf("async function sendLibraryReminderEmails("));
  assert.match(step, /if \(!emailConfigured\(process\.env\)\) return \{ \.\.\.report, skipped: "email_unavailable" \};/);
  assert.match(step, /loadEmailRecipients\(admin, due\.map\(\(r\) => r\.userId\), \["renewal"\]\)/);
  assert.match(step, /await sendReminderOnce\(admin, key, \{ to, \.\.\.libraryEmailMessage\(r, now\) \}\)/);
  assert.match(step, /if \(outcome === "schema_missing"\) return \{ \.\.\.report, skipped: "schema_missing" \};/);
  assert.doesNotMatch(step, /NextResponse/, "the e-mail step returns a report, never the route's answer");
  assert.doesNotMatch(src, /\bsendEmail\(/);
});
