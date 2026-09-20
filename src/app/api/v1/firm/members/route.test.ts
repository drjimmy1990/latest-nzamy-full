/**
 * route.test.ts — GET/POST /api/v1/firm/members, and its `[memberId]` sibling.
 * Run with: npm run test:unit
 *
 * Source assertions only, the technique `src/app/api/v1/profile/route.test.ts`
 * and `…/business/members/route.test.ts` use: the routes import `next/server`
 * and a Supabase session, so they cannot be imported into a unit test. The
 * pure half of this endpoint's decisions already has a test of its own
 * (src/lib/auth/firmMembershipAccess.test.ts).
 *
 * WHAT THIS FILE EXISTS TO PIN — this route is the CODEBASE PATTERN for an
 * entity roster, and `/api/v1/business/members` was aligned to it because an
 * RLS-scoped `profiles` lookup can never resolve a colleague (`profiles` RLS
 * admits only `id = auth.uid()` — 20260716, and 20260921_01's allow-list of
 * three). The pattern is only safe as a whole, so all three of its parts are
 * asserted here and, verbatim, in the business route's own route.test.ts:
 *
 *   1. AUTHORIZE FIRST — the service client is created only after an
 *      RLS-scoped read has proved the caller's relationship to this firm.
 *   2. A NARROW PROJECTION — `id, display_name, email` (+ `user_type` on the
 *      invite lookup), never a full row, never `select("*")`.
 *   3. A CLOSED KEY SET — the roster read is `.in("id", userIds)` for exactly
 *      the ids `firm_members` already returned; the invite lookup is one
 *      e-mail, restricted to the account types a firm may add.
 *
 * If a later edit moves `createServiceClient()` above an ownership check, or
 * widens a projection, these tests fail rather than the leak being noticed in
 * review.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// route.ts is a CRLF file (its `[memberId]` sibling is not). Line endings are
// normalised so the multi-line patterns below describe the code, not the
// terminator it happens to carry.
const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const routeSource = read("./route.ts");
const memberRouteSource = read("./[memberId]/route.ts");

/** Byte offset of the first `createServiceClient()` CALL, never the import. */
function firstServiceCallIndex(source: string): number {
  const m = /const service = await createServiceClient\(\);/.exec(source);
  assert.ok(m, "no createServiceClient() call found");
  return m!.index;
}

test("the service client is created only AFTER the RLS-scoped membership check", () => {
  // GET: resolveCallerFirm is the RLS-scoped read that proves the caller owns
  // this firm or holds an active membership in it, and the view-role gate
  // follows it. Both precede the key, in source order.
  const callerFirm = routeSource.indexOf(
    "const { data: callerFirm, error: firmError } = await resolveCallerFirm(supabase, user.id);",
  );
  const viewGate = routeSource.indexOf("FIRM_TEAM_VIEW_ROLES.has(callerFirm.role)");
  const serviceCall = firstServiceCallIndex(routeSource);
  assert.ok(callerFirm > 0, "GET membership check missing");
  assert.ok(callerFirm < viewGate, "the view-role gate runs before the membership read");
  assert.ok(viewGate < serviceCall, "a service client is created before the 403 gate");

  // POST: the owner read keyed on owner_user_id = user.id, and the 404 that
  // acts on it, both precede the invite lookup's key.
  const ownerCheck = routeSource.indexOf("await resolveOwnFirm(supabase, user.id)");
  const notFound = routeSource.indexOf("if (!firm) {");
  const postServiceCall = routeSource.lastIndexOf("const service = await createServiceClient();");
  assert.ok(ownerCheck > 0, "POST ownership check missing");
  assert.ok(ownerCheck < notFound && notFound < postServiceCall);
});

test("`profiles` is only ever read through the narrow projection", () => {
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
  assert.doesNotMatch(routeSource, /\.from\("profiles"\)[\s\S]{0,40}?\.select\("\*"\)/);
  assert.doesNotMatch(memberRouteSource, /\.from\("profiles"\)[\s\S]{0,40}?\.select\("\*"\)/);
});

test("the roster projection is keyed to the ids firm_members already returned", () => {
  assert.match(routeSource, /const userIds = \[\.\.\.new Set\(memberRows\.map\(r => r\.user_id\)\)\];/);
  assert.match(routeSource, /\.select\("id, display_name, email"\)\s*\n\s*\.in\("id", userIds\);/);
});

test("the invite lookup is one e-mail, restricted to the account types a firm may add", () => {
  // `user_type` is in the projection because it is what the lookup filters on
  // — so the 404 reads the same whether or not the address belongs to a
  // client, an admin or another entity.
  assert.match(routeSource, /\.ilike\("email", emailPattern\)/);
  assert.match(routeSource, /\.in\("user_type", \["lawyer", "individual"\]\)/);
});

test("the [memberId] sibling uses the same client and the same projection", () => {
  assert.match(memberRouteSource, /import \{ createServiceClient \} from "@\/lib\/supabase\/server";/);
  const owner = memberRouteSource.indexOf('.eq("owner_user_id", user.id)');
  const rowCheck = memberRouteSource.indexOf('.eq("firm_id", firm.id)');
  const service = firstServiceCallIndex(memberRouteSource);
  assert.ok(owner > 0, "owner check missing");
  assert.ok(rowCheck > owner, "the row-belongs-to-this-firm check runs before the owner check");
  assert.ok(service > rowCheck, "the service client is created before the row check");
});

test("the writes a firm owner can actually fail are Arabic, not Postgres codes", () => {
  assert.match(routeSource, /error\?\.code === "23505"[\s\S]{0,200}?عضو في المكتب مسبقا/);
  assert.match(routeSource, /error\?\.code === "23514"[\s\S]{0,200}?FIRM_ROLE_VALUES\.join/);
  assert.match(routeSource, /error\?\.code === "42501"[\s\S]{0,200}?غير مصرح/);
});

test("a failed read is a 500, never an empty list presented as fact", () => {
  // listRead.ts's rule: «we could not read it» must not render as «there is
  // nothing». Unlike the business roster, a failed name projection here is
  // fatal — this route's DTO has no null to mean "unresolved", it falls back
  // to "—", so a silent failure would be indistinguishable from empty names.
  assert.match(routeSource, /if \(membersError\) \{[\s\S]{0,300}?status: 500/);
  assert.match(routeSource, /if \(profileError\) \{[\s\S]{0,300}?status: 500/);
  assert.doesNotMatch(routeSource, /catch[\s\S]{0,80}?return NextResponse\.json\(\{ data: \[\] \}/);
});

test("the firm invite lookup matches the e-mail literally — LIKE/PostgREST wildcards are escaped first", () => {
  assert.ok(routeSource.includes('import { escapeLikePattern } from "@/lib/services/likePattern"'));
  assert.ok(routeSource.includes("const emailPattern = escapeLikePattern(email.trim());"));
  assert.ok(routeSource.includes('.ilike("email", emailPattern)'));
  assert.ok(!routeSource.includes('.ilike("email", email.trim())'));
});
