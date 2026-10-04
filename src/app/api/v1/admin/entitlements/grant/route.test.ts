/**
 * route.test.ts — POST /api/v1/admin/entitlements/grant contract. Run with:
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test "src/app/api/v1/admin/entitlements/grant/*.test.ts"
 *
 * A source-contract test (the technique
 * src/app/api/v1/business/members/route.test.ts uses): the route imports
 * `next/server` and a Supabase session, so it cannot be imported and executed
 * from `node --test`.
 *
 * What it pins (review 2026-09-21 A3/C01, follow-up 2026-09-22): grantEntitlement
 * now SKIPS a plan grant that would downgrade the user. That is right for the
 * self-service flows and wrong here — this route is the tool an admin uses to
 * move a user deliberately, and granting the `free` tier is the only revoke
 * there is. Without `replaceActive: true` every revoke, and every equal-tier
 * grant, would answer 200 while writing nothing, under a console toast that
 * says «تم تنفيذ المنحة بنجاح».
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const routeSource = readFileSync(join(import.meta.dirname, "route.ts"), "utf8");

/** The object literal handed to grantEntitlement(). */
function grantCallBlock(source: string): string {
  const callAt = source.indexOf("await grantEntitlement({");
  assert.ok(callAt > -1, "the route no longer calls grantEntitlement");
  const endAt = source.indexOf("\n  });", callAt);
  assert.ok(endAt > callAt, "could not find the end of the grantEntitlement call");
  return source.slice(callAt, endAt);
}

test("the admin grant overrides the no-downgrade rule", () => {
  assert.ok(
    grantCallBlock(routeSource).includes("replaceActive: true"),
    "without the override an admin granting `free` (the revoke) or an equal tier silently no-ops behind a 200",
  );
});

test("the override is not taken from the request body", () => {
  // src/app/dashboard/admin/entitlements/page.tsx:66-76 builds the body from
  // { userId, action, tier, durationDays, amount, description } and sends no
  // such flag, so a passthrough would leave exactly the silent no-op in place.
  const bodyTypeAt = routeSource.indexOf("let body: {");
  assert.ok(bodyTypeAt > -1, "the request body type declaration moved");
  const bodyTypeEnd = routeSource.indexOf("};", bodyTypeAt);
  assert.ok(bodyTypeEnd > bodyTypeAt, "the request body type declaration has no end");
  assert.ok(
    !routeSource.slice(bodyTypeAt, bodyTypeEnd).includes("replaceActive"),
    "replaceActive must not be declared on the request body type",
  );
  assert.ok(
    !routeSource.includes("body.replaceActive"),
    "replaceActive must not be read from the body",
  );
});

test("the route still refuses a non-admin before granting anything", () => {
  const gateAt = routeSource.indexOf("await requireAdmin()");
  const grantAt = routeSource.indexOf("await grantEntitlement({");
  assert.ok(gateAt > -1, "requireAdmin is gone — this route writes with the service-role client");
  assert.ok(gateAt < grantAt, "the admin gate must run before the grant");
});

test("a failed grant is a 400 with the Arabic error, not a silent success", () => {
  assert.ok(
    routeSource.includes("if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });"),
    "the failure arm changed — the console prints json.error verbatim",
  );
});
