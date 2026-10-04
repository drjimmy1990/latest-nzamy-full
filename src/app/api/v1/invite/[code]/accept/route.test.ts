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
 * themselves Pro for free" — and its 2026-09-22 follow-up):
 *   1. POST /api/v1/invite/sync is GONE. It let any authenticated caller write
 *      20 self-chosen codes into public.invitations with the service-role
 *      client and `tier: null`.
 *   2. accept reads `inviter_id` and refuses (403) a code the caller created.
 *   3. a row with NO inviter_id is refused (400) instead of skipping guard 2.
 *      (That NULL is produced by the FK's `on delete set null`, not by
 *      invite/sync — see the route header.)
 *   4. a NULL/unknown tier is refused (400) instead of becoming "pro".
 *   5. a grant that was SKIPPED (the account already holds that plan or better)
 *      leaves the invitation pending AND answers a non-2xx: the landing page
 *      sets `accepted` on any ok response without reading the body, so a 200
 *      would print «تجربتك مفعّلة!» over a grant that was never written.
 *   6. the accept path is still in the proxy's strict rate-limit bucket.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { isStrictRateLimitedRoute } from "../../../../../../lib/rateLimitRoutes.ts";

const routeSource = readFileSync(join(import.meta.dirname, "route.ts"), "utf8");
const inviteDir = join(import.meta.dirname, "..", "..");

const INVALID_INVITE_AR = 'error: "هذه الدعوة غير صالحة."';

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
  const grantAt = routeSource.indexOf("await grantEntitlement({");
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
  const grantAt = routeSource.indexOf("await grantEntitlement({");
  assert.ok(
    tierGuardAt < refusalAt && refusalAt < grantAt,
    "the tier must be validated BEFORE the entitlement is granted",
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

test("the tier the grant receives is the invitation's own, not a default", () => {
  assert.match(routeSource, /const tier = rawTier as ServerTier;/);
  assert.match(routeSource, /tier,\n\s*durationDays,/);
});

// ── 5. a skipped grant must not burn the invitation ────────────────────────

test("an alreadyEntitled grant refuses with 400 BEFORE the invitation is marked accepted", () => {
  const grantAt = routeSource.indexOf("await grantEntitlement({");
  const skipAt = routeSource.indexOf("if (grant.alreadyEntitled) {");
  const acceptAt = routeSource.indexOf('status: "accepted"');
  assert.ok(skipAt > -1, "the route no longer notices a skipped grant");
  assert.ok(acceptAt > -1, "the accept update vanished — re-read this test");
  assert.ok(
    grantAt < skipAt && skipAt < acceptAt,
    "the skip arm must return before the invitation is consumed, or the user pays a code for nothing",
  );
  const skipBlock = routeSource.slice(skipAt, acceptAt);
  assert.ok(
    !skipBlock.includes('status: "accepted"'),
    "the skip arm must not mark the invitation accepted",
  );
  assert.ok(
    skipBlock.includes("status: 400"),
    "the skip arm must answer a non-2xx: the landing page renders ANY ok response as an activated trial",
  );
  assert.ok(
    skipBlock.includes("error:") && skipBlock.includes("باقة"),
    "the skip arm must refuse with an Arabic `error` naming the plan the account already holds — the page prints json.error verbatim",
  );
});

test("a 2xx from this route always means a subscription was written", () => {
  // src/app/invite/[code]/page.tsx:125-134 does `if (!res.ok) {…}` and then
  // `setAccepted(true)` without ever reading `json.data`, so a flag inside a
  // 200 body cannot be acted on: the two outcomes must differ by STATUS. The
  // sibling POST /api/v1/library/invitations/redeem refuses for the same
  // reason.
  assert.ok(
    !routeSource.includes("alreadyEntitled: false"),
    "a success payload a caller must inspect to learn whether anything happened is exactly what the landing page ignores",
  );
  const skipAt = routeSource.indexOf("if (grant.alreadyEntitled) {");
  const successAt = routeSource.indexOf("success: true");
  assert.ok(skipAt > -1, "the route no longer notices a skipped grant");
  assert.ok(
    successAt > skipAt,
    "the only success payload must come after the skip arm has returned",
  );
});

// ── 6. the strict rate-limit bucket still covers this path ──────────────────

test("POST accept is in the proxy's strict rate-limit bucket", () => {
  assert.equal(isStrictRateLimitedRoute("POST", "/api/v1/invite/NZM-INV-ABCD/accept"), true);
  assert.equal(isStrictRateLimitedRoute("GET", "/api/v1/invite/NZM-INV-ABCD/accept"), false);
});
