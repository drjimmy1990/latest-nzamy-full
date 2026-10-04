/**
 * route.test.ts — PATCH /api/v1/business/members/[memberId] contract.
 * Run with:
 *   node --test "src/app/api/v1/business/members/[memberId]/route.test.ts"
 *
 * Same two halves as its sibling: the pure decision
 * (`decideBusinessMemberPatch`) and source assertions for the wiring that only
 * exists in the file. WP-6 B-5.
 *
 * The name lookup follows `/api/v1/firm/members/[memberId]`: a server-only
 * `id, display_name, email` projection taken after BOTH authorization checks.
 * ../route.test.ts carries the full statement of the pattern.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  decideBusinessMemberPatch,
  BUSINESS_PATCHABLE_STATUSES,
} from "../../../../../../lib/auth/businessMembershipAccess.ts";

const routeSource = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
const migrationSource = readFileSync(
  new URL("../../../../../../../supabase/migrations/20260922_02_members_accept_own_invitation.sql", import.meta.url),
  "utf8",
);

test("an empty body is a 400, not a no-op 200", () => {
  const d = decideBusinessMemberPatch({});
  assert.equal(d.ok, false);
  if (!d.ok) {
    assert.equal(d.status, 400);
    assert.ok(/[؀-ۿ]/.test(d.error));
  }
});

test("role and status can be changed together or separately", () => {
  assert.deepEqual(decideBusinessMemberPatch({ role: "legal_staff" }), {
    ok: true,
    patch: { role: "legal_staff" },
  });
  assert.deepEqual(decideBusinessMemberPatch({ status: "suspended" }), {
    ok: true,
    patch: { status: "suspended" },
  });
  assert.deepEqual(decideBusinessMemberPatch({ role: "hr_manager", status: "removed" }), {
    ok: true,
    patch: { role: "hr_manager", status: "removed" },
  });
});

test("`removed` is a settable status — removal keeps the row", () => {
  assert.deepEqual([...BUSINESS_PATCHABLE_STATUSES].sort(), ["active", "removed", "suspended"]);
  assert.equal(decideBusinessMemberPatch({ status: "removed" }).ok, true);
});

test("the OWNER route cannot set `invited` — an invitation is issued by POST, not by PATCH", () => {
  // Since review A5/F03 there IS an acceptance flow, and `invited` is a real
  // state — but it is not one this endpoint may write. A new invitation is
  // `POST /api/v1/business/members` (which also re-invites a `removed` row),
  // and the answer is the invitee's own
  // `POST /api/v1/me/invitations/business/{id}/accept|decline`. Letting the
  // owner PATCH a row back to `invited` here would let them reset an ACTIVE
  // member to «pending» and silently cancel a consent already given.
  assert.equal(decideBusinessMemberPatch({ status: "invited" }).ok, false);
});

test("nobody can be PATCHed into the owner role", () => {
  const d = decideBusinessMemberPatch({ role: "owner" });
  assert.equal(d.ok, false);
  if (!d.ok) assert.equal(d.status, 400);
});

test("an unrecognised role or status is refused before Postgres sees it", () => {
  for (const role of ["managing_partner", "", 7, null, "EMPLOYEE"]) {
    assert.equal(decideBusinessMemberPatch({ role }).ok, false, String(role));
  }
  for (const status of ["deleted", "", 1, null, "ACTIVE"]) {
    assert.equal(decideBusinessMemberPatch({ status }).ok, false, String(status));
  }
});

test("the owner's own membership row is never editable through this endpoint", () => {
  // business_profiles.owner_user_id is what every RLS write policy reads
  // (public.is_business_owner). Demoting or removing the matching row would
  // leave the roster and access control disagreeing.
  assert.match(
    routeSource,
    /if \(existing\.user_id === business\.owner_user_id\) \{[\s\S]{0,200}?status: 403/,
  );
  assert.match(routeSource, /cannotEditOwner: "لا يمكن تعديل عضوية مالك الشركة\.",/);
});

test("the target row is scoped to the caller's OWN company on both the read and the write", () => {
  const eqBusiness = routeSource.match(/\.eq\("business_id", business\.id\)/g) ?? [];
  assert.ok(eqBusiness.length >= 2, "the lookup and the update must both be company-scoped");
  assert.match(routeSource, /\.eq\("owner_user_id", user\.id\)/);
});

test("a member who is not the owner is told why, instead of getting a bare 404", () => {
  assert.match(routeSource, /ownerOnly: "إدارة أعضاء الشركة متاحة لمالك الحساب فقط\.",/);
  assert.match(routeSource, /\? NextResponse\.json\(\{ error: AR\.ownerOnly \}, \{ status: 403 \}\)/);
});

test("the service client is created only after BOTH authorization checks", () => {
  // Replaces an earlier "no service_role on this path either". That rule made
  // a colleague's name unreadable — `profiles` RLS admits only
  // `id = auth.uid()` — so this route follows `/api/v1/firm/members/[memberId]`
  // instead: authorize first, then a narrow projection. See ../route.ts's
  // header and ../route.test.ts, which pins the same three properties.
  const owner = routeSource.indexOf('.eq("owner_user_id", user.id)');
  const rowCheck = routeSource.indexOf('.eq("business_id", business.id)');
  const m = /const service = await createServiceClient\(\);/.exec(routeSource);
  assert.ok(m, "no createServiceClient() call found");
  assert.ok(owner > 0, "owner check missing");
  assert.ok(rowCheck > owner, "the row-belongs-to-this-company check must follow the owner check");
  assert.ok(m!.index > rowCheck, "the service client is created before the row check");
});

test("`profiles` is read only through the narrow projection", () => {
  const projections = [
    ...routeSource.matchAll(/\.from\("profiles"\)\s*\n\s*\.select\(([^)]*)\)/g),
  ].map((x) => x[1].trim());
  assert.deepEqual(projections, ['"id, display_name, email"']);
  assert.doesNotMatch(routeSource, /\.from\("profiles"\)[\s\S]{0,40}?\.select\("\*"\)/);
  // …and an unresolved name is still null, never a dash.
  assert.match(routeSource, /displayName: profile\?\.display_name \?\? null,/);
});

test("the route delegates its body validation to the pure decision", () => {
  assert.match(routeSource, /const decision = decideBusinessMemberPatch\(body as \{ role\?: unknown; status\?: unknown \}\);/);
  assert.match(routeSource, /\.update\(decision\.patch\)/);
});

// ── CONSENT — review 2026-09-21 A5 / F03 ────────────────────────────────────
// `decideBusinessMemberPatch` cannot carry this rule: it is pure and never
// sees the row. The check therefore lives in the caller, and these four tests
// are what stop it being quietly deleted again. Writing `invited` at POST time
// closes nothing on its own while THIS endpoint can answer the invitation.

test("the owner cannot activate a membership that was never accepted", () => {
  // The bypass in full: POST /api/v1/business/members {email, role} writes an
  // `invited` row, then PATCH {"status":"active"} here makes the victim a
  // member without ever asking — and the invitation then disappears from
  // GET /api/v1/me/invitations, so they are not even shown it.
  assert.match(
    routeSource,
    /if \(decision\.patch\.status === "active" && existingAcceptedAt === null\) \{[\s\S]{0,160}?status: 409/,
  );
  assert.match(routeSource, /notAcceptedYet: "لا يمكن تفعيل العضوية قبل أن يقبل المدعوّ الدعوة بنفسه\.",/);
  assert.match(routeSource, /\{ error: AR\.notAcceptedYet \}/);
});

test("the consent check reads the row's CURRENT state, before the update", () => {
  // `accepted_at` has to come from the pre-update lookup: the value in the
  // row the UPDATE returns is already whatever the caller just wrote.
  assert.match(routeSource, /\.from\("business_members"\)\s*\n\s*\.select\("id, business_id, user_id, status, accepted_at"\)/);
  const lookup = routeSource.indexOf('.select("id, business_id, user_id, status, accepted_at")');
  const gate = routeSource.indexOf("existingAcceptedAt === null");
  const update = routeSource.indexOf(".update(decision.patch)");
  assert.ok(lookup > 0, "the pre-update lookup does not read status/accepted_at");
  assert.ok(gate > lookup, "the consent check runs before it has read the row");
  assert.ok(update > gate, "the update runs before the consent check");
});

test("the rule is stated on the target state, so invited → suspended → active is covered too", () => {
  // A check written as «refuse invited → active» would be walked around in two
  // calls. The condition must not mention the row's current status at all.
  const gateLine = /if \(decision\.patch\.status === "active" && existingAcceptedAt === null\)/.exec(routeSource);
  assert.ok(gateLine, "the consent gate is not in the expected form");
  assert.doesNotMatch(gateLine![0], /existing\.status/);
});

test("the same invariant is enforced in the database, not only here", () => {
  // This route is not the only way to reach the table: `authenticated` holds
  // PostgREST's UPDATE grant, and the owner's RLS arm admits the same PATCH
  // sent straight to /rest/v1/business_members.
  assert.match(migrationSource, /a membership cannot be active while accepted_at is null/);
  assert.match(migrationSource, /create trigger [^']*before update/i);
  // …and a third party may not forge the evidence either.
  assert.match(migrationSource, /jsonb_build_object\('accepted_at', old_j -> 'accepted_at'\)/);
});
