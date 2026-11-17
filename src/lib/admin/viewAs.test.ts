/**
 * viewAs.test.ts — S2 «عرض كمستخدم»: the view reads ONLY the target user's
 * rows, only reads, never ships metadata (internal notes), and every session
 * is audited before any data is shown.
 * Run: node --test src/lib/admin/viewAs.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { fakeDb, has, type FakeQuery } from "../payments/fakeDb.test-helper.ts";
import {
  isUuid,
  parseViewAsPage,
  readViewAsCases,
  readViewAsHome,
  readViewAsProfile,
  readViewAsTarget,
  viewAsAuditInput,
  VIEW_AS_PAGE_ACTION,
  VIEW_AS_START_ACTION,
} from "./viewAsCore.ts";
import { buildAdminAuditRow } from "../auth/adminAuditRow.ts";
import { staffCan } from "../auth/staffRoles.ts";

const TARGET = "00000000-0000-0000-0000-0000000d0001";
const ADMIN = "00000000-0000-0000-0000-00000000a001";
const SESSION = "00000000-0000-0000-0000-00000000e001";
const NOW = new Date("2026-11-20T08:00:00.000Z");
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "..");

/** The owner column each table is read by, for the target. */
const OWNER_FILTERS: Record<string, string[]> = {
  profiles: ["id"],
  service_requests: ["requester_user_id", "assigned_to"],
  consultations: ["requester_user_id", "lawyer_user_id"],
  lawyer_clients: ["owner_user_id"],
  notifications: ["user_id"],
  subscriptions: ["user_id"],
  lawyer_profiles: ["user_id"],
};

function assertScoped(log: FakeQuery[]) {
  assert.ok(log.length > 0);
  for (const q of log) {
    if (q.op === "rpc") {
      assert.equal(q.table, "points_balance", "the only RPC is the read points_balance");
      assert.deepEqual(q.payload, { p_user: TARGET });
      continue;
    }
    assert.equal(q.op, "select", `${q.table}: reads only`);
    const cols = OWNER_FILTERS[q.table];
    assert.ok(cols, `unexpected table ${q.table}`);
    assert.ok(
      cols.some((c) => has(q, "eq", c, TARGET)),
      `${q.table} must be filtered to the target (${cols.join(" | ")})`,
    );
    if (q.table !== "profiles") {
      assert.ok(!/\*|metadata/.test(q.columns ?? ""), `${q.table}: named columns, never * or metadata`);
    }
  }
}

test("home: every query is a read filtered to the target user; counts and plan come back", async () => {
  const { client, log } = fakeDb((q) => {
    if (q.op === "rpc") return { data: 120 };
    if (q.table === "subscriptions")
      return {
        data: [
          { tier: "pro", current_period_end: "2026-01-01T00:00:00Z", subscription_plans: { name_ar: "منتهية" } },
          { tier: "pro", current_period_end: "2027-01-01T00:00:00Z", subscription_plans: { name_ar: "احترافية" } },
        ],
      };
    if (q.table === "consultations" && has(q, "eq", "lawyer_user_id"))
      return { data: [{ scheduled_at: "2026-11-25T10:00:00Z" }] };
    if (q.table === "consultations") return { data: [{ scheduled_at: "2026-11-22T10:00:00Z" }] };
    return { data: [{ id: 1 }, { id: 2 }] };
  });
  const home = await readViewAsHome(client, TARGET, NOW);
  assertScoped(log);
  assert.equal(home.pointsBalance, 120);
  assert.equal(home.nextConsultationAt, "2026-11-22T10:00:00Z");
  assert.deepEqual(home.plan, { name: "احترافية", tier: "pro", endsAt: "2027-01-01T00:00:00Z" });
  assert.equal(home.openRequested, 2);
});

test("home: a failed read is «—» (null), never a zero", async () => {
  const { client } = fakeDb(() => ({ error: { code: "57014", message: "timeout" } }));
  const home = await readViewAsHome(client, TARGET, NOW);
  assert.equal(home.openRequested, null);
  assert.equal(home.clients, null);
  assert.equal(home.pointsBalance, null);
  assert.equal(home.plan, null);
});

test("cases: both sides, de-duplicated, AI workspace runs dropped, no metadata", async () => {
  const { client, log } = fakeDb((q) => {
    if (has(q, "eq", "requester_user_id"))
      return {
        data: [
          { id: "a", title: "قضية أ", status: "assigned", created_at: "2026-11-02", receiver: "lawyer" },
          { id: "ai", title: "تشغيل", status: "assigned", created_at: "2026-11-05", receiver: "ai_workspace" },
        ],
      };
    return {
      data: [
        { id: "a", title: "قضية أ", status: "assigned", created_at: "2026-11-02", receiver: "lawyer" },
        { id: "b", title: "قضية ب", status: "in_review", created_at: "2026-11-03", receiver: "lawyer", metadata: { internalNotes: "سري" } },
      ],
    };
  });
  const rows = await readViewAsCases(client, TARGET);
  assertScoped(log);
  assert.deepEqual(rows?.map((r) => [r.id, r.side]), [["b", "assignee"], ["a", "requester"]]);
  assert.ok(!JSON.stringify(rows).includes("سري"), "an internal note never reaches the view");
});

test("profile + target: scoped reads, demo flag passed through", async () => {
  const { client, log } = fakeDb((q) => {
    if (q.table === "profiles")
      return { data: { display_name: "محامٍ تجريبي", email: "d@example.test", user_type: "lawyer", is_demo: true } };
    return { data: { verification_status: "verified", practice_kind: "advocate", marketplace_visible: false } };
  });
  const p = await readViewAsProfile(client, TARGET);
  const t = await readViewAsTarget(client, TARGET);
  assertScoped(log);
  assert.equal(p?.isDemo, true);
  assert.equal(p?.lawyer?.verificationStatus, "verified");
  assert.deepEqual(t, { id: TARGET, name: "محامٍ تجريبي", email: "d@example.test", userType: "lawyer", isDemo: true });
});

test("audit rows: start + page carry admin, target, session, page and the start time", () => {
  const start = buildAdminAuditRow(
    viewAsAuditInput({ adminId: ADMIN, targetId: TARGET, sessionId: SESSION, page: "home", kind: "start", at: NOW }),
    null,
  );
  assert.equal(start.actor_id, ADMIN);
  assert.equal(start.action, VIEW_AS_START_ACTION);
  assert.equal(start.target_type, "user");
  assert.equal(start.target_id, TARGET);
  assert.deepEqual(start.metadata, { session_id: SESSION, page: "home", started_at: NOW.toISOString(), read_only: true });
  const page = buildAdminAuditRow(
    viewAsAuditInput({ adminId: ADMIN, targetId: TARGET, sessionId: SESSION, page: "cases", kind: "page", at: NOW }),
    null,
  );
  assert.equal(page.action, VIEW_AS_PAGE_ACTION);
  assert.equal((page.metadata as { page: string }).page, "cases");
  assert.equal((page.metadata as { session_id: string }).session_id, SESSION);
});

test("input checks: pages and ids", () => {
  assert.equal(parseViewAsPage("home"), "home");
  assert.equal(parseViewAsPage("settings"), null);
  assert.equal(parseViewAsPage(undefined), null);
  assert.equal(isUuid(TARGET), true);
  assert.equal(isUuid("1; drop table"), false);
});

test("only super_admin may view as a user", () => {
  assert.equal(staffCan("super_admin", "users.view_as"), true);
  assert.equal(staffCan("operations", "users.view_as"), false);
  assert.equal(staffCan("auditor", "users.view_as"), false);
});

test("route: GET only, gated, audit BEFORE data, 503 when the audit row does not land, no sign-in as the user", () => {
  const src = readFileSync(join(SRC, "app/api/v1/admin/users/[id]/view-as/route.ts"), "utf8");
  assert.ok(!/export async function (POST|PATCH|PUT|DELETE)/.test(src), "no write method");
  assert.ok(src.includes('requireStaff("users.view_as")'));
  const auditAt = src.indexOf("logAdminActionsStrict(rows)");
  const readAt = src.indexOf("readViewAsPage(admin");
  assert.ok(auditAt > 0 && readAt > auditAt, "the audit row lands before any user data is read");
  const gateAt = src.indexOf("if (!(await logAdminActionsStrict(rows)))");
  assert.ok(gateAt > 0 && src.slice(gateAt, gateAt + 200).includes(", 503)"), "no audit row → 503, nothing shown");
  for (const banned of ["signInWith", "generateLink", "createSession", "setSession", "admin.auth"]) {
    assert.ok(!src.includes(banned), `the view never signs in as the user (${banned})`);
  }
});

test("page: the read-only banner is there and the screen has no form or write call", () => {
  const src = readFileSync(join(SRC, "app/dashboard/admin/users/[id]/view-as/page.tsx"), "utf8");
  assert.ok(src.includes("أنت تعرض حساب {name} للقراءة فقط"));
  assert.ok(!/<form|method:\s*"(POST|PATCH|PUT|DELETE)"/.test(src), "no form, no write fetch");
  const user = readFileSync(join(SRC, "app/dashboard/admin/users/[id]/page.tsx"), "utf8");
  assert.ok(!user.includes("setImpersonating"), "the fake impersonation banner (S12) is gone");
  assert.ok(user.includes("/view-as`"), "the user page links the real view");
});
