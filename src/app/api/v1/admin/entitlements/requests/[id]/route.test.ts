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
 *
 * Owner answers ٢٠١–٢٠٣ (2026-10-18): a `library` request no longer goes
 * through grantEntitlement at all. It is approved by its own arm
 * (approveLibraryRequest), which inserts a library_access_grants row for the
 * plan's real length and writes no `subscriptions` row. The pure half of that
 * arm (plan + days, the end date) is executed below on the real helpers from
 * src/lib/libraryAccess.ts; the wiring is pinned in the source.
 */

// RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test "src/app/api/v1/admin/entitlements/requests/*/route.test.ts"

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { grantWindow, resolveLibraryRequestGrant } from "../../../../../../../lib/libraryAccess.ts";

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
  // Owner ٢١٠: requireStaff runs requireAdmin() first, then the staff role.
  const gateAt = routeSource.indexOf('await requireStaff("entitlements.decide")');
  const grantAt = routeSource.indexOf(GRANT_CALL);
  assert.ok(gateAt > -1 && gateAt < grantAt, "the staff gate must run before the grant");
  assert.ok(
    routeSource.includes('reqRow.status !== "pending"') && routeSource.includes("status: 409"),
    "a request that was already decided must still be a 409, or an admin can re-grant it",
  );
});

// ── A library request grants the library only (owner ٢٠١–٢٠٣, 2026-10-18) ───

const LIBRARY_ARM = "async function approveLibraryRequest(";

/** The library approval helper, from its signature to the end of the file. */
function libraryArm(source: string): string {
  const at = source.indexOf(LIBRARY_ARM);
  assert.ok(at > -1, "the library approval is no longer its own arm");
  return source.slice(at);
}

test("LIVE-F05: an ineligible requester (an individual) is refused BEFORE the claim and the grant", () => {
  const arm = libraryArm(routeSource);
  const typeAt = arm.indexOf('.select("user_type")');
  const ruleAt = arm.indexOf("libraryPurchaseEligibility(");
  const refuseAt = arm.indexOf('code: "library_not_eligible"');
  const claimAt = arm.indexOf('.eq("status", "pending")');
  const grantAt = arm.indexOf("await grantLibraryAccess({");
  assert.ok(typeAt > -1 && ruleAt > typeAt && refuseAt > ruleAt, "read the account type, apply the rule, refuse");
  assert.ok(refuseAt < claimAt && claimAt < grantAt, "the refusal comes before the request is claimed or granted");
  assert.ok(arm.slice(refuseAt, refuseAt + 120).includes("status: 409"));
  // a failed read of the account type is refused too (fail closed)
  const readFailAt = arm.indexOf("if (requesterError)");
  assert.ok(readFailAt > typeAt && readFailAt < ruleAt);
});

test("a library request is routed to the library arm BEFORE the plan grant", () => {
  const code = codeOnly(routeSource);
  const branchAt = code.indexOf('if (kind === "library") {');
  const grantAt = code.indexOf(GRANT_CALL);
  assert.ok(branchAt > -1, "library requests are no longer told apart from plan requests");
  assert.ok(branchAt < grantAt, "the library branch must come before grantEntitlement, or a library request still writes a subscription");
  const branch = code.slice(branchAt, grantAt);
  assert.ok(
    /return\s+approveLibraryRequest\(/.test(branch),
    "the library branch must RETURN the library arm's answer — falling through reaches grantEntitlement",
  );
});

test("the library arm writes no subscriptions row", () => {
  const arm = codeOnly(libraryArm(routeSource));
  assert.ok(!arm.includes("grantEntitlement"), "the library arm must not call grantEntitlement (it writes `subscriptions`)");
  assert.ok(!arm.includes("subscriptions"), "the library arm must not touch `subscriptions`");
  assert.ok(!arm.includes("tier"), "the admin's tier picker has no say over a library grant");
});

test("the library arm inserts a library grant with the plan's own length", () => {
  const arm = codeOnly(libraryArm(routeSource));
  assert.ok(
    arm.includes("resolveLibraryRequestGrant(requestedRef, durationDays)"),
    "days and plan must be resolved from the request's ref and the admin's durationDays",
  );
  const call = codeOnly(routeSource);
  const callAt = call.indexOf("return approveLibraryRequest({");
  const callBlock = call.slice(callAt, call.indexOf("});", callAt));
  assert.ok(callBlock.includes("requestedRef: reqRow.requested_ref"), "the ref is the stored request's, not the body's");
  assert.ok(callBlock.includes("durationDays: body.durationDays"), "the admin's days must reach the resolver, which validates them");
  assert.ok(callBlock.includes("adminId: gate.userId"), "the deciding admin is the gate's user");
  assert.ok(arm.includes("await grantLibraryAccess({"), "the library arm must insert into library_access_grants");
  assert.ok(arm.includes('source: "request"'), "a grant from an approved request has source 'request'");
  assert.ok(arm.includes("grantedBy: adminId"), "the deciding admin is recorded on the grant");
  assert.ok(arm.includes("planRef: plan.planRef") && arm.includes("days: plan.days"));
});

test("an invalid durationDays is a 400 with Arabic copy, before anything is written", () => {
  const arm = codeOnly(libraryArm(routeSource));
  const invalidAt = arm.indexOf("if (!plan.ok)");
  const grantAt = arm.indexOf("await grantLibraryAccess({");
  assert.ok(invalidAt > -1 && invalidAt < grantAt, "durationDays must be validated before the grant");
  const block = arm.slice(invalidAt, grantAt);
  assert.ok(block.includes("status: 400"));
  assert.ok(/error:\s*"[^"]*مدة الاشتراك/.test(block), "the refusal must be Arabic and name the duration");
});

test("the library arm claims the request (pending → approved) BEFORE it grants", () => {
  // With grants that extend each other, two concurrent approvals of one
  // request would add the full length twice; the conditional claim lets only
  // one of them through.
  const arm = codeOnly(libraryArm(routeSource));
  const claimAt = arm.indexOf('status: "approved"');
  const grantAt = arm.indexOf("await grantLibraryAccess({");
  assert.ok(claimAt > -1 && grantAt > -1);
  assert.ok(claimAt < grantAt, "claim first, then grant");
  const claim = arm.slice(claimAt, grantAt);
  assert.ok(claim.includes('.eq("status", "pending")'), "the claim must be conditional on the request still being pending");
  assert.ok(claim.includes('.select("id")'), "the claim must report how many rows it took");
  assert.ok(claim.includes("decided_by: adminId") && claim.includes("decided_at: nowIso"));
});

test("a lost claim is a 409 and grants nothing", () => {
  const arm = codeOnly(libraryArm(routeSource));
  const lostAt = arm.indexOf("claimed.length === 0");
  const grantAt = arm.indexOf("await grantLibraryAccess({");
  assert.ok(lostAt > -1 && lostAt < grantAt, "zero claimed rows must return before the grant");
  const block = arm.slice(lostAt, grantAt);
  assert.ok(block.includes("status: 409"));
  assert.ok(block.includes("تم البت في هذا الطلب مسبقًا"));
});

test("a failed library grant puts the request back to pending, answers 400 in Arabic, and hides the raw error", () => {
  const arm = codeOnly(libraryArm(routeSource));
  const grantAt = arm.indexOf("await grantLibraryAccess({");
  const failAt = arm.indexOf("if (!grant.ok)");
  const noticeAt = arm.indexOf("await recordNotification({");
  assert.ok(grantAt < failAt && failAt < noticeAt, "grant, then the failure arm, then (only on success) the notification");
  const block = arm.slice(failAt, noticeAt);
  const revertAt = block.indexOf('status: "pending"');
  assert.ok(revertAt > -1, "a failed grant must undo the claim");
  assert.ok(
    block.includes("decided_by: null") && block.includes("decided_at: null"),
    "the undo clears who decided and when",
  );
  assert.ok(block.includes('.eq("status", "approved")'), "the undo only touches the claim this request made");
  assert.ok(block.includes("status: 400"), "a failed grant (the table may not exist yet) is a 400, never a 500");
  assert.ok(block.includes("تعذّر تفعيل اشتراك المكتبة"), "the failure must be explained in Arabic");
  const respond = block.slice(block.indexOf("return NextResponse.json("));
  assert.ok(!respond.includes("grant.error"), "the grant's error is English or raw Postgres — logged, never sent");
  assert.ok(
    /console\.error\([^)]*grant\.error\)/.test(block),
    "the hidden error must still be logged, since the admin never sees it",
  );
  assert.ok(
    block.indexOf("console.error") < block.indexOf('status: "pending"'),
    "log the grant's error before undoing the claim",
  );
});

test("the requester is told the library is active until its real end date", () => {
  const arm = codeOnly(libraryArm(routeSource));
  const failAt = arm.indexOf("if (!grant.ok)");
  const noticeAt = arm.indexOf("تم تفعيل اشتراك المكتبة القانونية حتى");
  assert.ok(noticeAt > failAt, "the notification follows a successful grant only");
  assert.ok(arm.includes("libraryEndsAtAr(grant.endsAt)"), "the date is the grant's own (extended) end");
  assert.ok(arm.includes("await recordNotification({"));
});

test("the library arm runs only after the admin gate and the pending check", () => {
  const code = codeOnly(routeSource);
  const gateAt = code.indexOf('await requireStaff("entitlements.decide")');
  const pendingAt = code.indexOf('reqRow.status !== "pending"');
  const callAt = code.indexOf("return approveLibraryRequest(");
  assert.ok(gateAt > -1 && pendingAt > -1 && callAt > -1);
  assert.ok(gateAt < callAt && pendingAt < callAt, "a library grant must never skip the gate or re-grant a decided request");
});

// The brief's two date cases, run on the real helpers the route calls.
test("approving lib-annual ends the grant at now+365; an explicit durationDays 120 at now+120", () => {
  const now = new Date("2026-10-19T00:00:00.000Z");
  const annual = resolveLibraryRequestGrant("lib-annual", undefined);
  assert.deepEqual(annual, { ok: true, planRef: "lib-annual", days: 365 });
  assert.equal(grantWindow(365, now)?.endsAt, new Date(now.getTime() + 365 * 86_400_000).toISOString());
  const custom = resolveLibraryRequestGrant("lib-annual", 120);
  assert.deepEqual(custom, { ok: true, planRef: "lib-annual", days: 120 });
  assert.equal(grantWindow(120, now)?.endsAt, new Date(now.getTime() + 120 * 86_400_000).toISOString());
});

// The console page: a library row sends days, never a tier.
const pageSource = readFileSync(
  join(import.meta.dirname, "..", "..", "..", "..", "..", "..", "dashboard", "admin", "entitlements", "requests", "page.tsx"),
  "utf8",
);

test("the console sends durationDays (a number) for a library row and shows it no tier picker", () => {
  assert.ok(
    pageSource.includes('["plan", "media"].includes(row.kind)'),
    "only plan and media rows still need a tier",
  );
  assert.ok(!pageSource.includes('["plan", "library", "media"]'), "a library row must not send or show a tier");
  assert.ok(pageSource.includes('row.kind === "library"'), "library rows are told apart");
  assert.ok(pageSource.includes("body.durationDays = libraryDaysFor(row)"), "a library approval sends its days");
  assert.ok(
    pageSource.includes("libraryPlanDays(row.requested_ref) ?? 90"),
    "the days field is prefilled from requested_ref (90/180/365), else 90",
  );
});
