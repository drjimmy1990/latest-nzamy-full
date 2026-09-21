/**
 * route.test.ts — POST /api/v1/library/invitations/redeem contract. Run with:
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test "src/app/api/v1/library/invitations/redeem/x.test.ts"
 * (replace the x with an asterisk — a glob's asterisk-slash cannot be written
 * inside a block comment, and the literal file path is a glob to the runner.)
 *
 * A source-contract test (the technique
 * src/app/api/v1/business/members/route.test.ts uses): the route imports
 * `next/server`, assertRole and the Supabase service client, so it cannot be
 * imported and executed from `node --test`. The rate-limit half IS executable.
 *
 * What it pins (review 2026-09-21 A3/C01, follow-up 2026-09-22): this route
 * burns a `library.invitations.current_uses` slot BEFORE it grants. Since
 * grantEntitlement started skipping downgrades, a redemption by a user who
 * already holds pro-or-better writes no subscription — so the burned slot must
 * be given back, with the same compare-and-swap the failed-grant path uses, and
 * the answer must not be the 200 that makes
 * src/lib/services/libraryInvitationDisplay.ts print «فُعّلت باقة … حتى …» over
 * a grant that never happened. Passing `replaceActive` instead would re-create
 * A3 through a second door: a 30-day "pro" code cancelling a live "max".
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isStrictRateLimitedRoute } from "../../../../../../lib/rateLimitRoutes.ts";

const routeSource = readFileSync(join(import.meta.dirname, "route.ts"), "utf8");

/**
 * The route with its JSDoc and line comments dropped, so a rule about the CODE
 * is neither satisfied nor broken by prose that merely names the identifier —
 * the route's own header explains at length why `replaceActive` is NOT passed.
 */
function codeOnly(source: string): string {
  return source
    .split(/\r?\n/)
    .filter((line) => {
      const t = line.trimStart();
      return !t.startsWith("*") && !t.startsWith("/*") && !t.startsWith("//");
    })
    .join("\n");
}

// ── 1. the no-downgrade rule is NOT overridden here ─────────────────────────

test("the redeem flow never overrides the no-downgrade rule", () => {
  assert.ok(
    !codeOnly(routeSource).includes("replaceActive"),
    "a self-service code must never cancel a better live subscription — that is review A3/C01 itself",
  );
});

// ── 2. the burned slot is refunded through one shared CAS ───────────────────

test("the refund is a compare-and-swap, written once and shared", () => {
  const helperAt = routeSource.indexOf("async function refundClaimedUse(");
  assert.ok(
    helperAt > -1,
    "the refund is no longer a named helper — the two callers will drift",
  );
  const helperEnd = routeSource.indexOf("\n  }", routeSource.indexOf("console.error", helperAt));
  assert.ok(helperEnd > helperAt, "could not find the end of refundClaimedUse");
  const helper = routeSource.slice(helperAt, helperEnd);
  assert.ok(
    helper.includes(".update({ current_uses: claim.current_uses - 1 })"),
    "the refund no longer decrements the counter",
  );
  assert.ok(
    helper.includes('.eq("current_uses", claim.current_uses)'),
    "the refund lost its CAS guard — an unconditional decrement can erase another redeemer's use",
  );
  assert.equal(
    routeSource.split(".update({ current_uses: claim.current_uses - 1 })").length - 1,
    1,
    "there must be exactly one decrement in this route: the shared helper",
  );
});

test("both a failed grant and a skipped grant refund the use", () => {
  assert.equal(
    routeSource.split("await refundClaimedUse(claimed);").length - 1,
    2,
    "the failure path and the alreadyEntitled path must each give the slot back",
  );
  const failAt = routeSource.indexOf("if (!grant.ok) {");
  const skipAt = routeSource.indexOf("if (grant.alreadyEntitled) {");
  assert.ok(failAt > -1 && skipAt > -1, "one of the two arms is gone");
  assert.ok(failAt < skipAt, "the ok check must narrow the result before alreadyEntitled is read");
});

// ── 3. a skipped grant is a 400, not a fake activation ──────────────────────

test("an alreadyEntitled redemption answers 400 with an Arabic message, before the success payload", () => {
  const skipAt = routeSource.indexOf("if (grant.alreadyEntitled) {");
  const successAt = routeSource.indexOf("const subscription = (grant.detail");
  assert.ok(successAt > -1, "the success payload vanished — re-read this test");
  assert.ok(
    skipAt < successAt,
    "the skip arm must return before tier/until are read off the EXISTING subscription",
  );
  const skipBlock = routeSource.slice(skipAt, successAt);
  assert.ok(skipBlock.includes("status: 400"), "every rejection in this route is a 400");
  assert.ok(
    /error:\s*\n?\s*"[^"]*باقة/.test(skipBlock),
    "the skip arm must carry an Arabic error — apiMutate throws it and the modal shows it verbatim",
  );
  assert.ok(
    skipBlock.includes("كود الدعوة"),
    "the message must tell the user the code was not spent",
  );
  assert.ok(!skipBlock.includes("ok: true"), "a skipped grant must not answer like a success");
});

// ── 4. the counter is still claimed before the grant, under the strict bucket ─

test("the slot is claimed before the grant, so the code cannot be spent twice", () => {
  const claimAt = routeSource.indexOf("claimed = updated;");
  const grantAt = routeSource.indexOf("await grantEntitlement({");
  assert.ok(claimAt > -1 && claimAt < grantAt, "the CAS claim must still precede the grant");
});

test("POST redeem is in the proxy's strict rate-limit bucket", () => {
  assert.equal(isStrictRateLimitedRoute("POST", "/api/v1/library/invitations/redeem"), true);
  assert.equal(isStrictRateLimitedRoute("GET", "/api/v1/library/invitations/redeem"), false);
});
