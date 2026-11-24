/**
 * founderInviteTrialGate.test.ts — owner ٢٠١ (أ), 23 Nov 2026 (batch l14): the
 * founder-invite library trial is outside the 50-point gate for its days; the
 * older trial / invitation grants stay gated (owner ٩٣); the trial's points
 * stay the library assistant's. Run with:
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/library/founderInviteTrialGate.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FOUNDER_INVITE_TRIAL_PLAN_REF,
  FOUNDER_INVITE_TRIAL_SOURCE,
  isFounderInviteTrialCandidate,
  libraryPointsGateDecision,
  type PointsGateInput,
} from "./pointsGate.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const base: PointsGateInput = { isAdmin: false, planRefs: ["lib-trial"], balance: 0, minPoints: 50 };

test("٢٠١: a running founder-invite trial opens the library whatever the balance — no lock, no low-balance warning", () => {
  for (const balance of [0, 5, 49, 50, 500, null]) {
    assert.deepEqual(libraryPointsGateDecision({ ...base, balance, founderInviteTrial: true }), { gated: false, locked: false }, String(balance));
  }
  // with another grant beside it (he bought a pass during the trial): still open while the trial runs
  assert.deepEqual(
    libraryPointsGateDecision({ ...base, planRefs: ["lib-trial", "lib-q1"], balance: 10, founderInviteTrial: true }),
    { gated: false, locked: false },
  );
});

test("٩٣ still binds every other grant: the same lib-trial without the founder-invite flag is gated and locks below 50", () => {
  assert.deepEqual(libraryPointsGateDecision(base), { gated: true, locked: true });
  assert.deepEqual(libraryPointsGateDecision({ ...base, founderInviteTrial: false }), { gated: true, locked: true });
  // only a literal true counts
  assert.deepEqual(libraryPointsGateDecision({ ...base, founderInviteTrial: "yes" as unknown as boolean }), { gated: true, locked: true });
  assert.deepEqual(libraryPointsGateDecision({ ...base, planRefs: ["lib-q1"], balance: 10 }), { gated: true, locked: true });
});

test("the candidate is exactly the pair founder_invite_redeem writes (20261203_20): lib-trial + founder_campaign", () => {
  assert.equal(FOUNDER_INVITE_TRIAL_PLAN_REF, "lib-trial");
  assert.equal(FOUNDER_INVITE_TRIAL_SOURCE, "founder_campaign");
  assert.equal(isFounderInviteTrialCandidate({ plan_ref: "lib-trial", source: "founder_campaign" }), true);
  for (const row of [
    { plan_ref: "lib-trial", source: "colleague_invite" }, // the older invitation trial (invite/[code]/accept)
    { plan_ref: "lib-trial", source: "admin" },
    { plan_ref: "lib-founder", source: "founder_campaign" }, // the founder's own grant
    { plan_ref: "lib-q1", source: "purchase" },
    {},
  ]) assert.equal(isFounderInviteTrialCandidate(row), false, JSON.stringify(row));
  const sql = read("../../../supabase/migrations/20261203_20_founder_invites.sql");
  assert.match(sql, /library_grant_access\(p_user, 'lib-trial', 'founder_campaign'/);
  const accept = read("../../app/api/v1/invite/[code]/accept/route.ts");
  assert.match(accept, /source: "colleague_invite"/, "the other lib-trial writer uses another source");
});

test("wiring: the full-library state reads the trial (only when a lib-trial grant runs) and hands it to the gate; the server confirms it against founder_invites", () => {
  const ac = read("../access-control.ts");
  assert.match(ac, /grants\.includes\(FOUNDER_INVITE_TRIAL_PLAN_REF\)\s*\?\s*await hasActiveFounderInviteTrial\(userId\)/);
  assert.equal((ac.match(/founderInviteTrial \}\)/g) ?? []).length, 2, "both gate calls get the flag");
  const srv = read("../libraryAccessServer.ts");
  const fn = srv.slice(srv.indexOf("export async function hasActiveFounderInviteTrial"));
  assert.match(fn, /\.eq\('plan_ref', FOUNDER_INVITE_TRIAL_PLAN_REF\)/);
  assert.match(fn, /\.eq\('source', FOUNDER_INVITE_TRIAL_SOURCE\)/);
  assert.match(fn, /\.gt\('ends_at', nowIso\)/);
  assert.match(fn, /\.from\('founder_invites'\)[\s\S]{0,80}\.eq\('redeemed_by', userId\)[\s\S]{0,40}\.in\('grant_id', ids\)/);
  assert.match(fn, /return false;/, "a failed read keeps the gate");
  // the expiry notice and the top-up checkout do not threaten a trialist with the lock
  assert.match(read("../../app/api/v1/cron/points-expiry/route.ts"), /for \(const id of inviteTrial\) gated\.delete\(id\);/);
});

test("the admin cannot send the trial's points to other tools any more (owner ٢٠١)", () => {
  const ui = read("../../app/dashboard/admin/founder/FounderInvitesSettings.tsx");
  assert.doesNotMatch(ui, /value="general"/);
  assert.match(ui, /pointsScope: "library_agent"/);
  assert.match(read("../founder/founderInvites.ts"), /export type InvitePointsScope = "library_agent";/);
});
