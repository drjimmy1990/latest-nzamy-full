/**
 * route.test.ts — PATCH /api/v1/firm/members/[memberId] contract.
 * Run with (the brackets are a glob, so run it from its own directory):
 *   cd "src/app/api/v1/firm/members/[memberId]" && node --test route.test.ts
 * `npm run test:unit` picks it up through `src/**\/*.test.ts`.
 *
 * Source-contract style — this route has no pure decision module to import
 * (its role/status vocabulary is inline, unlike the business sibling's
 * `businessMembershipAccess.ts`), so the properties that matter are asserted
 * against the file itself. Written for review 2026-09-21 A5 / F03: the file
 * had no test at all, which is why the consent hole in it went unnoticed.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const routeSource = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
const migrationSource = readFileSync(
  new URL("../../../../../../../supabase/migrations/20260922_02_members_accept_own_invitation.sql", import.meta.url),
  "utf8",
);

// ── CONSENT — review 2026-09-21 A5 / F03 ────────────────────────────────────

test("the owner cannot activate a membership that was never accepted", () => {
  // The bypass in full: POST /api/v1/firm/members {email, role} writes an
  // `invited` row, then PATCH {"status":"active"} here makes the victim a
  // member of the firm without ever asking — and the invitation then
  // disappears from GET /api/v1/me/invitations, so they are not even shown it.
  assert.match(
    routeSource,
    /if \(status === "active" && existingAcceptedAt === null\) \{[\s\S]{0,220}?status: 409/,
  );
  assert.match(routeSource, /لا يمكن تفعيل العضوية قبل أن يقبل المدعوّ الدعوة بنفسه\./);
});

test("the consent check reads the row's CURRENT state, before the update", () => {
  // `accepted_at` has to come from the pre-update lookup: the value in the row
  // the UPDATE returns is already whatever the caller just wrote.
  assert.match(routeSource, /\.from\("firm_members"\)\s*\n\s*\.select\("id, firm_id, user_id, status, accepted_at"\)/);
  const lookup = routeSource.indexOf('.select("id, firm_id, user_id, status, accepted_at")');
  const gate = routeSource.indexOf("existingAcceptedAt === null");
  const update = routeSource.indexOf(".update(patch)");
  assert.ok(lookup > 0, "the pre-update lookup does not read status/accepted_at");
  assert.ok(gate > lookup, "the consent check runs before it has read the row");
  assert.ok(update > gate, "the update runs before the consent check");
});

test("the rule is stated on the target state, so invited → suspended → active is covered too", () => {
  // A check written as «refuse invited → active» would be walked around in two
  // calls. The condition must not mention the row's current status at all.
  const gateLine = /if \(status === "active" && existingAcceptedAt === null\)/.exec(routeSource);
  assert.ok(gateLine, "the consent gate is not in the expected form");
  assert.doesNotMatch(gateLine![0], /existing\.status/);
});

test("the same invariant is enforced in the database, not only here", () => {
  // This route is not the only way to reach the table: `authenticated` holds
  // PostgREST's UPDATE grant, and the owner's RLS arm admits the same PATCH
  // sent straight to /rest/v1/firm_members.
  assert.match(migrationSource, /a membership cannot be active while accepted_at is null/);
  assert.match(migrationSource, /firm_members/);
  assert.match(migrationSource, /jsonb_build_object\('accepted_at', old_j -> 'accepted_at'\)/);
});

// ── the rules this endpoint had before, now pinned ──────────────────────────

test("`invited` is not a status this endpoint may write", () => {
  // An invitation is issued by POST and answered by the invitee. Letting the
  // owner PATCH a row back to `invited` would reset an ACTIVE member to
  // «pending» and silently cancel a consent already given.
  assert.match(routeSource, /PATCHABLE_STATUSES = new Set\(\["active", "suspended", "removed"\]\)/);
  assert.doesNotMatch(routeSource, /PATCHABLE_STATUSES = new Set\(\[[^\]]*"invited"/);
});

test("the firm owner's own row is never editable through this endpoint", () => {
  // firm_profiles.owner_user_id is what every RLS write policy reads
  // (public.is_firm_owner); demoting or removing the matching row would leave
  // the roster and access control disagreeing.
  assert.match(
    routeSource,
    /if \(existing\.user_id === firm\.owner_user_id\) \{[\s\S]{0,200}?status: 403/,
  );
  assert.match(routeSource, /لا يمكن تعديل عضوية صاحب المكتب\./);
});

test("the target row is scoped to the caller's OWN firm on both the read and the write", () => {
  const eqFirm = routeSource.match(/\.eq\("firm_id", firm\.id\)/g) ?? [];
  assert.ok(eqFirm.length >= 2, "the lookup and the update must both be firm-scoped");
  assert.match(routeSource, /\.eq\("owner_user_id", user\.id\)/);
});

test("the service client is created only after BOTH authorization checks", () => {
  const owner = routeSource.indexOf('.eq("owner_user_id", user.id)');
  const rowCheck = routeSource.indexOf('.eq("firm_id", firm.id)');
  const m = /const service = await createServiceClient\(\);/.exec(routeSource);
  assert.ok(m, "no createServiceClient() call found");
  assert.ok(owner > 0, "owner check missing");
  assert.ok(rowCheck > owner, "the row-belongs-to-this-firm check must follow the owner check");
  assert.ok(m!.index > rowCheck, "the service client is created before the row check");
});

test("`profiles` is read only through the narrow projection", () => {
  const projections = [
    ...routeSource.matchAll(/\.from\("profiles"\)\s*\n\s*\.select\(([^)]*)\)/g),
  ].map((x) => x[1].trim());
  assert.deepEqual(projections, ['"id, display_name, email"']);
  assert.doesNotMatch(routeSource, /\.from\("profiles"\)[\s\S]{0,40}?\.select\("\*"\)/);
});

test("the Postgres error map is the repo's: 23514 → 400, 42501 → 403", () => {
  assert.match(routeSource, /error\?\.code === "23514"[\s\S]{0,220}?status: 400/);
  assert.match(routeSource, /error\?\.code === "42501"[\s\S]{0,160}?status: 403/);
});

test("every message this route returns is Arabic", () => {
  const errors = [...routeSource.matchAll(/\{ error: "([^"]+)" \}/g)].map((m) => m[1]);
  assert.ok(errors.length >= 5, `expected several inline error strings, found ${errors.length}`);
  for (const e of errors) {
    assert.ok(/[؀-ۿ]/.test(e), `not Arabic: ${e}`);
  }
  assert.doesNotMatch(routeSource, /قريبًا|قريباً/);
});
