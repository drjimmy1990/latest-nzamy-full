/**
 * route.test.ts — GET/POST /api/v1/business/members contract. Run with:
 *   node --test src/app/api/v1/business/members/route.test.ts
 *
 * Two halves, the same technique src/app/api/v1/profile/route.test.ts uses,
 * because the route itself cannot be imported in a unit test (it pulls in
 * `next/server` and a Supabase session):
 *   1. the pure decisions, through `@/lib/auth/businessMembershipAccess`;
 *   2. the parts that live only in the source, asserted against the file.
 *
 * WP-6 B-5 (plan §5 Q7). The thing most worth pinning here is the SHAPE of
 * the one service-client read: after the ownership check, never before it, and
 * only ever the `id, display_name, email(, user_type)` projection. The
 * identical assertions run against /api/v1/firm/members in that route's own
 * route.test.ts, because the two routes now follow one pattern.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BUSINESS_ROLE_VALUES,
  BUSINESS_INVITE_ROLE_VALUES,
  BUSINESS_MEMBER_STATUS_VALUES,
  BUSINESS_ROLE_LABEL,
  isBusinessRole,
  isInvitableBusinessRole,
} from "../../../../../lib/auth/businessMembershipAccess.ts";

const routeSource = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
const memberRouteSource = readFileSync(
  new URL("./[memberId]/route.ts", import.meta.url),
  "utf8",
);

test("the role vocabulary is the DDL's nine, exactly", () => {
  // business_members role CHECK — 20260603_phase1_002_entities.sql:303-307.
  assert.deepEqual([...BUSINESS_ROLE_VALUES].sort(), [
    "compliance_officer",
    "department_head",
    "employee",
    "finance_manager",
    "hr_manager",
    "legal_manager",
    "legal_staff",
    "owner",
    "seconded",
  ]);
  assert.equal(BUSINESS_ROLE_VALUES.length, 9);
});

test("the status vocabulary is the DDL's four", () => {
  assert.deepEqual([...BUSINESS_MEMBER_STATUS_VALUES].sort(), [
    "active",
    "invited",
    "removed",
    "suspended",
  ]);
});

test("every role has an Arabic label and none is left to render as a raw key", () => {
  for (const role of BUSINESS_ROLE_VALUES) {
    assert.ok(BUSINESS_ROLE_LABEL[role], role);
    assert.ok(/[؀-ۿ]/.test(BUSINESS_ROLE_LABEL[role]), role);
  }
});

test("`owner` is a real role but is never invitable", () => {
  // The owner's row comes from ensure_business_owner_membership (20260914),
  // derived from business_profiles.owner_user_id. Handing a SECOND account
  // that role would put the roster and the column — which every RLS write
  // policy reads — out of step.
  assert.equal(isBusinessRole("owner"), true);
  assert.equal(isInvitableBusinessRole("owner"), false);
  assert.equal(BUSINESS_INVITE_ROLE_VALUES.includes("owner" as never), false);
  assert.equal(BUSINESS_INVITE_ROLE_VALUES.length, 8);
});

test("a role outside the CHECK is refused before it can become a 23514", () => {
  for (const bad of ["managing_partner", "admin", "", null, undefined, 3, "OWNER"]) {
    assert.equal(isBusinessRole(bad), false, String(bad));
    assert.equal(isInvitableBusinessRole(bad), false, String(bad));
  }
});

// ── the service client: only after the owner check, only as a projection ───
//
// This block replaces an earlier "no service_role anywhere" assertion. That
// rule made invite-by-e-mail impossible to satisfy — `profiles` RLS admits
// only `id = auth.uid()` (20260921_01's allow-list of three), so an RLS-scoped
// lookup can never resolve a colleague (WP-6 report risk #1). The route now
// follows the pattern /api/v1/firm/members has always used, and what is worth
// pinning is the pattern's three parts, not the absence of the key.

/** Byte offset of the first `createServiceClient()` CALL (not the import). */
function firstServiceCallIndex(source: string): number {
  const m = /const service = await createServiceClient\(\);/.exec(source);
  assert.ok(m, "no createServiceClient() call found");
  return m!.index;
}

test("the service client is created only AFTER the RLS-scoped ownership check", () => {
  // GET: resolveCallerBusiness (two RLS reads + the pure scope decision) is
  // what proves this caller belongs to this company. POST: the RLS-scoped
  // business_profiles read keyed on owner_user_id = user.id is what proves
  // they own it. Both must come first, in source order.
  const ownerCheck = routeSource.indexOf(
    "const scope = await resolveCallerBusiness(supabase, user.id);",
  );
  assert.ok(ownerCheck > 0, "GET ownership check missing");
  assert.ok(
    ownerCheck < firstServiceCallIndex(routeSource),
    "a service client is created before the ownership check",
  );

  const postOwnerCheck = routeSource.indexOf('.eq("owner_user_id", user.id)');
  const postServiceCall = routeSource.lastIndexOf(
    "const service = await createServiceClient();",
  );
  assert.ok(postOwnerCheck > 0, "POST ownership check missing");
  assert.ok(postOwnerCheck < postServiceCall, "POST creates the service client too early");
  // …and the guard that turns "no company" into a 404/403 is between them.
  assert.ok(routeSource.indexOf("if (!business) {") < postServiceCall);
});

test("`profiles` is only ever read through the narrow projection", () => {
  // Every `.select(...)` that follows a `.from("profiles")` in either file,
  // whichever client it is on. A full row, or one extra column, fails here.
  const ALLOWED = new Set([
    '"id, display_name, email"',
    '"id, display_name, email, user_type"',
  ]);
  for (const source of [routeSource, memberRouteSource]) {
    const projections = [
      ...source.matchAll(/\.from\("profiles"\)\s*\n\s*\.select\(([^)]*)\)/g),
    ].map((m) => m[1].trim());
    assert.ok(projections.length > 0, "no profiles read found");
    for (const p of projections) assert.ok(ALLOWED.has(p), `unexpected projection: ${p}`);
  }
  // `select("*")` on profiles, in any spelling, is the thing this forbids.
  assert.doesNotMatch(routeSource, /\.from\("profiles"\)[\s\S]{0,40}?\.select\("\*"\)/);
  assert.doesNotMatch(memberRouteSource, /\.from\("profiles"\)[\s\S]{0,40}?\.select\("\*"\)/);
});

test("the roster projection is keyed to the ids business_members already returned", () => {
  // Never an open-ended query: the service client only ever sees ids the
  // RLS-scoped members read above already admitted.
  assert.match(routeSource, /const userIds = \[\.\.\.new Set\(memberRows\.map\(\(r\) => r\.user_id\)\)\];/);
  assert.match(routeSource, /\.select\("id, display_name, email"\)\s*\n\s*\.in\("id", userIds\);/);
});

test("the invite lookup is one e-mail, restricted to account types a company may add", () => {
  assert.match(routeSource, /\.ilike\("email", emailPattern\)/);
  assert.match(routeSource, /\.in\("user_type", \[\.\.\.INVITABLE_ACCOUNT_TYPES\]\)/);
  assert.match(
    routeSource,
    /const INVITABLE_ACCOUNT_TYPES = \["individual", "lawyer", "corporate"\] as const;/,
  );
  // `admin` and the other entity types stay invisible to it, so the 404 cannot
  // be used to discover that an address belongs to one.
  for (const excluded of ["admin", "firm", "provider", "government", "ngo", "micro"]) {
    assert.equal(
      /const INVITABLE_ACCOUNT_TYPES = \[([^\]]*)\]/.exec(routeSource)![1].includes(`"${excluded}"`),
      false,
      excluded,
    );
  }
});

test("the [memberId] sibling uses the same client and the same projection", () => {
  assert.match(memberRouteSource, /import \{ createServiceClient \} from "@\/lib\/supabase\/server";/);
  // Owner check, then the row-belongs-to-this-company check, then the key.
  const owner = memberRouteSource.indexOf('.eq("owner_user_id", user.id)');
  const rowCheck = memberRouteSource.indexOf('.eq("business_id", business.id)');
  const service = firstServiceCallIndex(memberRouteSource);
  assert.ok(owner > 0 && rowCheck > owner && service > rowCheck);
});

test("an unresolved name is null, never a dash that looks like an empty name", () => {
  assert.match(routeSource, /displayName: profile\?\.display_name \?\? null,/);
  assert.doesNotMatch(routeSource, /display_name \|\| "—"/);
});

test("writes are owner-scoped through business_profiles.owner_user_id", () => {
  assert.match(
    routeSource,
    /\.from\("business_profiles"\)\s*\n\s*\.select\("id, owner_user_id"\)\s*\n\s*\.eq\("owner_user_id", user\.id\)/,
  );
  assert.match(routeSource, /canManage: scope\.scope === "owner",/);
});

test("the insert mirrors the firm route: active with accepted_at, never a pending 'invited'", () => {
  // There is no invite e-mail and no acceptance screen anywhere in the
  // product, so a row parked at 'invited' would be an invitation nobody can
  // accept. /api/v1/firm/members POST makes the same choice.
  assert.match(routeSource, /status: "active",\s*\n\s*accepted_at: new Date\(\)\.toISOString\(\),/);
});

test("the three write failures a company owner can actually hit are Arabic, not Postgres codes", () => {
  assert.match(routeSource, /error\?\.code === "23505"[\s\S]{0,200}?alreadyMember/);
  assert.match(routeSource, /error\?\.code === "23514"[\s\S]{0,200}?BUSINESS_INVITE_ROLE_VALUES\.join/);
  assert.match(routeSource, /error\?\.code === "42501"[\s\S]{0,200}?ownerOnly/);
  for (const key of ["loadFailed", "addFailed", "noBusiness", "ownerOnly", "alreadyMember"]) {
    const line = routeSource.split("\n").find((l) => l.trim().startsWith(`${key}:`));
    assert.ok(line, `AR.${key} missing`);
    assert.ok(/[؀-ۿ]/.test(line!), `AR.${key} is not Arabic`);
  }
});

test("a failed read is a 500, never an empty list presented as fact", () => {
  // listRead.ts's rule: «we could not read it» must not render as «there is
  // nothing». A `{ data: [] }` with HTTP 200 on a failed query is exactly the
  // defect that file exists to end.
  assert.match(routeSource, /if \(membersError\) \{[\s\S]{0,300}?status: 500/);
  assert.doesNotMatch(routeSource, /catch[\s\S]{0,80}?return NextResponse\.json\(\{ data: \[\] \}/);
});

test("the GET is open to an active member, and only the owner gets canManage", () => {
  assert.match(routeSource, /const scope = await resolveCallerBusiness\(supabase, user\.id\);/);
  assert.match(routeSource, /if \(!scope\.businessId\)/);
  assert.match(routeSource, /\.eq\("business_id", scope\.businessId\)/);
});

test("the invite lookup matches the e-mail literally — LIKE/PostgREST wildcards are escaped first", () => {
  // review 2026-09-20 MUST FIX 1: `.ilike("email", email.trim())` let an owner post
  // `ahmed%@%` and enumerate other accounts. The raw value must never reach the filter.
  assert.ok(routeSource.includes('import { escapeLikePattern } from "@/lib/services/likePattern"'));
  assert.ok(routeSource.includes("const emailPattern = escapeLikePattern(email.trim());"));
  assert.ok(routeSource.includes('.ilike("email", emailPattern)'));
  assert.ok(!routeSource.includes('.ilike("email", email.trim())'));
  assert.ok(!routeSource.includes('.ilike("email", email)'));
});
