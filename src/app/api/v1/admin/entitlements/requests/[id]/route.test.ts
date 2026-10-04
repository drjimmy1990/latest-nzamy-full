/**
 * route.test.ts — PATCH /api/v1/admin/entitlements/requests/[id] contract.
 * Run with a DIRECTORY glob — a literal `[id]` in the argument is a character
 * class to node's test runner and matches nothing. The exact command is the
 * RUN line comment just below this block (it cannot live inside a block
 * comment: the glob's asterisk-slash would close the comment early).
 *
 * A source-contract test (the technique
 * src/app/api/v1/business/members/route.test.ts uses): the route imports
 * `next/server`, the Supabase service client and recordNotification, so it
 * cannot be imported and executed from `node --test`.
 *
 * What it pins (review 2026-09-21 A3/C01, follow-up 2026-09-22): the approve
 * arm notifies the requester «تم تفعيل ما طلبته على حسابك», and since
 * grantEntitlement started skipping downgrades that sentence is only honest if
 * the route can tell an applied grant from a skipped one. It does NOT buy that
 * with `replaceActive` — nobody requests a downgrade, and the console page
 * sends `tier ?? "pro"`, so the override would let an untouched dropdown cancel
 * a max/corp subscription. It branches on `result.alreadyEntitled` instead:
 * the request is still marked approved, the requester is told what actually
 * happened, and the response carries the flag.
 */

// RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test "src/app/api/v1/admin/entitlements/requests/*/route.test.ts"

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const routeSource = readFileSync(join(import.meta.dirname, "route.ts"), "utf8");

/**
 * The route with its JSDoc and line comments dropped, so a rule about the CODE
 * is neither satisfied nor broken by prose that merely names the identifier —
 * the route's own header explains `alreadyEntitled` at length.
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

const GRANT_CALL = "await grantEntitlement({";
const APPROVED_NOTICE = '"تم تفعيل ما طلبته على حسابك."';

/** The object literal handed to grantEntitlement(). */
function grantCallBlock(source: string): string {
  const callAt = source.indexOf(GRANT_CALL);
  assert.ok(callAt > -1, "the approve arm no longer calls grantEntitlement");
  const endAt = source.indexOf("\n    });", callAt);
  assert.ok(endAt > callAt, "could not find the end of the grantEntitlement call");
  return source.slice(callAt, endAt);
}

test("the approve arm does NOT override the no-downgrade rule", () => {
  // codeOnly: the call's own comment explains why the override is absent.
  assert.ok(
    !grantCallBlock(codeOnly(routeSource)).includes("replaceActive"),
    "with the override an approval applies the tier the console defaults to ('pro'), so approving a max/corp holder's request without touching the selector cancels their subscription",
  );
});

test("the requester is only told the plan was activated when it actually was", () => {
  const code = codeOnly(routeSource);
  const noticeAt = routeSource.indexOf(APPROVED_NOTICE);
  assert.ok(noticeAt > -1, "the approval notification text changed — re-read this test");
  const grantAt = routeSource.indexOf(GRANT_CALL);
  assert.ok(grantAt < noticeAt, "the grant must be applied before the requester is told it was");
  assert.ok(
    code.includes("result.alreadyEntitled"),
    "without the override a grant CAN silently no-op here; the route must notice, or the notification claims an activation that never happened",
  );
  const flagAt = code.indexOf("const alreadyEntitled = result.alreadyEntitled === true;");
  const bodyAt = code.indexOf("body: noticeBody,");
  assert.ok(flagAt > -1, "the skip is no longer detected");
  assert.ok(bodyAt > flagAt, "recordNotification must send the branched sentence, not a fixed one");
  assert.ok(
    code.includes("حسابك يحمل بالفعل هذه الباقة أو أعلى منها، فلم نغيّر اشتراكك الحالي."),
    "the skipped-grant sentence is gone — a requester who already holds the plan would be told it was just activated",
  );
  assert.ok(
    code.includes("alreadyEntitled,"),
    "the response must carry the flag so the admin console can surface a decision that changed nothing",
  );
});

test("an approval whose grant was skipped still decides the request", () => {
  // Leaving it pending would put it back in the admin's queue with no way to
  // clear it: the account already holds what was asked for or better, so the
  // decision is genuinely resolved.
  const code = codeOnly(routeSource);
  const approveWriteAt = code.indexOf('status: "approved"');
  const flagAt = code.indexOf("const alreadyEntitled = result.alreadyEntitled === true;");
  assert.ok(approveWriteAt > -1 && flagAt > -1);
  assert.ok(
    approveWriteAt < flagAt,
    "the request must be marked approved before the skip is branched on, i.e. in both outcomes",
  );
});

test("a failed grant stops the decision — the request is not marked approved", () => {
  const failAt = routeSource.indexOf(
    "if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });",
  );
  assert.ok(failAt > -1, "the failure arm changed");
  const approveWriteAt = routeSource.indexOf('status: "approved"');
  assert.ok(
    failAt < approveWriteAt,
    "a request must not be marked approved when the grant itself failed",
  );
});

test("the reject arm grants nothing", () => {
  const rejectAt = routeSource.indexOf('if (body.action === "reject")');
  const approveAt = routeSource.indexOf('if (body.action === "approve")');
  const grantAt = routeSource.indexOf(GRANT_CALL);
  assert.ok(rejectAt > -1 && approveAt > -1);
  assert.ok(rejectAt < approveAt && approveAt < grantAt, "the grant lives in the approve arm only");
});

test("the route still refuses a non-admin, and a request already decided", () => {
  const gateAt = routeSource.indexOf("await requireAdmin()");
  const grantAt = routeSource.indexOf(GRANT_CALL);
  assert.ok(gateAt > -1 && gateAt < grantAt, "the admin gate must run before the grant");
  assert.ok(
    routeSource.includes('reqRow.status !== "pending"') && routeSource.includes("status: 409"),
    "a request that was already decided must still be a 409, or an admin can re-grant it",
  );
});
