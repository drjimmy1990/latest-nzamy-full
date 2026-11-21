import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  INTERMEDIARY_NOTICE_AR,
  MARKET_DEFAULTS,
  acceptResultReply,
  acceptanceStatusAr,
  applyMarketPatch,
  decideResultReply,
  isMarketSqlMissing,
  isOverdue,
  parseMarketSettings,
  readMarketPatch,
} from "./marketSettings.ts";

const src = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

test("N9: the owner's sentence, word for word (RAW[38])", () => {
  assert.equal(INTERMEDIARY_NOTICE_AR, "المنصة وسيط لا ضامن ولا أمين على الأتعاب.");
});

test("Q130a / RAW[66] / Q151: defaults are open, admin approval, 30 minutes", () => {
  assert.deepEqual({ ...MARKET_DEFAULTS }, { open: true, openedAt: null, acceptMode: "admin_approval", approvalMinutes: 30 });
  const s = parseMarketSettings({ open: true, opened_at: "2026-12-02T10:00:00Z", accept_mode: "admin_approval", approval_minutes: 30 });
  assert.deepEqual(s, { open: true, openedAt: "2026-12-02T10:00:00Z", acceptMode: "admin_approval", approvalMinutes: 30 });
  assert.equal(parseMarketSettings({ accept_mode: "instant" }).acceptMode, "instant");
});

test("parseMarketSettings: no row → closed (the database still lists published rows only); junk → safe values", () => {
  assert.equal(parseMarketSettings(null, false).open, false);
  const junk = parseMarketSettings({ open: "yes", opened_at: "not a date", accept_mode: "auto", approval_minutes: 2 });
  assert.deepEqual(junk, { open: false, openedAt: null, acceptMode: "admin_approval", approvalMinutes: 30 });
  assert.equal(parseMarketSettings({ approval_minutes: 5000 }).approvalMinutes, 30);
  assert.equal(parseMarketSettings({ approval_minutes: "45" }).approvalMinutes, 45);
});

test("readMarketPatch: validates each field, Arabic errors", () => {
  assert.deepEqual(readMarketPatch({ open: false, acceptMode: "instant", approvalMinutes: 60 }), {
    ok: true,
    patch: { open: false, acceptMode: "instant", approvalMinutes: 60 },
  });
  assert.equal(readMarketPatch({ open: "no" }).ok, false);
  assert.equal(readMarketPatch({ acceptMode: "auto_accept" }).ok, false);
  assert.equal(readMarketPatch({ approvalMinutes: 3 }).ok, false);
  assert.equal(readMarketPatch({ approvalMinutes: 1.5 }).ok, false);
  assert.equal(readMarketPatch(null).ok, false);
  assert.deepEqual(readMarketPatch({}), { ok: true, patch: {} });
});

test("applyMarketPatch: re-opening stamps a new opened_at (no flood of old requests); staying open keeps it", () => {
  const now = "2026-12-03T08:00:00.000Z";
  const closed = { open: false, openedAt: "2026-12-01T00:00:00Z", acceptMode: "admin_approval" as const, approvalMinutes: 30 };
  assert.equal(applyMarketPatch(closed, { open: true }, now).opened_at, now);
  const open = { ...closed, open: true };
  assert.equal(applyMarketPatch(open, { approvalMinutes: 45 }, now).opened_at, "2026-12-01T00:00:00Z");
  assert.deepEqual(applyMarketPatch(open, { acceptMode: "instant" }, now), {
    open: true,
    opened_at: "2026-12-01T00:00:00Z",
    accept_mode: "instant",
    approval_minutes: 30,
  });
  assert.equal(applyMarketPatch(open, { open: false }, now).open, false);
});

test("acceptResultReply: every database answer has an honest Arabic message and status", () => {
  const pending = acceptResultReply("pending", 30);
  assert.equal(pending.status, 200);
  assert.match(pending.message, /٣٠ دقيقة/);
  assert.match(pending.message, /لا يُسند إليك الطلب إلا بعد الاعتماد/);
  assert.equal(acceptResultReply("assigned").status, 200);
  assert.equal(acceptResultReply("not_open").status, 409);
  assert.equal(acceptResultReply("not_verified").status, 403);
  assert.equal(acceptResultReply("test_account").status, 403);
  assert.equal(acceptResultReply("too_many_pending").status, 429);
  assert.equal(acceptResultReply("whatever").status, 500);
  for (const r of ["pending", "assigned", "already_pending", "not_open", "not_verified", "test_account"]) {
    assert.doesNotMatch(acceptResultReply(r, 30).message, /تلقائياً يُقبل|ضمان|escrow/i, r);
  }
});

test("decideResultReply + statuses + overdue", () => {
  assert.equal(decideResultReply("approved").status, 200);
  assert.equal(decideResultReply("taken").status, 409);
  assert.equal(decideResultReply("not_assignable").status, 409);
  assert.equal(acceptanceStatusAr("superseded"), "أُسند لغيرك");
  assert.equal(acceptanceStatusAr("nope"), "غير معروف");
  const now = Date.parse("2026-12-02T10:31:00Z");
  assert.equal(isOverdue({ status: "pending", due_at: "2026-12-02T10:30:00Z" }, now), true);
  assert.equal(isOverdue({ status: "pending", due_at: "2026-12-02T10:32:00Z" }, now), false);
  assert.equal(isOverdue({ status: "approved", due_at: "2026-12-02T10:30:00Z" }, now), false);
  assert.equal(isMarketSqlMissing("PGRST202"), true);
  assert.equal(isMarketSqlMissing("23505"), false);
});

test("routes: the lawyer's ask goes through the definer function with his own session, never a table write", () => {
  const accept = src("app/api/v1/lawyer/open-requests/[id]/accept/route.ts");
  assert.match(accept, /supabase\.rpc\("marketplace_request_accept"/);
  assert.doesNotMatch(accept, /from\("marketplace_acceptances"\)\s*\.(insert|update)/);
  assert.match(accept, /INTERMEDIARY_NOTICE_AR/);
  const withdraw = src("app/api/v1/lawyer/market-requests/[id]/withdraw/route.ts");
  assert.match(withdraw, /rpc\("marketplace_acceptance_withdraw"/);
});

test("routes: admin decisions and assignment never write the request's status (the client's webhook keys off status)", () => {
  for (const rel of [
    "app/api/v1/admin/marketplace/acceptances/[id]/route.ts",
    "app/api/v1/admin/marketplace/requests/[id]/route.ts",
  ]) {
    const s = src(rel);
    assert.doesNotMatch(s, /status:\s*"(in_review|assigned|completed)"/, rel);
    assert.doesNotMatch(s, /dispatchToN8n|dispatchOrderNotice/, rel);
    assert.match(s, /requireStaff\("orders\.manage"\)/, rel);
    assert.match(s, /logAdminAction/, rel);
  }
  assert.match(src("app/api/v1/admin/marketplace/settings/route.ts"), /requireStaff\("settings\.write"\)/);
  assert.match(src("app/api/v1/cron/marketplace-acceptance-alerts/route.ts"), /cronSecretMatches/);
});

test("N9 on every market card; the admin page no longer shows made-up orders", () => {
  const list = src("components/marketplace/OpenRequestsList.tsx");
  assert.ok((list.match(/<IntermediaryNotice/g) ?? []).length >= 2, "list intro + each card");
  const adminPage = src("app/dashboard/admin/marketplace/orders/page.tsx");
  assert.doesNotMatch(adminPage, /MO-41\d|شركة الحلول القانونية|TOP_SERVICES/);
  assert.match(adminPage, /IntermediaryNotice/);
  const post = src("app/marketplace/post/page.tsx");
  assert.doesNotMatch(post, /يُدفع المبلغ عبر بوابة دفع/);
  assert.match(post, /INTERMEDIARY_NOTICE_AR/);
});

test("service-orders: «إلغاء النشر» also hides an auto-listed request, with a fallback before 20261202_70", () => {
  const s = src("app/api/v1/admin/service-orders/[id]/route.ts");
  assert.match(s, /marketplace_hidden_at: publishing \? null : nowIso/);
  assert.match(s, /publishError\.code === "42703" \|\| publishError\.code === "PGRST204"/);
});
