/**
 * adminRouteGates.test.ts — owner answer ٢١٠ (Task 3.3): every destructive
 * admin write needs the right staff role, and each successful one leaves one
 * row in public.admin_audit_events.
 *
 * Two halves:
 *   1. The pure role decision (./staffDecision.ts) and the audit row builder
 *      (./adminAuditRow.ts), executed.
 *   2. Source pins on the route handlers. The routes import `next/server` and
 *      the Supabase clients, so `node --test` cannot import and run them; the
 *      technique is the one src/app/api/v1/admin/entitlements/grant/route.test.ts
 *      uses. Comments are stripped first, so prose that names `requireAdmin`
 *      or `admin_audit_events` neither satisfies nor breaks a pin.
 *
 * RUN: npx -y node@22 --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/auth/adminRouteGates.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { STAFF_MATRIX, type StaffAction, type StaffRole } from "./staffRoles.ts";
import {
  STAFF_CHECK_UNAVAILABLE_AR,
  STAFF_ONLY_AR,
  isMissingStaffTable,
  staffDecision,
  usersPatchActions,
} from "./staffDecision.ts";
import { buildAdminAuditRow, isMissingAuditColumn } from "./adminAuditRow.ts";

const SRC = join(import.meta.dirname, "..", "..");
const ADMIN_API = join(SRC, "app", "api", "v1", "admin");

const ALL_ACTIONS = [...STAFF_MATRIX.super_admin] as StaffAction[];
const WRITE_ACTIONS = ALL_ACTIONS.filter((a) => a !== "read" && a !== "payments.read");

// ─── 1. The pure role decision ────────────────────────────────────────────────

test("the refusal copy is the brief's, verbatim", () => {
  assert.equal(STAFF_ONLY_AR, "هذا الإجراء لقيادة المنصة فقط");
  assert.equal(STAFF_CHECK_UNAVAILABLE_AR, "تعذّر التحقق من صلاحيتك الآن — أعد المحاولة");
});

test("a role that may not is a 403 with the brief's copy", () => {
  const d = staffDecision({ isAdmin: true, role: "operations", tableMissing: false }, "users.delete");
  assert.deepEqual(d, { allowed: false, role: "operations", status: 403, error: STAFF_ONLY_AR });
  const none = staffDecision({ isAdmin: true, role: null, tableMissing: false }, "settings.write");
  assert.deepEqual(none, { allowed: false, role: "auditor", status: 403, error: STAFF_ONLY_AR });
});

test("a failed staff read is fail-closed to auditor, and a refusal is a 503, not a 403", () => {
  for (const action of WRITE_ACTIONS) {
    const d = staffDecision({ isAdmin: true, role: null, tableMissing: false, readFailed: true }, action);
    assert.deepEqual(d, { allowed: false, role: null, status: 503, error: STAFF_CHECK_UNAVAILABLE_AR }, action);
  }
  // what an auditor may do still passes
  assert.deepEqual(
    staffDecision({ isAdmin: true, role: null, tableMissing: false, readFailed: true }, "read"),
    { allowed: true, role: "auditor" },
  );
  // a missing table still wins (today's rule); a non-admin is still refused
  assert.equal(
    staffDecision({ isAdmin: true, role: null, tableMissing: true, readFailed: true }, "users.delete").allowed,
    true,
  );
  assert.equal(
    staffDecision({ isAdmin: false, role: "super_admin", tableMissing: false, readFailed: true }, "read").allowed,
    false,
  );
});

test("a non-admin is refused every action, even with the table missing or a super_admin row", () => {
  for (const action of ALL_ACTIONS) {
    for (const tableMissing of [true, false]) {
      for (const role of ["super_admin", "operations", "auditor", null]) {
        const d = staffDecision({ isAdmin: false, role, tableMissing }, action);
        assert.equal(d.allowed, false, `${action} / tableMissing=${tableMissing} / role=${role}`);
      }
    }
  }
});

test("an admin with no platform_staff row is an auditor: read only (fail-closed)", () => {
  const read = staffDecision({ isAdmin: true, role: null, tableMissing: false }, "read");
  assert.deepEqual(read, { allowed: true, role: "auditor" });
  for (const action of WRITE_ACTIONS) {
    const d = staffDecision({ isAdmin: true, role: null, tableMissing: false }, action);
    assert.equal(d.allowed, false, action);
    assert.equal(d.role, "auditor");
  }
});

test("a role value outside the union reads as auditor, never as a wider role", () => {
  for (const role of ["Super_Admin", " super_admin", "owner", "admin", "", 1, {}, undefined]) {
    for (const action of WRITE_ACTIONS) {
      const d = staffDecision({ isAdmin: true, role, tableMissing: false }, action);
      assert.equal(d.allowed, false, `${String(role)} → ${action}`);
    }
    assert.equal(staffDecision({ isAdmin: true, role, tableMissing: false }, "read").allowed, true);
  }
});

test("before 20261019_30 runs (table missing) every admin keeps today's access", () => {
  for (const action of ALL_ACTIONS) {
    const d = staffDecision({ isAdmin: true, role: null, tableMissing: true }, action);
    assert.deepEqual(d, { allowed: true, role: "super_admin" }, action);
  }
});

test("a row's role decides exactly by the matrix", () => {
  for (const role of ["super_admin", "operations", "auditor"] as StaffRole[]) {
    for (const action of ALL_ACTIONS) {
      const d = staffDecision({ isAdmin: true, role, tableMissing: false }, action);
      assert.equal(d.allowed, STAFF_MATRIX[role].has(action), `${role} → ${action}`);
      assert.equal(d.role, role);
    }
  }
});

test("42P01 and PGRST205 mean the staff table is missing; nothing else does", () => {
  assert.equal(isMissingStaffTable("42P01"), true);
  assert.equal(isMissingStaffTable("PGRST205"), true);
  for (const code of ["42703", "PGRST204", "42501", "PGRST116", "", undefined]) {
    assert.equal(isMissingStaffTable(code), false, String(code));
  }
});

test("users PATCH: each field needs its own action; nothing recognised needs nothing", () => {
  assert.deepEqual(usersPatchActions({ user_type: "lawyer" }), ["users.change_type"]);
  assert.deepEqual(usersPatchActions({ user_type: "admin" }), ["users.change_type"]);
  assert.deepEqual(usersPatchActions({ status: "suspended" }), ["users.suspend"]);
  assert.deepEqual(usersPatchActions({ verified: true }), ["verifications.decide"]);
  assert.deepEqual(usersPatchActions({ verified: false }), ["verifications.decide"]);
  assert.deepEqual(usersPatchActions({ metadata: { a: 1 } }), ["users.change_type"]);
  assert.deepEqual(
    usersPatchActions({ user_type: "firm", metadata: {}, status: "suspended", verified: true }),
    ["users.change_type", "users.suspend", "verifications.decide"],
  );
  // status other than "suspended" is not a write the route performs
  assert.deepEqual(usersPatchActions({ status: "active" }), []);
  assert.deepEqual(usersPatchActions({}), []);
  assert.deepEqual(usersPatchActions(null), []);
  assert.deepEqual(usersPatchActions("x"), []);
  assert.deepEqual(usersPatchActions([]), []);
});

// ─── 1b. The audit row ────────────────────────────────────────────────────────

test("the audit row maps before/after to before_state/after_state as an admin actor", () => {
  const row = buildAdminAuditRow(
    {
      actorId: "a1",
      action: "user_deleted",
      targetType: "profile",
      targetId: "u1",
      before: { user_type: "lawyer" },
      after: null,
      metadata: { reason: "x" },
    },
    null,
  );
  assert.deepEqual(row, {
    actor_id: "a1",
    actor_type: "admin",
    action: "user_deleted",
    target_type: "profile",
    target_id: "u1",
    before_state: { user_type: "lawyer" },
    after_state: null,
    metadata: { reason: "x" },
  });
});

test("metadata is never null (the column is NOT NULL); a missing before/after is null", () => {
  const row = buildAdminAuditRow(
    { actorId: "a1", action: "setting_updated", targetType: "platform_setting", targetId: null },
    null,
  );
  assert.deepEqual(row.metadata, {});
  assert.equal(row.before_state, null);
  assert.equal(row.after_state, null);
  assert.equal(row.target_id, null);
});

test("actor_email is sent only when there is one (a central route sends a new column only when non-null)", () => {
  const base = { actorId: "a1", action: "x", targetType: "t", targetId: "1" };
  assert.equal("actor_email" in buildAdminAuditRow(base, null), false);
  assert.equal("actor_email" in buildAdminAuditRow(base, ""), false);
  assert.equal("actor_email" in buildAdminAuditRow(base, "   "), false);
  assert.equal(buildAdminAuditRow(base, "admin@example.com").actor_email, "admin@example.com");
});

test("42703 and PGRST204 mean actor_email is missing (retry without it); nothing else does", () => {
  assert.equal(isMissingAuditColumn("42703"), true);
  assert.equal(isMissingAuditColumn("PGRST204"), true);
  for (const code of ["42P01", "PGRST205", "42501", "", undefined]) {
    assert.equal(isMissingAuditColumn(code), false, String(code));
  }
});

// ─── 2. Source pins ───────────────────────────────────────────────────────────

/** The source with comment lines dropped (JSDoc, block and line comments). */
function codeOnly(source: string): string {
  return source
    .split(/\r?\n/)
    .filter((line) => {
      const t = line.trimStart();
      return !t.startsWith("*") && !t.startsWith("/*") && !t.startsWith("//");
    })
    .join("\n");
}

function routeCode(file: string): string {
  return codeOnly(readFileSync(join(ADMIN_API, ...file.split("/")), "utf8"));
}

/** One exported handler: from `export async function METHOD(` to the next export or EOF. */
function handler(file: string, method: string): string {
  const code = routeCode(file);
  const start = code.indexOf(`export async function ${method}(`);
  assert.ok(start > -1, `${file} has no ${method} handler`);
  const next = code.indexOf("\nexport ", start + 1);
  return code.slice(start, next === -1 ? code.length : next);
}

const WRITE_MARKERS = [
  ".insert(",
  ".update(",
  ".delete(",
  ".upsert(",
  ".rpc(",
  "auth.admin.deleteUser(",
  "auth.admin.createUser(",
  "auth.admin.updateUserById(",
  "grantEntitlement(",
  "grantLibraryAccess(",
  "fanOutBroadcast(",
  "dispatchOrderNotice(",
  "adjustPointsWith(",
  "refundOrderWith(",
  "freezeAccountWith(",
  "cancelAccountFreezeWith(",
  "purgeAccountWith(",
  "purgeNowWith(",
];

function firstWriteAt(body: string): number {
  const hits = WRITE_MARKERS.map((m) => body.indexOf(m)).filter((i) => i > -1);
  return hits.length ? Math.min(...hits) : -1;
}

function countOf(body: string, needle: string): number {
  return body.split(needle).length - 1;
}

/**
 * The route → action table (the brief's research table plus controller ruling
 * P13). `logs` is the least number of logAdminAction calls the handler holds —
 * one per arm that answers success after a write.
 */
const GATES: Array<{ file: string; method: string; action: StaffAction | "per-field"; logs: number }> = [
  { file: "payments/orders/[id]/refund/route.ts", method: "POST", action: "payments.refund", logs: 0 },
  { file: "users/[id]/route.ts", method: "DELETE", action: "users.delete", logs: 1 },
  { file: "users/[id]/route.ts", method: "PATCH", action: "per-field", logs: 1 },
  { file: "teams/route.ts", method: "POST", action: "staff.manage", logs: 1 },
  { file: "subscriptions/route.ts", method: "POST", action: "subscriptions.write", logs: 1 },
  { file: "subscriptions/[id]/route.ts", method: "PATCH", action: "subscriptions.write", logs: 1 },
  { file: "subscriptions/[id]/route.ts", method: "DELETE", action: "subscriptions.write", logs: 1 },
  { file: "entitlements/grant/route.ts", method: "POST", action: "entitlements.grant", logs: 1 },
  // reject arm, plan approve arm, library approve arm (approveLibraryRequest sits below PATCH)
  { file: "entitlements/requests/[id]/route.ts", method: "PATCH", action: "entitlements.decide", logs: 3 },
  { file: "credits/route.ts", method: "POST", action: "credits.adjust", logs: 1 },
  { file: "settings/route.ts", method: "PATCH", action: "settings.write", logs: 1 },
  { file: "library/route.ts", method: "DELETE", action: "library.delete", logs: 1 },
  { file: "library/route.ts", method: "PATCH", action: "settings.write", logs: 1 },
  { file: "articles/[id]/route.ts", method: "DELETE", action: "content.delete", logs: 1 },
  { file: "coupons/route.ts", method: "POST", action: "settings.write", logs: 1 },
  { file: "coupons/[id]/route.ts", method: "PATCH", action: "settings.write", logs: 1 },
  { file: "coupons/[id]/route.ts", method: "DELETE", action: "coupons.delete", logs: 1 },
  { file: "corporates/route.ts", method: "PATCH", action: "entitlements.grant", logs: 1 },
  // resend_whatsapp arm, assign arm, claim/deliver/cancel arm
  { file: "service-orders/[id]/route.ts", method: "PATCH", action: "orders.manage", logs: 3 },
  { file: "verifications/[id]/route.ts", method: "PATCH", action: "verifications.decide", logs: 1 },
  { file: "community/moderation/[id]/route.ts", method: "PATCH", action: "community.moderate", logs: 1 },
  { file: "community/reports/[id]/route.ts", method: "PATCH", action: "community.moderate", logs: 1 },
  { file: "broadcasts/route.ts", method: "POST", action: "broadcasts.send", logs: 1 },
  { file: "broadcasts/[id]/route.ts", method: "PATCH", action: "broadcasts.send", logs: 1 },
  // Controller ruling on concern 3: the auditor is read-only, so every other
  // admin write is gated with the closest existing action.
  { file: "articles/route.ts", method: "POST", action: "content.delete", logs: 1 },
  { file: "articles/[id]/route.ts", method: "PATCH", action: "content.delete", logs: 1 },
  { file: "feature-requests/[id]/route.ts", method: "PATCH", action: "tickets.manage", logs: 1 },
  { file: "library-invitations/route.ts", method: "POST", action: "entitlements.grant", logs: 1 },
  // owner note ١٨ C04: revoke / end change of a library grant (one rpc, one audit row)
  { file: "library-grants/[id]/route.ts", method: "PATCH", action: "entitlements.grant", logs: 1 },
  { file: "library-issue-reports/[id]/route.ts", method: "PATCH", action: "tickets.manage", logs: 1 },
  // library fortress (30-Oct package): an admin opens or lifts a library security lock (one audit row each)
  { file: "library-security-locks/route.ts", method: "POST", action: "settings.write", logs: 1 },
  { file: "library-security-locks/[id]/lift/route.ts", method: "POST", action: "settings.write", logs: 1 },
  { file: "library-monitor/settings/route.ts", method: "PUT", action: "settings.write", logs: 1 },
  { file: "library-monitor/flags/[id]/clear/route.ts", method: "POST", action: "settings.write", logs: 1 },
  { file: "library-monitor/user-limits/route.ts", method: "POST", action: "settings.write", logs: 1 },
  { file: "library-monitor/user-limits/[userId]/route.ts", method: "DELETE", action: "settings.write", logs: 1 },
  { file: "receipts/route.ts", method: "POST", action: "orders.manage", logs: 1 },
  { file: "tickets/route.ts", method: "POST", action: "tickets.manage", logs: 1 },
  { file: "tickets/[id]/route.ts", method: "PATCH", action: "tickets.manage", logs: 1 },
  { file: "teams/route.ts", method: "PATCH", action: "staff.manage", logs: 1 },
];

for (const { file, method, action, logs } of GATES) {
  test(`${file} ${method}: ${action} before any write, then one audit row`, () => {
    const body = handler(file, method);
    const writeAt = firstWriteAt(body);
    assert.ok(writeAt > -1, "no write found — the pin table is stale");

    const gateNeedle = action === "per-field" ? "await requireStaff(" : `await requireStaff("${action}")`;
    const gateAt = body.indexOf(gateNeedle);
    assert.ok(gateAt > -1, `${gateNeedle} is missing`);
    assert.ok(gateAt < writeAt, "the staff gate must run before the first write");

    const logAt = body.indexOf("logAdminAction(");
    if (logs > 0) assert.ok(logAt > writeAt, "logAdminAction must come after the write it records");
    assert.ok(
      countOf(body, "logAdminAction(") >= logs,
      `expected at least ${logs} logAdminAction call(s), one per successful arm`,
    );

    assert.equal(body.includes("requireAdmin("), false, "a gated write handler must not keep requireAdmin()");
    assert.equal(body.includes("assertRole("), false, "a gated write handler must not keep assertRole()");
    assert.equal(body.includes("auth.getUser("), false, "the inline admin check must be gone — requireStaff does it");
    assert.equal(body.includes('from("admin_audit_events")'), false, "audit rows go through logAdminAction only");
  });
}

/** Every POST/PUT/PATCH/DELETE handler under /api/v1/admin, as "file METHOD" → its code. */
function adminWriteHandlers(): Map<string, string> {
  const found = new Map<string, string>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name === "route.ts") {
        const rel = relative(ADMIN_API, p).split(sep).join("/");
        const code = codeOnly(readFileSync(p, "utf8"));
        for (const m of code.matchAll(/export (?:async function|const) (POST|PUT|PATCH|DELETE)\b/g)) {
          found.set(`${rel} ${m[1]}`, handler(rel, m[1]));
        }
      }
    }
  };
  walk(ADMIN_API);
  return found;
}

test("every admin write handler calls requireStaff — nothing slips through again", () => {
  const handlers = adminWriteHandlers();
  assert.ok(handlers.size >= GATES.length, "the walk found fewer write handlers than the pin table");
  const missing = [...handlers].filter(([, code]) => !code.includes("await requireStaff(")).map(([k]) => k);
  assert.deepEqual(missing, [], "admin write handlers without requireStaff()");
});

test("every admin write handler has a pinned action (and every pin still exists)", () => {
  const handlers = adminWriteHandlers();
  const gated = new Set(GATES.map((g) => `${g.file} ${g.method}`));
  const unpinned = [...handlers.keys()].filter((k) => !gated.has(k));
  assert.deepEqual(unpinned, [], "add each new admin write handler to GATES with its action");
  for (const key of gated) assert.ok(handlers.has(key), `${key} is pinned but no longer exists`);
});

test("users PATCH: the gate covers each field's action, and 'admin' is refused on the server", () => {
  const body = handler("users/[id]/route.ts", "PATCH");
  const writeAt = firstWriteAt(body);
  const actionsAt = body.indexOf("usersPatchActions(");
  assert.ok(actionsAt > -1 && actionsAt < writeAt, "the actions come from usersPatchActions(body)");
  const loopAt = body.indexOf("await requireStaff(action)");
  assert.ok(loopAt > actionsAt && loopAt < writeAt, "every derived action is checked before the write");

  const refusalAt = body.indexOf('"لا يمكن منح صلاحية المشرف من هنا"');
  assert.ok(refusalAt > -1, "the server-side refusal of user_type 'admin' is missing");
  assert.ok(refusalAt < writeAt, "the refusal must come before the write");
  const refusal = body.slice(body.lastIndexOf("if (", refusalAt), body.indexOf(");", refusalAt));
  assert.ok(refusal.includes('=== "admin"'), "the refusal is keyed on user_type === \"admin\"");
  assert.ok(body.slice(refusalAt, refusalAt + 200).includes("status: 403"), "the refusal is a 403");
  assert.ok(body.includes("isAssignableUserType("), "any other user_type must be one the database allows");
  assert.ok(
    body.includes('return NextResponse.json({ error: "لا توجد حقول للتحديث" }, { status: 400 })'),
    "a body with nothing the route writes is a 400, not a silent success",
  );
});

test("users DELETE: an admin cannot delete their own account from the console", () => {
  const body = handler("users/[id]/route.ts", "DELETE");
  const gateAt = body.indexOf('await requireStaff("users.delete")');
  const refusalAt = body.indexOf('"لا يمكنك حذف حسابك من لوحة الإدارة"');
  const deleteAt = body.indexOf("auth.admin.deleteUser(");
  assert.ok(refusalAt > -1, "the self-delete refusal is missing");
  assert.ok(gateAt < refusalAt && refusalAt < deleteAt, "gate, then the self-delete refusal, then the delete");
  const guard = body.slice(body.lastIndexOf("if (", refusalAt), refusalAt);
  assert.ok(
    guard.includes("userId.toLowerCase() === gate.userId.toLowerCase()"),
    "the refusal compares the target with the caller case-insensitively (an upper-cased UUID is the same account)",
  );
  assert.ok(body.slice(refusalAt, refusalAt + 80).includes("status: 400"), "the refusal is a 400");
});

test("users PATCH: a suspension's audit row records what its writes really did", () => {
  const body = handler("users/[id]/route.ts", "PATCH");
  const cancelAt = body.indexOf('.from("subscriptions")');
  assert.ok(cancelAt > -1, "the suspension no longer cancels subscriptions");
  const cancel = body.slice(cancelAt, body.indexOf(";", cancelAt));
  assert.ok(cancel.includes('.select("id")'), "the cancel returns its rows, so the count is real");
  assert.ok(/const \{ data: cancelledRows, error: cancelError \}/.test(body), "the cancel's result is captured");
  assert.ok(/const \{ data: tierResult, error: tierError \}/.test(body), "the tier change's result is captured");

  // either error → 500 «تعذّر إكمال الإيقاف», recorded as a failed suspension, never as done
  const helperAt = body.indexOf("const suspensionFailed = async");
  assert.ok(helperAt > -1 && helperAt < cancelAt, "one failure path, defined before the writes");
  const helper = body.slice(helperAt, cancelAt);
  assert.ok(helper.includes('"user_suspension_failed"'), "a half-completed suspension is recorded as failed");
  const msgAt = helper.indexOf('"تعذّر إكمال الإيقاف"');
  assert.ok(msgAt > -1 && helper.slice(msgAt, msgAt + 80).includes("status: 500"), "the failure answers 500 «تعذّر إكمال الإيقاف»");
  assert.ok(helper.indexOf("logAdminAction(") < msgAt, "the failed row is written, then the 500");
  assert.equal(countOf(body, "return suspensionFailed("), 2, "both writes return through the failure path");
  assert.ok(body.indexOf("if (cancelError)") > cancelAt, "the cancel's error is checked");
  assert.ok(body.indexOf("if (tierError)") > body.indexOf("if (cancelError)"), "the tier error is checked");

  // success records the real values, never the old constants
  assert.equal(body.includes('active_subscriptions: "cancelled"'), false, "no fixed claim of a cancellation");
  assert.ok(body.includes("cancelled_count"), "the success row carries the real cancelled count");
  assert.ok(/auth_tier\s*[:=]\s*.*tierResult/.test(body), "the tier recorded is the one the auth admin API returned");
});

test("deleting a row that does not exist is a 404 and writes no audit row", () => {
  const routes: Array<[string, string]> = [
    ["articles/[id]/route.ts", "DELETE"],
    ["coupons/[id]/route.ts", "DELETE"],
    ["library/route.ts", "DELETE"],
  ];
  for (const [file, method] of routes) {
    const body = handler(file, method);
    const deleteAt = body.indexOf(".delete()");
    assert.ok(deleteAt > -1, `${file}: no delete`);
    const call = body.slice(deleteAt, body.indexOf(";", deleteAt));
    assert.ok(/\.select\(/.test(call), `${file}: the delete must return what it removed`);
    const notFoundAt = body.indexOf('"غير موجود"', deleteAt);
    const logAt = body.indexOf("logAdminAction(", deleteAt);
    assert.ok(notFoundAt > deleteAt && notFoundAt < logAt, `${file}: the 404 comes after the delete and before the audit row`);
    assert.ok(body.slice(notFoundAt, notFoundAt + 60).includes("status: 404"), `${file}: zero rows deleted is a 404`);
    const guard = body.slice(body.lastIndexOf("if (", notFoundAt), notFoundAt);
    assert.ok(/\.length === 0/.test(guard), `${file}: the 404 is keyed on zero deleted rows`);
  }
});

test("the community and verification routes keep their audit labels and metadata", () => {
  const moderation = handler("community/moderation/[id]/route.ts", "PATCH");
  assert.ok(moderation.includes('DB_STATUS_TO_AUDIT_ACTION[newStatus] ?? "community_post_moderated"'));
  assert.ok(moderation.includes("metadata: { reason: body.reason ?? null, action: rawAction }"));
  assert.ok(moderation.includes('targetType: "community_post"'));

  const reports = handler("community/reports/[id]/route.ts", "PATCH");
  assert.ok(reports.includes('STATUS_TO_AUDIT_ACTION[newStatus] ?? "community_report_triaged"'));
  assert.ok(reports.includes("metadata: { status: newStatus }"));
  assert.ok(reports.includes('targetType: "community_report"'));

  const verifications = handler("verifications/[id]/route.ts", "PATCH");
  assert.ok(verifications.includes('action === "approve" ? "verification_approved" : "verification_rejected"'));
  assert.ok(verifications.includes("metadata: { reason: reason ?? null }"));
  assert.ok(verifications.includes("targetType: updatedType"));
});

test("nothing outside adminAudit.ts inserts into admin_audit_events (one row per action)", () => {
  // onboarding/account-type records a USER's own claim (actor_type "user");
  // logAdminAction writes actor_type "admin" only, so that writer stays.
  const ALLOWED = new Set(["lib/auth/adminAudit.ts", "app/api/v1/onboarding/account-type/route.ts"]);
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        walk(p);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(name) || /\.test\.ts$/.test(name)) continue;
      const rel = relative(SRC, p).split(sep).join("/");
      const code = codeOnly(readFileSync(p, "utf8"));
      for (const m of code.matchAll(/from\("admin_audit_events"\)/g)) {
        const tail = code.slice(m.index, m.index + 120);
        if (/^from\("admin_audit_events"\)\s*\.(insert|upsert|update|delete)\(/.test(tail) && !ALLOWED.has(rel)) {
          offenders.push(rel);
        }
      }
    }
  };
  walk(SRC);
  assert.deepEqual(offenders, []);
  const onboarding = codeOnly(readFileSync(join(SRC, "app/api/v1/onboarding/account-type/route.ts"), "utf8"));
  assert.ok(onboarding.includes('actor_type: "user"'), "the allow-listed onboarding writer must be a user actor");
});

test("requireStaff: requireAdmin first, the role from platform_staff with the service client, fail-closed", () => {
  const src = codeOnly(readFileSync(join(SRC, "lib/access-control.ts"), "utf8"));
  const start = src.indexOf("export async function requireStaff(action: StaffAction)");
  assert.ok(start > -1, "requireStaff(action: StaffAction) is missing");
  const end = src.indexOf("\nexport ", start + 1);
  const fn = src.slice(start, end === -1 ? src.length : end);
  assert.ok(fn.indexOf("await requireAdmin()") > -1, "requireStaff must call requireAdmin()");
  assert.ok(
    fn.includes("{ error: adminCheck.error") && fn.includes("status: adminCheck.status"),
    "requireAdmin's 503/401/403 pass through unchanged",
  );
  assert.ok(fn.includes("staffDecision("), "the decision is the pure staffDecision()");
  assert.ok(
    fn.includes("{ error: decision.error }, { status: decision.status }"),
    "a refusal answers the decision's 403 (role) or 503 (read failed)",
  );
  assert.ok(fn.includes("readFailed"), "a failed read reaches the decision as readFailed");

  // the reader
  assert.ok(src.includes('.from("platform_staff")'), "the role is read from platform_staff");
  assert.ok(src.includes('.select("staff_role")'));
  assert.ok(src.includes("isMissingStaffTable(error.code)"), "42P01 / PGRST205 keep today's rule");
  const readerAt = src.indexOf('.from("platform_staff")');
  const readerFn = src.slice(src.lastIndexOf("async function", readerAt), readerAt);
  assert.ok(readerFn.includes("createServiceClient()"), "the role is read with the service client");
});

test("logAdminAction: service-role insert, actor_email looked up, retried without it, never throws", () => {
  const src = codeOnly(readFileSync(join(SRC, "lib/auth/adminAudit.ts"), "utf8"));
  assert.ok(src.includes("export async function logAdminAction(input: AdminActionInput): Promise<void>"));
  assert.ok(src.includes("createServiceClient()"));
  assert.ok(src.includes('.from("admin_audit_events")'));
  assert.ok(src.includes("auth.admin.getUserById("), "actor_email comes from auth.users");
  assert.ok(src.includes("isMissingAuditColumn(error.code)"), "42703 / PGRST204 retry without actor_email");
  assert.ok(src.includes("buildAdminAuditRow(input, null)"), "the retry drops actor_email");
  assert.ok(/\}\s*catch\s*\(/.test(src), "every failure is caught and logged");
  assert.equal(/\bthrow\b/.test(src), false, "logAdminAction never throws");
});

test("users DELETE (D6, owner ٢٩٨): freeze by default, restore, and purge only for a super admin with the typed phrase", () => {
  const body = handler("users/[id]/route.ts", "DELETE");
  const gateAt = body.indexOf('await requireStaff("users.delete")');
  const modeAt = body.indexOf('request.nextUrl.searchParams.get("mode") ?? "freeze"');
  assert.ok(modeAt > gateAt, "the mode defaults to freeze, read after the gate");
  const superAt = body.indexOf('mode === "purge" && gate.role !== "super_admin"');
  assert.ok(superAt > modeAt, "purge is refused to anyone but a super admin");
  assert.ok(body.slice(superAt, superAt + 160).includes("status: 403"), "as a 403");

  const freezeAt = body.indexOf("freezeAccountWith(");
  const cancelAt = body.indexOf("cancelAccountFreezeWith(");
  const purgeAt = body.indexOf("purgeNowWith(");
  const claimAt = body.indexOf('.rpc("account_purge_claim_user"');
  const phraseAt = body.indexOf("phraseMatches(body?.confirm, ADMIN_PURGE_CONFIRM_AR)");
  const lastSuperAt = body.indexOf("checkStaffRoleChange(");
  assert.ok(freezeAt > -1 && cancelAt > -1 && purgeAt > -1, "the three modes go through the shared library");
  assert.ok(phraseAt > freezeAt && phraseAt < lastSuperAt, "the typed phrase is checked on the purge arm, before anything else there");
  assert.ok(lastSuperAt < claimAt && claimAt < purgeAt, "last-super-admin rule, then the claim, then the cron's purge");

  // the bare deleteUser survives only on the arm where 20261026_70 is missing
  const deleteAt = body.indexOf("auth.admin.deleteUser(");
  const legacy = body.slice(body.lastIndexOf("if (claimError)", deleteAt), deleteAt);
  assert.ok(legacy.includes("if (claimError)"), "deleteUser is reached only when the claim function is missing");
  assert.equal(countOf(body, "auth.admin.deleteUser("), 1, "one legacy deleteUser, nowhere else");

  // an admin account is not frozen
  const adminFreeze = body.slice(body.indexOf('if (mode === "freeze")'), freezeAt);
  assert.ok(adminFreeze.includes('target.user_type === "admin"'), "an admin target is refused before the freeze");
  for (const action of ['"user_deletion_requested"', '"user_deletion_cancelled"', '"user_deletion_blocked"', '"user_deleted"']) {
    assert.ok(body.includes(action), `the audit row ${action}`);
  }
});

test("users.delete is a super_admin action only (the freeze and the purge both need it)", () => {
  for (const role of Object.keys(STAFF_MATRIX) as StaffRole[]) {
    assert.equal(STAFF_MATRIX[role].has("users.delete"), role === "super_admin", role);
  }
});
