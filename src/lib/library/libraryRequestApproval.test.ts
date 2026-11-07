import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LIBRARY_REQUEST_ADMIN_ONLY_AR, libraryRequestApprovalDecision } from "./libraryRequestApproval.ts";

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
