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
 * What it pins:
 *   - Owner answers ٢٠١–٢٠٣ (2026-10-18): a code grants the LIBRARY, for 30
 *     days — a `lib-invite` row in library_access_grants with source
 *     'invite_code' — and no longer a "pro" subscription through
 *     grantEntitlement. The success payload says so (`tier: "library"`,
 *     `days`), so src/lib/services/libraryInvitationDisplay.ts prints the
 *     library sentence instead of «فُعّلت باقة Pro …».
 *   - The route burns a `library.invitations.current_uses` slot BEFORE it
 *     grants, so a failed grant gives the slot back with one shared
 *     compare-and-swap (review 2026-09-21 A3/C01). The old second refund, for
 *     a grant grantEntitlement SKIPPED as a downgrade, is gone with the call
 *     itself: a library grant is its own row, cancels nothing, and has no
 *     skipped outcome.
 *   - A failed grant (the grants table may not exist yet — deploy order) is a
 *     400 in Arabic, never a 500 and never the raw English/Postgres error.
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
 * the route's own header explains why there is no `pro` and no skipped grant.
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

const GRANT_CALL = "await grantLibraryAccess({";

/** The object literal handed to grantLibraryAccess(). */
function grantCallBlock(source: string): string {
  const callAt = source.indexOf(GRANT_CALL);
  assert.ok(callAt > -1, "the route no longer calls grantLibraryAccess");
  const endAt = source.indexOf("});", callAt);
  assert.ok(endAt > callAt, "could not find the end of the grantLibraryAccess call");
  return source.slice(callAt, endAt);
}

// ── 1. a code grants the library for 30 days, never "pro" ───────────────────

test("redeem writes a 30-day lib-invite library grant", () => {
  const code = codeOnly(routeSource);
  assert.ok(code.includes("const REDEEM_LIBRARY_DAYS = 30;"), "a code's library window is 30 days");
  const call = grantCallBlock(code);
  assert.ok(call.includes("userId,"), "the grant goes to the signed-in caller");
  assert.ok(call.includes('planRef: "lib-invite"'), "an invitation code's grant is plan 'lib-invite'");
  assert.ok(call.includes("days: REDEEM_LIBRARY_DAYS"), "the grant lasts the 30 days");
  assert.ok(call.includes('source: "invite_code"'), "the grant's source is 'invite_code'");
});

test("redeem no longer grants pro or writes a subscription", () => {
  const code = codeOnly(routeSource);
  assert.ok(!code.includes("grantEntitlement"), "grantEntitlement writes a `subscriptions` row — a code is the library only");
  assert.ok(!code.includes('"pro"'), "no pro tier survives in the redeem flow");
  assert.ok(!code.includes("ServerTier"), "a code carries no plan tier any more");
  assert.ok(!code.includes("replaceActive"), "a self-service code must never cancel a live subscription — review A3/C01");
});

// ── 2. the burned slot is refunded through one shared CAS ───────────────────

test("the refund is a compare-and-swap, written once and shared", () => {
  const helperAt = routeSource.indexOf("async function refundClaimedUse(");
  assert.ok(helperAt > -1, "the refund is no longer a named helper");
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

test("a failed grant refunds the use, answers 400 in Arabic, and hides the raw error", () => {
  const code = codeOnly(routeSource);
  assert.equal(
    code.split("await refundClaimedUse(claimed);").length - 1,
    1,
    "exactly one refund: the failed grant (a library grant has no skipped outcome)",
  );
  const failAt = code.indexOf("if (!grant.ok) {");
  const refundAt = code.indexOf("await refundClaimedUse(claimed);");
  const successAt = code.indexOf("ok: true");
  assert.ok(failAt > -1, "the route no longer checks its grant");
  assert.ok(
    failAt < refundAt && refundAt < successAt,
    "the refund belongs to the failure arm, before the success payload",
  );
  const block = code.slice(failAt, successAt);
  assert.ok(
    block.includes("status: 400"),
    "a failed grant (the table may be missing) is a 400 like every rejection here, never a 500",
  );
  assert.ok(!block.includes("status: 500"));
  assert.ok(/error:\s*"[^"]*المكتبة/.test(block), "the failure must be Arabic and name the library");
  assert.ok(
    !block.includes("grant.error"),
    "the grant's error is English or raw Postgres — apiMutate shows `error` verbatim",
  );
});

// ── 3. the success payload says library, 30 days, and the real end ──────────

test("the success payload names the library, its days, and the grant's own end", () => {
  const code = codeOnly(routeSource);
  const successAt = code.indexOf("ok: true");
  assert.ok(successAt > -1, "the success payload vanished — re-read this test");
  const payload = code.slice(successAt, code.indexOf("});", successAt));
  assert.ok(
    payload.includes('tier: "library"'),
    "the payload must not say pro: the modal turns `tier` into its sentence",
  );
  assert.ok(payload.includes("days: REDEEM_LIBRARY_DAYS"), "the modal says how long the library is open");
  assert.ok(payload.includes("until: grant.endsAt"), "the end date is the inserted grant's own");
});

// ── 4. the counter is still claimed before the grant, under the strict bucket ─

test("the slot is claimed before the grant, so the code cannot be spent twice", () => {
  const claimAt = routeSource.indexOf("claimed = updated;");
  const grantAt = routeSource.indexOf(GRANT_CALL);
  assert.ok(claimAt > -1 && claimAt < grantAt, "the CAS claim must still precede the grant");
});

test("POST redeem is in the proxy's strict rate-limit bucket", () => {
  assert.equal(isStrictRateLimitedRoute("POST", "/api/v1/library/invitations/redeem"), true);
  assert.equal(isStrictRateLimitedRoute("GET", "/api/v1/library/invitations/redeem"), false);
});
