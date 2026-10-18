/**
 * route.test.ts — POST /api/v1/invite/[code]/accept contract. Run with:
 *   npm run test:unit            (the src/**\/*.test.ts glob does find this file)
 * or, for this file alone, from its own directory:
 *   cd "src/app/api/v1/invite/[code]/accept" && node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test route.test.ts
 * Passing the full path to `node --test` matches NOTHING: the runner treats the
 * argument as a glob, and `[code]` is a character class there, not a directory.
 *
 * A source-contract test, the technique src/app/api/v1/business/members/route.test.ts
 * uses: the route pulls in `next/server` and a Supabase session, so it cannot be
 * imported and executed here. The rate-limit half IS executable — it runs the
 * real table from src/lib/rateLimitRoutes.ts.
 *
 * What it pins (review 2026-09-21 A3 / C01 — "any signed-in user can grant
 * themselves Pro for free" — its 2026-09-22 follow-up, and the owner's answers
 * ٢٠١–٢٠٣ of 2026-10-18):
 *   1. POST /api/v1/invite/sync is GONE. It let any authenticated caller write
 *      20 self-chosen codes into public.invitations with the service-role
 *      client and `tier: null`.
 *   2. accept reads `inviter_id` and refuses (403) a code the caller created.
 *   3. a row with NO inviter_id is refused (400) instead of skipping guard 2.
 *      (That NULL is produced by the FK's `on delete set null`, not by
 *      invite/sync — see the route header.)
 *   4. a NULL/unknown tier is refused (400) instead of becoming "pro". The
 *      tier no longer decides what is granted (point 5); the refusal stays as
 *      the row-validity check the review mandated.
 *   5. a colleague invitation grants the LIBRARY: a `lib-trial` row in
 *      library_access_grants, source 'colleague_invite', for the invitation's
 *      own trial_days (30 when unusable) — never a plan tier, never a
 *      `subscriptions` row. A library grant cancels nothing and has no
 *      "skipped" outcome, so the old alreadyEntitled arm is gone with
 *      grantEntitlement; a FAILED grant (the table may not exist yet) is a 400
 *      in Arabic that leaves the invitation pending.
 *   6. the accept path is still in the proxy's strict rate-limit bucket.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { isStrictRateLimitedRoute } from "../../../../../../lib/rateLimitRoutes.ts";

const routeSource = readFileSync(join(import.meta.dirname, "route.ts"), "utf8");
const inviteDir = join(import.meta.dirname, "..", "..");
const lookupSource = readFileSync(join(import.meta.dirname, "..", "route.ts"), "utf8");

const INVALID_INVITE_AR = 'error: "هذه الدعوة غير صالحة."';
const GRANT_CALL = "await grantLibraryAccess({";

/**
 * The route with its JSDoc and line comments dropped, so a rule about the CODE
 * is neither satisfied nor broken by prose that merely names the identifier.
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

/** The object literal handed to grantLibraryAccess(). */
function grantCallBlock(source: string): string {
  const callAt = source.indexOf(GRANT_CALL);
  assert.ok(callAt > -1, "the route no longer calls grantLibraryAccess");
  const endAt = source.indexOf("});", callAt);
  assert.ok(endAt > callAt, "could not find the end of the grantLibraryAccess call");
  return source.slice(callAt, endAt);
}

// ── 1. the writer is deleted ────────────────────────────────────────────────

test("POST /api/v1/invite/sync no longer exists", () => {
  assert.equal(
    existsSync(join(inviteDir, "sync", "route.ts")),
    false,
    "src/app/api/v1/invite/sync/route.ts is back — it self-serves invitations with the service-role client",
  );
  assert.equal(
    existsSync(join(inviteDir, "sync")),
    false,
    "the empty src/app/api/v1/invite/sync directory should be gone too",
  );
});

// ── 2. nobody redeems their own invitation ──────────────────────────────────

test("the lookup selects inviter_id", () => {
  assert.match(
    routeSource,
    /\.select\("id, code, inviter_id, trial_days, tier, status, expires_at"\)/,
    "without inviter_id in the projection the self-invite check cannot run",
  );
});

test("a code created by the caller is refused with 403 and the Arabic message", () => {
  assert.ok(
    routeSource.includes("row.inviter_id === user.id"),
    "inviter_id is never compared with the caller",
  );
  assert.ok(
    routeSource.includes('error: "لا يمكن قبول دعوة أنشأتها بنفسك"'),
    "the 403 message changed — the landing page shows json.error verbatim",
  );
  const guardAt = routeSource.indexOf("row.inviter_id === user.id");
  const statusAt = routeSource.indexOf('row.status !== "pending"');
  const expiryAt = routeSource.indexOf("row.expires_at &&");
  const grantAt = routeSource.indexOf(GRANT_CALL);
  assert.ok(statusAt > -1 && expiryAt > -1 && grantAt > -1);
  assert.ok(
    statusAt < guardAt && guardAt < expiryAt && guardAt < grantAt,
    "order must be 404 → 409 used → 400 no inviter → 403 self → 410 expired → grant",
  );
  const guardBlock = routeSource.slice(guardAt, guardAt + 240);
  assert.ok(guardBlock.includes("status: 403"), "the self-invite guard must answer 403");
});

// ── 3. an invitation with no inviter is junk, not a gift ────────────────────

test("the truthiness form that let a NULL inviter skip the self-check is gone", () => {
  // `if (row.inviter_id && row.inviter_id === user.id)` short-circuited on any
  // row with a NULL inviter. Those rows are NOT what POST /api/v1/invite/sync
  // wrote — it wrote `inviter_id: user.id` and left `tier` NULL (test 4 below
  // covers that). Per the DDL the FK's `on delete set null`
  // (supabase/migrations/20260706_content_and_ops.sql:115) is the only
  // producer, so the rows this guard refuses are real pending invitations
  // whose inviter deleted their account — a mandated refusal with a real cost,
  // not a purge of junk. Review 2026-09-21 A3/C01, follow-up 2026-09-22.
  assert.ok(
    !routeSource.includes("row.inviter_id && row.inviter_id === user.id"),
    "the NULL inviter can skip the self-invite guard again",
  );
});

test("a NULL inviter_id is a 400 with the same Arabic refusal, before the self-check", () => {
  const nullGuardAt = routeSource.indexOf("if (!row.inviter_id) {");
  assert.ok(nullGuardAt > -1, "an inviter-less invitation is accepted again");
  const selfGuardAt = routeSource.indexOf("if (row.inviter_id === user.id) {");
  assert.ok(selfGuardAt > -1);
  assert.ok(
    nullGuardAt < selfGuardAt,
    "the NULL check must come first — the self-check cannot compare a null",
  );
  const block = routeSource.slice(nullGuardAt, selfGuardAt);
  assert.ok(block.includes(INVALID_INVITE_AR), "the NULL-inviter refusal lost its Arabic message");
  assert.ok(block.includes("status: 400"), "an inviter-less invitation is a 400");
});

// ── 4. a null tier is refused, never promoted to "pro" ──────────────────────

test('no "pro" fallback survives anywhere in the route', () => {
  assert.ok(
    !routeSource.includes('?? "pro"'),
    'the `(row.tier as string | null) ?? "pro"` fallback is back',
  );
  assert.ok(
    !routeSource.includes(': "pro"'),
    'the VALID_TIERS ternary\'s `: "pro"` fallback is back',
  );
});

test("a missing or unknown tier is a 400 with the Arabic refusal", () => {
  assert.ok(
    routeSource.includes("!rawTier || !VALID_TIERS.includes(rawTier as ServerTier)"),
    "the tier is no longer validated before the grant",
  );
  // The same sentence now serves two refusals (NULL inviter, bad tier); this is
  // the SECOND one, so lastIndexOf, not indexOf.
  const refusalAt = routeSource.lastIndexOf(INVALID_INVITE_AR);
  const tierGuardAt = routeSource.indexOf("!rawTier || !VALID_TIERS.includes");
  const grantAt = routeSource.indexOf(GRANT_CALL);
  assert.ok(
    tierGuardAt < refusalAt && refusalAt < grantAt,
    "the tier must be validated BEFORE anything is granted",
  );
  assert.ok(
    routeSource.slice(refusalAt, refusalAt + 120).includes("status: 400"),
    "an invalid invitation is a 400",
  );
  assert.equal(
    routeSource.split(INVALID_INVITE_AR).length - 1,
    2,
    "exactly two refusals share this sentence: the NULL inviter and the bad tier",
  );
});

// ── 5. a colleague invitation grants the library trial, nothing else ───────

test("accept writes a lib-trial library grant for the invitation's own trial length", () => {
  const code = codeOnly(routeSource);
  const call = grantCallBlock(code);
  assert.ok(call.includes("userId: user.id"), "the grant goes to the signed-in caller");
  assert.ok(call.includes('planRef: "lib-trial"'), "a colleague invitation's grant is plan 'lib-trial'");
  assert.ok(call.includes("days: trialDays"), "the grant lasts the invitation's trial");
  assert.ok(call.includes('source: "colleague_invite"'), "the grant's source is 'colleague_invite'");
  assert.ok(
    code.includes("const trialDays = colleagueInviteTrialDays(row.trial_days);"),
    "the trial length is the invitation's trial_days, 30 when unusable",
  );
});

test("the invitation's tier grants nothing, and no subscription is written", () => {
  const code = codeOnly(routeSource);
  assert.ok(!code.includes("grantEntitlement"), "grantEntitlement writes a `subscriptions` row — a colleague invite is the library only");
  assert.ok(!grantCallBlock(code).includes("tier"), "the invitation's tier must not reach the grant");
  assert.ok(!code.includes("const tier = rawTier"), "the tier is validated as a row check only, never carried forward");
});

test("a failed grant is a 400 in Arabic BEFORE the invitation is marked accepted", () => {
  const code = codeOnly(routeSource);
  const grantAt = code.indexOf(GRANT_CALL);
  const failAt = code.indexOf("if (!grant.ok) {");
  const acceptAt = code.indexOf('status: "accepted"');
  assert.ok(failAt > -1, "the route no longer checks its grant");
  assert.ok(acceptAt > -1, "the accept update vanished — re-read this test");
  assert.ok(
    grantAt < failAt && failAt < acceptAt,
    "the failure arm must return before the invitation is consumed, or the user pays a code for nothing",
  );
  const block = code.slice(failAt, acceptAt);
  assert.ok(
    block.includes("status: 400"),
    "a failed grant (the table may not exist yet) is a 400, never a 500 — the landing page shows json.error",
  );
  assert.ok(!block.includes("status: 500"));
  assert.ok(/error:\s*"[^"]*المكتبة/.test(block), "the failure must be Arabic and name the library");
  assert.ok(!block.includes("grant.error"), "the grant's error is English or raw Postgres — the page prints it verbatim");
});

test("a 2xx from this route always means a library grant was written", () => {
  // src/app/invite/[code]/page.tsx does `if (!res.ok) {…}` and then
  // `setAccepted(true)` without ever reading `json.data`, so the two outcomes
  // must differ by STATUS.
  const code = codeOnly(routeSource);
  const failAt = code.indexOf("if (!grant.ok) {");
  const successAt = code.indexOf("success: true");
  assert.ok(failAt > -1 && successAt > failAt, "the only success payload must come after the failure arm has returned");
  const payload = code.slice(successAt, code.indexOf("});", successAt));
  assert.ok(payload.includes('planRef: "lib-trial"'), "the payload names what was granted");
  assert.ok(payload.includes("until: grant.endsAt"), "the payload carries the grant's own end");
  assert.ok(!payload.includes("tier"), "the payload must not claim a plan tier was granted");
});

test("the landing page promises the same trial length accept grants", () => {
  // GET /api/v1/invite/[code] feeds «وصول مجاني لمدة …» on the landing page;
  // with its own `?? 14` it would promise 14 days over a 30-day grant.
  assert.ok(
    codeOnly(lookupSource).includes("trialDays: colleagueInviteTrialDays(invitation.trial_days)"),
    "the lookup must use the same trial-length rule as accept",
  );
});

// ── 6. the strict rate-limit bucket still covers this path ──────────────────

test("POST accept is in the proxy's strict rate-limit bucket", () => {
  assert.equal(isStrictRateLimitedRoute("POST", "/api/v1/invite/NZM-INV-ABCD/accept"), true);
  assert.equal(isStrictRateLimitedRoute("GET", "/api/v1/invite/NZM-INV-ABCD/accept"), false);
});
