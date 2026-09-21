/**
 * proxy.membership.test.ts — the edge's second key.
 *
 * Review 2026-09-21 B3 / F08. Run with:
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/proxy.membership.test.ts
 *
 * A source-contract test, the technique
 * `src/app/api/v1/me/invitations/route.test.ts` uses: `src/proxy.ts` imports
 * `next/server` and builds a Supabase client at request time, so it cannot be
 * imported into a unit test and executed. `entityMembershipKindForPath` and
 * the route table CAN be, because they are pure — so the WHICH-PATHS half of
 * this file is executed and only the HOW half is read as text.
 *
 * ── THE DEFECT ─────────────────────────────────────────────────────────────
 * A5/F03 made a roster invitation a real consent decision: the roster routes
 * write `status = 'invited'` and the invited person accepts at
 * POST /api/v1/me/invitations/{kind}/{id}/accept. Accepting makes an
 * `individual` or a `lawyer` an ACTIVE member of a company or a firm WITHOUT
 * changing their own profiles.user_type — membership is additive, and
 * trg_lock_user_type means that column could not be rewritten even if the
 * product wanted to.
 *
 * The browser already knew this: UserTypeGuard asks
 * `isAllowedByTypeOrMembership`. The edge did not. It compared
 * profiles.user_type against the route table and redirected, so the accepted
 * member was bounced off /dashboard/business or /dashboard/firm BEFORE the
 * page — and therefore before that guard — ever rendered. The invitation could
 * be accepted and still lead nowhere.
 *
 * ── WHAT IS PINNED, AND WHY EACH ONE ───────────────────────────────────────
 *   1. WHICH paths consult membership — and, just as load-bearing, which do
 *      not. "Never for others" is a claim, so every other dashboard prefix is
 *      named and asserted null rather than left to a reader's inference.
 *   2. The lookup sits INSIDE the failing branch, immediately after the
 *      allowedTypes comparison. That is the whole cost story: an owner and
 *      anybody else whose type matches never reaches it, so they pay no extra
 *      round trip.
 *   3. It is ONE RLS-scoped read, filtered to the caller's own ACTIVE row.
 *      No service client — this file must never acquire one.
 *   4. Both exits return `supabaseResponse`, the response `setAll` wrote the
 *      refreshed `sb-*` cookies onto. A bare `NextResponse.next()` would drop
 *      them and sign the user out on the next token refresh.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  entityMembershipKindForPath,
  isAllowedByTypeOrMembership,
  type EntityMembershipSummary,
} from "./lib/auth/entityMembership.ts";
import { routeAccessRuleFor, CLIENT_INTAKE_PREFIXES } from "./lib/auth/routeAccess.ts";

const proxySource = readFileSync(new URL("./proxy.ts", import.meta.url), "utf8").replace(
  /\r\n/g,
  "\n",
);

// ── 1. which paths consult membership ───────────────────────────────────────

test("the two entity dashboards are the prefixes a membership can open", () => {
  for (const path of [
    "/dashboard/firm",
    "/dashboard/firm/cases",
    "/dashboard/firm/team",
    "/dashboard/firm/members/abc-123",
  ]) {
    assert.equal(entityMembershipKindForPath(path), "firm", path);
  }
  for (const path of [
    "/dashboard/business",
    "/dashboard/business/cases",
    "/dashboard/business/team",
    "/dashboard/business/documents",
  ]) {
    assert.equal(entityMembershipKindForPath(path), "business", path);
  }
});

test("the shared client intake counts as business context too — deliberately", () => {
  // Not an oversight and not a widening: the intake rule's allowedTypes IS
  // ["individual","corporate"] (routeAccess.ts), and
  // `isAllowedByTypeOrMembership` opens anything admitting `corporate` to an
  // active business member. The edge agreeing with the browser is the entire
  // point of B3; disagreeing on these three would re-open it on the paths a
  // company actually orders through.
  for (const prefix of CLIENT_INTAKE_PREFIXES) {
    assert.equal(entityMembershipKindForPath(prefix), "business", prefix);
    assert.equal(entityMembershipKindForPath(`${prefix}/new`), "business", prefix);
  }
});

test("no other prefix consults membership — named one by one, not inferred", () => {
  // The cost claim and the scope claim are the same claim. Every path here
  // costs nothing extra on a refusal, and none of them can be opened by a
  // membership in some other entity.
  for (const path of [
    "/dashboard",
    "/dashboard/client",
    "/dashboard/client/cases",
    "/dashboard/client/wallet",
    "/dashboard/client/documents",
    "/dashboard/client/find-lawyer",
    "/dashboard/lawyer",
    "/dashboard/lawyer/cases",
    "/dashboard/micro",
    "/dashboard/provider",
    "/dashboard/government",
    "/dashboard/ngo",
    "/dashboard/admin",
    "/dashboard/admin/users",
    "/settings",
    "/onboarding",
    "/api/v1/business/members",
  ]) {
    assert.equal(entityMembershipKindForPath(path), null, path);
  }
});

test("a firm membership never opens a business path, and the reverse", () => {
  const summary: EntityMembershipSummary = { entityId: "e1", entityName: "x", role: "employee" };
  const businessOnly = { business: summary };
  const firmOnly = { firm: summary };

  const firmRule = routeAccessRuleFor("/dashboard/firm");
  const businessRule = routeAccessRuleFor("/dashboard/business");
  assert.ok(firmRule && businessRule);

  assert.equal(isAllowedByTypeOrMembership("lawyer", firmRule.allowedTypes, firmOnly), true);
  assert.equal(isAllowedByTypeOrMembership("lawyer", firmRule.allowedTypes, businessOnly), false);
  assert.equal(
    isAllowedByTypeOrMembership("individual", businessRule.allowedTypes, businessOnly),
    true,
  );
  assert.equal(isAllowedByTypeOrMembership("individual", businessRule.allowedTypes, firmOnly), false);
});

test("the kind the edge looks up is the kind the route rule actually admits", () => {
  // The equivalence the proxy leans on: it asks `entityMembershipKindForPath`
  // ALONE and then trusts the answer, instead of re-deriving it from
  // allowedTypes. That is only sound while every path answering "business"
  // has a rule admitting `corporate` and every path answering "firm" has one
  // admitting `firm`. If ROUTE_ACCESS ever changes underneath, this fails
  // here rather than silently opening a prefix at the edge that the browser
  // guard would still refuse.
  const needed: Record<"firm" | "business", string> = { firm: "firm", business: "corporate" };
  for (const path of [
    "/dashboard/firm",
    "/dashboard/business",
    ...CLIENT_INTAKE_PREFIXES,
  ]) {
    const kind = entityMembershipKindForPath(path);
    assert.ok(kind, path);
    const rule = routeAccessRuleFor(path);
    assert.ok(rule, `${path} must have a route rule`);
    assert.ok(
      (rule.allowedTypes as readonly string[]).includes(needed[kind]),
      `${path} answers "${kind}" but its rule does not admit "${needed[kind]}"`,
    );
  }
});

// ── 2. the lookup is inside the failing branch, after the type comparison ────

test("the edge imports the same helper the browser guard's membership arm uses", () => {
  assert.match(
    proxySource,
    /import \{ entityMembershipKindForPath \} from "@\/lib\/auth\/entityMembership";/,
  );
});

test("the lookup runs only after the allowedTypes comparison has already failed", () => {
  // Nothing but comments may sit between the branch opening and the call. This
  // is what makes "owners and type-matching users pay no extra round trip" a
  // fact about the code rather than an intention: they never enter the branch.
  assert.match(
    proxySource,
    /\(knownType === null \|\| !\(rbacRule\.allowedTypes as readonly string\[\]\)\.includes\(knownType\)\)\n\s*\) \{\n(?:\s*\/\/.*\n)*\s*const membershipKind = entityMembershipKindForPath\(pathname\);/,
  );
});

test("there is exactly one membership lookup on the whole request path", () => {
  assert.equal((proxySource.match(/entityMembershipKindForPath\(/g) ?? []).length, 1);
  assert.equal((proxySource.match(/const membershipKind =/g) ?? []).length, 1);
});

test("no owner lookup was added — owners pass by type and need none", () => {
  // business_profiles is created only for user_type 'corporate' and
  // firm_profiles only for 'firm' (handle_new_user, and sectorRowValuesFor on
  // the Google claim path), and those are exactly the two rules' allowedTypes.
  // An owner is admitted by the comparison above and never reaches the lookup.
  // A second query keyed on owner_user_id here would be dead weight on every
  // refusal.
  //
  // Asserted as the COMPLETE list of tables the edge touches, in order, rather
  // than as the absence of a word: the derivation above appears verbatim in
  // proxy.ts's own comment, so `doesNotMatch(/business_profiles/)` would fail
  // on the prose that explains why the query is unnecessary.
  const tables = [...proxySource.matchAll(/\.from\(([^)]*)\)/g)].map((m) => m[1]);
  assert.deepEqual(tables, [
    '"profiles"',
    'membershipKind === "firm" ? "firm_members" : "business_members"',
  ]);
});

// ── 3. one RLS-scoped read of the caller's own ACTIVE row ───────────────────

test("the read is the caller's own active row, limit 1, on the session client", () => {
  assert.match(
    proxySource,
    /const \{ data: membership, error: membershipError \} = await supabase\n\s*\.from\(membershipKind === "firm" \? "firm_members" : "business_members"\)\n\s*\.select\("id"\)\n\s*\.eq\("user_id", user\.id\)\n\s*\.eq\("status", "active"\)\n\s*\.limit\(1\)\n\s*\.maybeSingle\(\);/,
  );
});

test("an INVITED row opens nothing — only an accepted one does", () => {
  // The status filter is the consent half of A5/F03 at the edge. Without it a
  // company owner could put a stranger on the roster and the stranger's
  // dashboard would open before they had answered anything.
  assert.match(proxySource, /\.eq\("status", "active"\)/);
  assert.doesNotMatch(proxySource, /\.eq\("status", "invited"\)/);
});

test("the edge never acquires a service client", () => {
  assert.doesNotMatch(proxySource, /createServiceClient/);
  assert.doesNotMatch(proxySource, /SERVICE_ROLE/);
  assert.doesNotMatch(proxySource, /service_role/);
});

// ── 4. both exits keep the refreshed session cookies ────────────────────────

test("a failed read fails OPEN, logged, exactly like the profiles read above it", () => {
  assert.match(
    proxySource,
    /if \(membershipError\) \{\n\s*console\.error\("\[rbac\] membership lookup failed \(page branch\)", \{[\s\S]*?\}\);\n\s*return supabaseResponse;\n\s*\}/,
  );
});

test("both exits return supabaseResponse, never a fresh NextResponse.next()", () => {
  // supabaseResponse is the response `setAll` wrote the refreshed sb-* cookies
  // onto. Returning a new one instead drops them, and the user is signed out
  // the moment their access token expires — a failure that looks nothing like
  // its cause.
  assert.match(proxySource, /if \(membership\) return supabaseResponse;/);
  const block = proxySource.slice(
    proxySource.indexOf("const membershipKind = entityMembershipKindForPath(pathname);"),
    proxySource.indexOf("const url = req.nextUrl.clone();", proxySource.indexOf("const membershipKind =")),
  );
  assert.ok(block.length > 0, "membership block not found");
  assert.doesNotMatch(block, /NextResponse\.next\(\)/);
  assert.doesNotMatch(block, /NextResponse\.redirect/);
});

test("the refusal that was already there is still the fall-through", () => {
  // The block adds no redirect target of its own, so proxy.ts's existing
  // no-loop derivation is untouched: it either passes the request through or
  // falls into the redirect that predates it.
  assert.match(
    proxySource,
    /if \(membership\) return supabaseResponse;\n\s*\}\n\n\s*const url = req\.nextUrl\.clone\(\);/,
  );
  assert.match(
    proxySource,
    /url\.pathname = knownType \? dashboardPathFor\(knownType\) : FALLBACK_DASHBOARD_PATH;/,
  );
});
