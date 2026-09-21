/**
 * route.test.ts — the source contract of `/api/v1/me/invitations` and its two
 * answer routes. Run with:
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/app/api/v1/me/invitations/route.test.ts
 *
 * Source assertions, the technique `…/business/members/route.test.ts` uses:
 * the routes import `next/server` and a Supabase session, so they cannot be
 * imported into a unit test. `_answer.ts`'s pure exports ARE imported, because
 * they carry no such dependency at module scope beyond `next/server`'s
 * `NextResponse` — so only the file's text is read here as well, and the
 * behaviour those routes have in the database is proved in
 * supabase/tests/rls/members_accept_own_invitation.test.sql.
 *
 * WHAT THIS EXISTS TO PIN (review 2026-09-21 A5 / F03):
 *   1. the answer is written with the caller's OWN RLS-scoped client — there
 *      is no service client on any write path here, ever;
 *   2. the only service client in the feature is the entity-NAME lookup, and
 *      it is created after the RLS-scoped read of the caller's own rows;
 *   3. nothing but the caller's own `invited` rows is ever read or written;
 *   4. a failed read is a 500, never `{ data: [] }`;
 *   5. every error the caller can see is Arabic.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const listSource = read("./route.ts");
const answerSource = read("./_answer.ts");
const acceptSource = read("./[kind]/[id]/accept/route.ts");
const declineSource = read("./[kind]/[id]/decline/route.ts");
const migration = read(
  "../../../../../../supabase/migrations/20260922_02_members_accept_own_invitation.sql",
);

const ARABIC = /[؀-ۿ]/;

// ── 1 + 3. the write is RLS-scoped and own-row only ─────────────────────────

test("no answer path ever touches a service client", () => {
  for (const [name, source] of [
    ["_answer.ts", answerSource],
    ["accept/route.ts", acceptSource],
    ["decline/route.ts", declineSource],
  ] as const) {
    assert.doesNotMatch(source, /createServiceClient/, name);
    assert.doesNotMatch(source, /service_role/, name);
  }
});

test("the answer is one UPDATE, pinned to the caller's own INVITED row", () => {
  // Three filters, all three required: the row, the caller, and the state. RLS
  // says the same thing (20260922_02) — these turn «RLS matched nothing» into
  // a specific Arabic 404 instead of a silent success on zero rows.
  assert.match(
    answerSource,
    /\.update\(patch\)\s*\n\s*\.eq\("id", id\)\s*\n\s*\.eq\("user_id", user\.id\)\s*\n\s*\.eq\("status", "invited"\)/,
  );
  assert.match(answerSource, /const \{ user, supabase \} = auth;/);
  assert.match(answerSource, /\.from\(INVITATION_TABLE\[kind\]\)/);
});

test("accept sets active + accepted_at; decline sets removed and stamps nothing", () => {
  assert.match(
    answerSource,
    /answer === "accept"\s*\n\s*\? \{ status: "active", accepted_at: new Date\(\)\.toISOString\(\) \}\s*\n\s*: \{ status: "removed" \}/,
  );
  // decline must not stamp an acceptance
  assert.doesNotMatch(answerSource, /\{ status: "removed", accepted_at/);
});

test("the two route files are the same handler, differing only in the answer", () => {
  assert.match(acceptSource, /return answerInvitation\(context\.params, "accept"\);/);
  assert.match(declineSource, /return answerInvitation\(context\.params, "decline"\);/);
  for (const source of [acceptSource, declineSource]) {
    assert.match(source, /export async function POST\(/);
    // never a GET: answering an invitation is not a safe method
    assert.doesNotMatch(source, /export async function GET\(/);
  }
});

test("only the two kinds that can actually be invited are routable", () => {
  assert.match(answerSource, /export const INVITATION_KINDS = \["business", "firm"\] as const;/);
  assert.match(
    answerSource,
    /export const INVITATION_TABLE: Record<InvitationKind, string> = \{\s*\n\s*business: "business_members",\s*\n\s*firm: "firm_members",\s*\n\s*\};/,
  );
  // an unknown kind is «no such invitation», not a 500 and not a table name
  assert.match(answerSource, /if \(!isInvitationKind\(kind\)[\s\S]{0,120}?status: 404/);
});

// ── 2. the ONE service client in the feature ────────────────────────────────

test("the listing's only service client is the entity-name lookup, created after the RLS read", () => {
  const rlsRead = listSource.indexOf('.eq("user_id", user.id)');
  const serviceCall = listSource.indexOf("const service = await createServiceClient();");
  assert.ok(rlsRead > 0, "the RLS-scoped own-row read is missing");
  assert.ok(serviceCall > rlsRead, "a service client is created before the RLS-scoped read");
  // exactly one, and only inside the `pending.length > 0` branch
  assert.equal(listSource.split("const service = await createServiceClient();").length - 1, 1);
  assert.match(listSource, /if \(pending\.length > 0\) \{\s*\n\s*const service = await createServiceClient\(\);/);
});

test("the name lookup reads ONE display column, keyed to ids the RLS read returned", () => {
  assert.match(listSource, /\.select\(`id, \$\{shape\.nameColumn\}`\)\s*\n\s*\.in\("id", ids\);/);
  assert.match(listSource, /nameColumn: "company_name_ar"/);
  assert.match(listSource, /nameColumn: "name_ar"/);
  // never a full row, and never an open query on an entity table
  assert.doesNotMatch(listSource, /\.from\(shape\.profilesTable\)[\s\S]{0,60}?\.select\("\*"\)/);
  assert.match(listSource, /const ids = \[\s*\n?\s*\.\.\.new Set\(pending\.filter\(\(p\) => p\.kind === kind\)\.map\(\(p\) => p\.entityId\)\),\s*\n?\s*\];/);
});

test("the membership rows themselves are read with the caller's own client only", () => {
  // The service client must never be the thing that decides WHICH invitations
  // exist — that is the RLS own-row SELECT arm's job.
  assert.doesNotMatch(listSource, /service\s*\n?\s*\.from\(INVITATION_TABLE/);
  assert.match(listSource, /supabase\s*\n\s*\.from\(INVITATION_TABLE\[kind\]\)/);
  assert.match(listSource, /\.eq\("user_id", user\.id\)\s*\n\s*\.eq\("status", "invited"\)/);
});

// ── 4. failures ─────────────────────────────────────────────────────────────

test("a failed invitation read is a 500, never an empty list presented as fact", () => {
  assert.match(listSource, /if \(error\) \{[\s\S]{0,400}?status: 500/);
  assert.doesNotMatch(listSource, /catch[\s\S]{0,120}?return NextResponse\.json\(\{ data: \[\] \}/);
});

test("a failed NAME lookup is not fatal — the invitations were read, the names were not", () => {
  assert.match(listSource, /name lookup failed:[\s\S]{0,200}?return;/);
  assert.match(listSource, /entityName: nameById\.get\(`\$\{kind\}:\$\{entityId\}`\) \?\? null,/);
});

test("the Postgres codes a caller can hit are mapped to the house statuses", () => {
  assert.match(answerSource, /error\.code === "42501"[\s\S]{0,140}?status: 403/);
  assert.match(answerSource, /error\.code === "23514"[\s\S]{0,140}?status: 400/);
  assert.match(answerSource, /error\.code === "23503"[\s\S]{0,140}?status: 400/);
  // a malformed uuid is «no such invitation», not a server fault
  assert.match(answerSource, /error\.code === "22P02"[\s\S]{0,140}?status: 404/);
});

test("zero rows updated is a 404, never a 200 that lets the caller think they joined", () => {
  assert.match(answerSource, /if \(!data\) \{\s*\n\s*return NextResponse\.json\(\{ error: INVITATION_AR\.notFound \}, \{ status: 404 \}\);/);
});

// ── 5. Arabic ───────────────────────────────────────────────────────────────

test("every error string the caller can see is Arabic, and shaped `{ error }`", () => {
  for (const key of ["notFound", "forbidden", "acceptFailed", "declineFailed"]) {
    const line = answerSource.split("\n").find((l) => l.trim().startsWith(`${key}:`));
    assert.ok(line, `INVITATION_AR.${key} missing`);
    assert.ok(ARABIC.test(line!), `INVITATION_AR.${key} is not Arabic`);
  }
  const loadFailed = listSource.split("\n").find((l) => l.trim().startsWith("loadFailed:"));
  assert.ok(loadFailed && ARABIC.test(loadFailed), "the listing's error copy is not Arabic");
  for (const source of [listSource, answerSource]) {
    assert.doesNotMatch(source, /قريبا/);
  }
});

test("the list response is the house `{ data, total }` shape", () => {
  assert.match(listSource, /return NextResponse\.json\(\{ data, total: data\.length \}\);/);
});

// ── the migration this route depends on ─────────────────────────────────────

test("the RLS arm this route relies on exists, and only admits an answer", () => {
  assert.match(migration, /for update to authenticated/);
  assert.match(migration, /using \(user_id = auth\.uid\(\) and status = 'invited'\)/);
  assert.match(
    migration,
    /with check \(user_id = auth\.uid\(\) and status in \('active', 'removed'\)\)/,
  );
  // all four membership tables, each guarded like 20260921_03 guards its blocks
  assert.match(
    migration,
    /array\['firm_members', 'business_members', 'government_members', 'ngo_members'\]/,
  );
  assert.match(migration, /if to_regclass\(fq\) is null then/);
});

test("the migration adds no subquery and no inline entity read (the 42P17 gate stays at 0)", () => {
  // The policy expression itself: no `select` inside it, no `from <entity>`.
  // The whole `create policy` statement, from the format string to the
  // dollar-quote that closes it.
  const policy = /create policy %I on %s[\s\S]*?\$p\$, pol, fq\);/.exec(migration);
  assert.ok(policy, "the policy statement was not found");
  assert.doesNotMatch(policy![0], /\(\s*select/i);
  assert.doesNotMatch(policy![0], /(from|join)\s+(public\.)?(firm|business|government|ngo)_(members|profiles)/i);
  // …and the file verifies that property itself before committing
  assert.match(migration, /42P17 shape/);
  assert.match(migration, /expected 5 \(20260921_03 four \+ the invitee arm\)/);
});

test("the column guard is what stops an invitee accepting as a role they were not offered", () => {
  // RLS filters rows, not columns, and `authenticated` holds the table-level
  // UPDATE grant — so the trigger, not the policy, is what pins `role` and the
  // entity key. Proved end to end in members_accept_own_invitation.test.sql.
  assert.match(migration, /create or replace function public\.entity_member_invitation_answer_guard\(\)/);
  assert.match(migration, /before update on %s for each row execute function public\.entity_member_invitation_answer_guard\(\)/);
  assert.match(migration, /pinned := to_jsonb\(old\)/);
  assert.match(migration, /new := jsonb_populate_record\(new, pinned\);/);
});
