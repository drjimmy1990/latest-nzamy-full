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
 *   - Owner answers ٢٠١–٢٠٣ (2026-10-18): a code grants the LIBRARY — a
 *     `lib-invite` row in library_access_grants with source 'invite_code' —
 *     for the code's own grant_days (owner q378, 20261103_11), 30 when the
 *     code has none or the column is not there yet — and no longer a "pro"
 *     subscription through
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

// ── 1. a code grants the library for its own days (30 by default), never "pro" ─

test("redeem writes a lib-invite library grant for the code's own grant_days, 30 when it has none (q378)", () => {
  const code = codeOnly(routeSource);
  assert.ok(!code.includes("REDEEM_LIBRARY_DAYS"), "the fixed 30-day constant is gone: a code carries its own days");
  assert.ok(
    code.includes("claimedDays = row.grant_days ?? DEFAULT_INVITE_GRANT_DAYS;"),
    "the claimed code's grant_days, or the default 30 (DEFAULT_INVITE_GRANT_DAYS)",
  );
  const claimAt = code.indexOf("claimed = updated;");
  const daysAt = code.indexOf("claimedDays = row.grant_days ?? DEFAULT_INVITE_GRANT_DAYS;");
  assert.ok(daysAt > -1 && daysAt < claimAt, "the days are those of the row this attempt claimed (same loop round)");
  const call = grantCallBlock(code);
  assert.ok(call.includes("userId,"), "the grant goes to the signed-in caller");
  assert.ok(call.includes('planRef: "lib-invite"'), "an invitation code's grant is plan 'lib-invite'");
  assert.ok(call.includes("days: claimedDays"), "the grant lasts the code's days");
  assert.ok(call.includes('source: "invite_code"'), "the grant's source is 'invite_code'");
});

test("redeem reads grant_days, and before 20261103_11 re-reads without it (a code then gives 30 days)", () => {
  const code = codeOnly(routeSource);
  assert.ok(code.includes("read(LIBRARY_INVITATION_SELECT_V2)"), "the lookup names grant_days");
  assert.ok(code.includes('isMissingColumnError(') && code.includes('"grant_days"'), "a missing column is detected by name");
  assert.ok(code.includes("read(LIBRARY_INVITATION_SELECT)"), "the fallback read has no grant_days");
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
  const response = block.slice(block.indexOf("return NextResponse.json("));
  assert.ok(
    !response.includes("grant.error"),
    "the grant's error is English or raw Postgres — apiMutate shows `error` verbatim",
  );
  assert.ok(
    /console\.error\([^)]*grant\.error\)/.test(block),
    "the hidden error must still be logged, since the user never sees it",
  );
});

// ── 3. the success payload says library, the code's days, and the real end ──

test("the success payload names the library, its days, and the grant's own end", () => {
  const code = codeOnly(routeSource);
  const successAt = code.indexOf("ok: true");
  assert.ok(successAt > -1, "the success payload vanished — re-read this test");
  const payload = code.slice(successAt, code.indexOf("});", successAt));
  assert.ok(
    payload.includes('tier: "library"'),
    "the payload must not say pro: the modal turns `tier` into its sentence",
  );
  assert.ok(payload.includes("days: claimedDays"), "the modal says how long the library is open — the code's own days");
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

// ── 5. one grant per account: the one-transaction redeem (20261109_10, SAST-02) ─

/** The body of redeemAtomically (from its declaration to the end of the file). */
function atomicHelper(source: string): string {
  const at = source.indexOf("async function redeemAtomically(");
  assert.ok(at > -1, "the one-transaction redeem helper is gone");
  return source.slice(at);
}

test("the route tries the one-transaction redeem first, before the old seat claim", () => {
  const code = codeOnly(routeSource);
  const callAt = code.indexOf("await redeemAtomically(admin, userId, code)");
  const loopAt = code.indexOf("for (let attempt = 0;");
  assert.ok(callAt > -1, "POST no longer calls redeemAtomically");
  assert.ok(callAt < loopAt, "the atomic redeem must run before the old claim loop");
  assert.ok(code.includes("if (atomic) return atomic;"), "an answer from the atomic redeem is final");
  const helper = atomicHelper(code);
  assert.ok(
    helper.includes('admin.rpc("redeem_library_invitation", { p_user: userId, p_code: code })'),
    "the RPC gets the signed-in caller's id and the normalized code",
  );
});

test("the old flow runs ONLY while 20261109_10 is missing — any other error is answered, not retried", () => {
  const code = codeOnly(routeSource);
  assert.ok(
    /function isMissingRedeemFunction[\s\S]*?"PGRST202"[\s\S]*?"42883"[\s\S]*?"42P01"/.test(code),
    "missing function / table codes are the fallback trigger",
  );
  const helper = atomicHelper(code);
  const missingAt = helper.indexOf("if (isMissingRedeemFunction(error.code)) {");
  assert.ok(missingAt > -1, "the fallback check is gone");
  assert.equal(helper.split("return null;").length - 1, 1, "only the missing-function arm may hand over to the old flow");
  const otherErrorAt = helper.indexOf('console.error("[library/invitations/redeem] redeem_library_invitation failed:"');
  assert.ok(otherErrorAt > missingAt, "other database errors are logged and answered");
  const answer = helper.slice(otherErrorAt, helper.indexOf("}", helper.indexOf("status: 400", otherErrorAt)));
  assert.ok(answer.includes("status: 400") && /المكتبة/.test(answer), "an Arabic 400, like the old failed grant");
  assert.ok(!answer.includes("error.message }"), "the raw database error is never sent");
});

test("a second redeem of the same code by the same account gets a clear Arabic 400", () => {
  const code = codeOnly(routeSource);
  assert.ok(/const ALREADY_REDEEMED_MESSAGE =\s*"سبق أن استخدمتَ كود الدعوة هذا/.test(code), "the message is Arabic and says what happened");
  const helper = atomicHelper(code);
  assert.ok(
    /case "already_redeemed":\s*return NextResponse\.json\(\{ error: ALREADY_REDEEMED_MESSAGE \}, \{ status: 400 \}\)/.test(helper),
    "already_redeemed → 400 with the message",
  );
  assert.ok(
    /error\.code === "23505"\)\s*\{\s*return NextResponse\.json\(\{ error: ALREADY_REDEEMED_MESSAGE \}/.test(helper),
    "the unique key's 23505 (a race) answers the same message",
  );
  for (const result of ["invalid", "expired", "exhausted"]) {
    assert.ok(helper.includes(`case "${result}":`), `the ${result} answer is mapped`);
  }
});

test("the atomic success payload has the old shape: library, the code's days, the grant's end", () => {
  const helper = atomicHelper(codeOnly(routeSource));
  const okAt = helper.indexOf('case "ok":');
  const payload = helper.slice(okAt, helper.indexOf("break;", okAt));
  assert.ok(payload.includes("ok: true") && payload.includes('tier: "library"'), "same keys as the old success");
  assert.ok(payload.includes("days: typeof row.days === \"number\" ? row.days : DEFAULT_INVITE_GRANT_DAYS"), "the code's days");
  assert.ok(payload.includes("until: new Date(row.ends_at).toISOString()"), "the grant's own end");
});
