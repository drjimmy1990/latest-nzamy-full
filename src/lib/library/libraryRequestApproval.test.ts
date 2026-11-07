import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  GRANT_ACTION_ADMIN_ONLY_AR,
  LIBRARY_REQUEST_ADMIN_ONLY_AR,
  LIBRARY_TIER_ADMIN_ONLY_AR,
  defaultGrantActionForKind,
  libraryRequestApprovalDecision,
  requestGrantApprovalDecision,
} from "./libraryRequestApproval.ts";

test("owner ٤٢٧: an unpaid library request is approved by super_admin only", () => {
  assert.deepEqual(libraryRequestApprovalDecision({ role: "super_admin", paidOrder: false }), { allowed: true, basis: "admin_grant" });
  for (const role of ["operations", "auditor", null, undefined] as const) {
    const d = libraryRequestApprovalDecision({ role, paidOrder: false });
    assert.equal(d.allowed, false, String(role));
    if (!d.allowed) {
      assert.equal(d.status, 403);
      assert.equal(d.code, "library_grant_admin_only");
      assert.equal(d.error, LIBRARY_REQUEST_ADMIN_ONLY_AR);
    }
  }
});

test("a request tied to a paid order may be approved by operations", () => {
  assert.deepEqual(libraryRequestApprovalDecision({ role: "operations", paidOrder: true }), { allowed: true, basis: "paid_order" });
});

test("an odd role string is not an admin", () => {
  // @ts-expect-error — a value outside the union, as a database row could hold
  assert.equal(libraryRequestApprovalDecision({ role: "Super_Admin", paidOrder: false }).allowed, false);
});

test("the route checks the rule first in the library arm, before the claim and the grant", () => {
  const src = readFileSync(
    join(import.meta.dirname, "..", "..", "app", "api", "v1", "admin", "entitlements", "requests", "[id]", "route.ts"),
    "utf8",
  );
  const arm = src.slice(src.indexOf("async function approveLibraryRequest("));
  const ruleAt = arm.indexOf("libraryRequestApprovalDecision({");
  const claimAt = arm.indexOf('.eq("status", "pending")');
  const grantAt = arm.indexOf("await grantLibraryAccess({");
  assert.ok(ruleAt > -1 && ruleAt < claimAt && claimAt < grantAt);
  assert.ok(arm.slice(ruleAt, ruleAt + 200).includes("paidOrder: false"), "no request links to a paid order: unpaid");
  assert.ok(src.includes("role: gate.role"), "the deciding admin's staff role reaches the arm");
});

// ── The plan / media / credits / wallet arm (fix round 1) ────────────────────
// access-control.ts's TIER_RANK, as entitlements.test.ts pins it (that file cannot be loaded here).
const RANKS = { free: 0, shield: 1, ai: 2, pro: 3, max: 4, corp: 5, enterprise: 6 };
const ask = (over: Partial<Parameters<typeof requestGrantApprovalDecision>[0]>) =>
  requestGrantApprovalDecision({ role: "operations", kind: "plan", grantAction: undefined, tier: "shield", paidOrder: false, ranks: RANKS, ...over });

test("operations may not approve a plan / media request at pro or above (Pro+ is the full library)", () => {
  for (const kind of ["plan", "media"]) {
    for (const tier of ["pro", "max", "corp", "enterprise"]) {
      const d = ask({ kind, tier });
      assert.equal(d.allowed, false, `${kind}/${tier}`);
      if (!d.allowed) {
        assert.equal(d.code, "library_grant_admin_only");
        assert.equal(d.error, LIBRARY_TIER_ADMIN_ONLY_AR);
        assert.equal(d.status, 403);
      }
    }
    for (const tier of ["shield", "ai"]) assert.equal(ask({ kind, tier }).allowed, true, `${kind}/${tier}`);
  }
  // a tier the ranking does not know is not refused here — grantEntitlement rejects it as invalid
  assert.equal(ask({ tier: undefined }).allowed, true);
});

test("operations may not override the grant action; the kind's own action passes", () => {
  const credits = ask({ kind: "credits", grantAction: "plan", tier: "pro" });
  assert.equal(credits.allowed, false);
  if (!credits.allowed) {
    assert.equal(credits.code, "grant_action_admin_only");
    assert.equal(credits.error, GRANT_ACTION_ADMIN_ONLY_AR);
  }
  assert.equal(ask({ kind: "wallet", grantAction: "credits" }).allowed, false);
  assert.equal(ask({ kind: "credits", grantAction: "credits" }).allowed, true);
  assert.equal(ask({ kind: "wallet" }).allowed, true);
  assert.equal(ask({ kind: "media", grantAction: "plan", tier: "ai" }).allowed, true);
  assert.equal(defaultGrantActionForKind("media"), "plan");
  assert.equal(defaultGrantActionForKind("credits"), "credits");
  assert.equal(defaultGrantActionForKind("wallet"), "wallet");
});

test("super_admin may do all of it; a paid order lifts only the tier rule", () => {
  assert.equal(ask({ role: "super_admin", tier: "enterprise" }).allowed, true);
  assert.equal(ask({ role: "super_admin", kind: "credits", grantAction: "plan" }).allowed, true);
  assert.equal(ask({ paidOrder: true, tier: "pro" }).allowed, true);
  assert.equal(ask({ paidOrder: true, kind: "credits", grantAction: "plan" }).allowed, false);
  assert.equal(ask({ role: "auditor", tier: "pro" }).allowed, false);
});

test("the route applies the plan-arm rule before grantEntitlement, with TIER_RANK and no paid order", () => {
  const src = readFileSync(
    join(import.meta.dirname, "..", "..", "app", "api", "v1", "admin", "entitlements", "requests", "[id]", "route.ts"),
    "utf8",
  );
  const ruleAt = src.indexOf("requestGrantApprovalDecision({");
  const grantAt = src.indexOf("await grantEntitlement({");
  const libraryBranchAt = src.indexOf('if (kind === "library") {');
  assert.ok(libraryBranchAt > -1 && ruleAt > libraryBranchAt && ruleAt < grantAt);
  const call = src.slice(ruleAt, src.indexOf("});", ruleAt));
  for (const part of ["role: gate.role", "grantAction: body.grantAction", "tier: body.tier", "paidOrder: false", "ranks: TIER_RANK"]) {
    assert.ok(call.includes(part), part);
  }
});
