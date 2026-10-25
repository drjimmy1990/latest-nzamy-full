import test from "node:test";
import assert from "node:assert/strict";
import {
  HEARING_OUTBOX_CONFLICT_KEY,
  HEARING_QUEUE_GRACE_MINUTES,
  buildHearingReminderCopy,
  checkHearingDelivery,
  hearingKind,
  hearingReminderHref,
  hearingWindow,
  planHearingReminders,
  queueHearingReminders,
  reconcileHearingOutbox,
  riyadhInstantMs,
  type ExistingHearingOutboxRow,
  type HearingTarget,
} from "./hearingReminders.ts";

const H = "00000000-0000-0000-0000-00000000b001";
const target = (over: Partial<HearingTarget> = {}): HearingTarget => ({
  hearing_id: H,
  recipient_user_id: "u-owner",
  via: "owner",
  case_request_id: "case-f",
  title: "جلسة نظر الدعوى",
  hearing_date: "2026-11-10",
  hearing_time: "09:00:00",
  court_name: "المحكمة التجارية بالرياض",
  location: "",
  created_at: "2026-10-01T08:00:00Z",
  ...over,
});
const iso = (s: string) => new Date(s).toISOString();

test("wall clock is read as Riyadh (+03:00): 07:00 Riyadh is 04:00Z", () => {
  assert.equal(new Date(riyadhInstantMs({ date: "2026-11-10", time: "07:00" })).toISOString(), "2026-11-10T04:00:00.000Z");
  assert.equal(hearingKind("eve"), "hearing_reminder_eve");
});

test("the queue window is Riyadh today .. +8 days, crossing midnight UTC correctly", () => {
  assert.deepEqual(hearingWindow(new Date("2026-10-25T22:30:00Z")), { from: "2026-10-26", to: "2026-11-03" }, "01:30 Riyadh is already the 26th");
  assert.deepEqual(hearingWindow(new Date("2026-10-25T10:00:00Z")), { from: "2026-10-25", to: "2026-11-02" });
});

test("a hearing far enough ahead gets all four stages, keyed per recipient", () => {
  const rows = planHearingReminders([target(), target({ recipient_user_id: "u-firm", via: "firm_owner" })], new Date("2026-10-25T10:00:00Z"));
  const owner = rows.filter((r) => r.recipient_user_id === "u-owner");
  assert.deepEqual(owner.map((r) => [r.kind, r.scheduled_for, r.writable]), [
    ["hearing_reminder_7d", iso("2026-11-03T09:00:00+03:00"), true],
    ["hearing_reminder_3d", iso("2026-11-07T09:00:00+03:00"), true],
    ["hearing_reminder_eve", iso("2026-11-09T20:00:00+03:00"), true],
    ["hearing_reminder_morning", iso("2026-11-10T07:00:00+03:00"), true],
  ]);
  assert.equal(rows.length, 8);
  assert.deepEqual(owner[0].payload, { via: "owner", title: "جلسة نظر الدعوى", hearingDate: "2026-11-10", hearingTime: "09:00", caseRequestId: "case-f" });
});

test("a late-created hearing: stages before it was created are never written", () => {
  // created 2026-11-08 12:00 Riyadh → 7d and 3d were already past.
  const now = new Date("2026-11-08T09:30:00Z");
  const rows = planHearingReminders([target({ created_at: "2026-11-08T09:00:00Z" })], now);
  assert.deepEqual(rows.filter((r) => r.writable).map((r) => r.kind), ["hearing_reminder_eve", "hearing_reminder_morning"]);
  assert.deepEqual(rows.filter((r) => !r.writable).map((r) => r.kind), ["hearing_reminder_7d", "hearing_reminder_3d"]);
});

test("a stage that fell due since the last cron run is still written (grace), but not one long past", () => {
  // Hearing created 19:30 Riyadh the evening before; the cron first runs at 20:40.
  const rows = planHearingReminders(
    [target({ created_at: "2026-11-09T16:30:00Z" })],
    new Date("2026-11-09T17:40:00Z"),
  );
  assert.equal(rows.find((r) => r.kind === "hearing_reminder_eve")?.writable, true, "20:00 is 40 minutes ago, within the grace");
  const later = planHearingReminders([target({ created_at: "2026-11-09T16:30:00Z" })], new Date(Date.parse("2026-11-09T17:00:00Z") + (HEARING_QUEUE_GRACE_MINUTES + 1) * 60000));
  assert.equal(later.find((r) => r.kind === "hearing_reminder_eve")?.writable, false);
});

test("an early hearing (06:30) is reminded at 05:30, not after it starts; a hearing with no hour anchors at 09:00", () => {
  const early = planHearingReminders([target({ hearing_time: "06:30:00" })], new Date("2026-10-25T10:00:00Z"));
  assert.equal(early.find((r) => r.kind === "hearing_reminder_morning")?.scheduled_for, iso("2026-11-10T05:30:00+03:00"));
  const allDay = planHearingReminders([target({ hearing_time: null })], new Date("2026-10-25T10:00:00Z"));
  assert.equal(allDay.find((r) => r.kind === "hearing_reminder_7d")?.scheduled_for, iso("2026-11-03T09:00:00+03:00"));
  assert.equal(allDay[0].payload.hearingTime, null);
});

test("a malformed hearing plans nothing", () => {
  assert.deepEqual(planHearingReminders([target({ hearing_date: "2026-02-30" })], new Date("2026-10-25T10:00:00Z")), []);
});

const existing = (over: Partial<ExistingHearingOutboxRow>): ExistingHearingOutboxRow => ({
  id: "x", hearing_id: H, recipient_user_id: "u-owner", kind: "hearing_reminder_7d", status: "pending", scheduled_for: "2026-11-03T06:00:00+00:00", ...over,
});

test("reconcile: idempotent — the same plan twice writes nothing the second time", () => {
  const now = new Date("2026-10-25T10:00:00Z");
  const plan = planHearingReminders([target()], now);
  const first = reconcileHearingOutbox(plan, []);
  assert.equal(first.upserts.length, 4);
  const stored = first.upserts.map((r, i) => existing({ id: `r${i}`, kind: r.kind, scheduled_for: r.scheduled_for }));
  assert.deepEqual(reconcileHearingOutbox(plan, stored), { upserts: [], cancelIds: [] });
});

test("reconcile: sent stays sent; a re-dated stage is revived; a recipient who left is cancelled", () => {
  const now = new Date("2026-10-25T10:00:00Z");
  const plan = planHearingReminders([target()], now);
  const out = reconcileHearingOutbox(plan, [
    existing({ id: "sent-same", kind: "hearing_reminder_7d", status: "sent", scheduled_for: "2026-11-03T06:00:00Z" }),
    existing({ id: "sent-old", kind: "hearing_reminder_3d", status: "sent", scheduled_for: "2026-11-01T06:00:00Z" }),
    existing({ id: "gone", recipient_user_id: "u-left", kind: "hearing_reminder_eve", status: "pending" }),
    existing({ id: "gone-sent", recipient_user_id: "u-left", kind: "hearing_reminder_7d", status: "sent" }),
  ]);
  assert.deepEqual(out.upserts.map((r) => r.kind), ["hearing_reminder_3d", "hearing_reminder_eve", "hearing_reminder_morning"]);
  assert.deepEqual(out.cancelIds, ["gone"], "only PENDING rows are cancelled; history is kept");
  for (const r of out.upserts) assert.equal(r.status, "pending");
});

test("reconcile: a pending row whose right schedule is already past is cancelled, not rewritten", () => {
  // Hearing moved from 12 Nov to 10 Nov at 08:00 on 9 Nov: the 3d row (pending
  // for 9 Nov) is now wrong and its right time (7 Nov) is long past.
  const now = new Date("2026-11-09T05:00:00Z");
  const plan = planHearingReminders([target()], now);
  const out = reconcileHearingOutbox(plan, [existing({ id: "p3", kind: "hearing_reminder_3d", scheduled_for: "2026-11-09T06:00:00Z" })]);
  assert.deepEqual(out.cancelIds, ["p3"]);
  assert.equal(out.upserts.some((r) => r.kind === "hearing_reminder_3d"), false);
});

test("reconcile: a pending row queued in time survives a late cron (it is the delivery step's to judge)", () => {
  const now = new Date("2026-11-09T21:00:00Z"); // midnight Riyadh: eve (20:00) is 4 hours ago
  const plan = planHearingReminders([target()], now);
  const out = reconcileHearingOutbox(plan, [existing({ id: "eve", kind: "hearing_reminder_eve", scheduled_for: "2026-11-09T17:00:00Z" })]);
  assert.deepEqual(out.cancelIds, []);
});

const hearing = { id: H, title: "جلسة نظر الدعوى", hearing_date: "2026-11-10", hearing_time: "09:00:00", status: "scheduled", case_request_id: "case-f", court_name: "المحكمة التجارية بالرياض", location: "" };

test("delivery: a due, still-valid row is sent with stage copy", () => {
  const res = checkHearingDelivery(
    { kind: "hearing_reminder_eve", channel: "in_app", scheduled_for: "2026-11-09T17:00:00Z", payload: { via: "owner" } },
    hearing,
    new Date("2026-11-09T17:05:00Z"),
  );
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.title, "تذكير بجلسة: جلسة نظر الدعوى");
    assert.match(res.body, /^موعد الجلسة غداً — /);
    assert.match(res.body, /المحكمة التجارية بالرياض/);
    assert.equal(res.href, "/dashboard/lawyer/cases/case-f");
  }
});

test("delivery refuses: cancelled hearing, moved hearing, hearing already started, unknown kind, other channel", () => {
  const row = { kind: "hearing_reminder_eve", channel: "in_app" as const, scheduled_for: "2026-11-09T17:00:00Z", payload: { via: "owner" } };
  const at = new Date("2026-11-09T17:05:00Z");
  assert.deepEqual(checkHearingDelivery(row, { ...hearing, status: "cancelled" }, at), { ok: false, status: "cancelled", reason: "hearing is no longer scheduled" });
  assert.equal(checkHearingDelivery(row, null, at).ok, false);
  const moved = checkHearingDelivery(row, { ...hearing, hearing_date: "2026-11-12" }, at);
  assert.deepEqual(moved, { ok: false, status: "cancelled", reason: "schedule changed" });
  assert.deepEqual(checkHearingDelivery(row, hearing, new Date("2026-11-10T06:00:00Z")), { ok: false, status: "cancelled", reason: "hearing already started" });
  assert.equal(checkHearingDelivery({ ...row, kind: "hearing_reminder_1h" }, hearing, at).ok, false);
  assert.deepEqual(checkHearingDelivery({ ...row, channel: "whatsapp" }, hearing, at), { ok: false, status: "failed", reason: "channel not configured" });
});

test("delivery of a hearing with no hour stays valid until the end of its day", () => {
  const allDay = { ...hearing, hearing_time: null };
  const row = { kind: "hearing_reminder_morning", channel: "in_app" as const, scheduled_for: "2026-11-10T04:00:00Z", payload: { via: "owner" } };
  assert.equal(checkHearingDelivery(row, allDay, new Date("2026-11-10T12:00:00Z")).ok, true);
  assert.equal(checkHearingDelivery(row, allDay, new Date("2026-11-10T21:00:00Z")).ok, false);
});

test("links: the firm owner goes to the firm's pages, everyone else to the lawyer's", () => {
  assert.equal(hearingReminderHref("owner", "case-f"), "/dashboard/lawyer/cases/case-f");
  assert.equal(hearingReminderHref("consultant", "case-f"), "/dashboard/lawyer/cases/case-f");
  assert.equal(hearingReminderHref("owner", null), "/dashboard/lawyer/hearings");
  assert.equal(hearingReminderHref("firm_owner", "case-f"), "/dashboard/firm/cases/case-f");
  assert.equal(hearingReminderHref("firm_owner", null), "/dashboard/firm/hearings");
  assert.equal(hearingReminderHref("lead", "a b/c"), "/dashboard/lawyer/cases/a%20b%2Fc");
});

test("copy: Arabic digits, the 12-hour clock, and no court line when none is recorded", () => {
  const c = buildHearingReminderCopy("morning", { title: "جلسة", hearing_date: "2026-11-10", hearing_time: "13:30:00", court_name: "", location: "" });
  assert.equal(c.body, "موعد الجلسة اليوم — ٢٠٢٦-١١-١٠ الساعة ٠١:٣٠ م.");
});

/** A fake service client for the I/O wrapper: rpc pages, outbox read, upsert, cancel. */
function fakeAdmin(targets: HearingTarget[], stored: ExistingHearingOutboxRow[] = []) {
  const calls: { op: string; arg?: unknown; opts?: unknown }[] = [];
  const client = {
    rpc(fn: string, args: unknown) {
      calls.push({ op: `rpc:${fn}`, arg: args });
      return { range(from: number, to: number) { return Promise.resolve({ data: targets.slice(from, to + 1), error: null }); } };
    },
    from(table: string) {
      return {
        select() {
          return { in(_c: string, ids: string[]) { calls.push({ op: `read:${table}`, arg: ids.length }); return { eq() { return Promise.resolve({ data: stored.filter((s) => ids.includes(s.hearing_id)), error: null }); } }; } };
        },
        upsert(rows: unknown[], opts: unknown) { calls.push({ op: `upsert:${table}`, arg: rows.length, opts }); return Promise.resolve({ error: null }); },
        update(patch: unknown) {
          return { in(_c: string, ids: string[]) { return { eq() { calls.push({ op: `cancel:${table}`, arg: ids, opts: patch }); return Promise.resolve({ error: null }); } }; } };
        },
      };
    },
  };
  return { client: client as unknown as Parameters<typeof queueHearingReminders>[0], calls };
}

test("queueHearingReminders: one rpc page, one read, one upsert on the hearing key, cancels the stale", async () => {
  const { client, calls } = fakeAdmin(
    [target(), target({ recipient_user_id: "u-firm", via: "firm_owner" })],
    [existing({ id: "gone", recipient_user_id: "u-left", kind: "hearing_reminder_eve" })],
  );
  const res = await queueHearingReminders(client, new Date("2026-10-25T10:00:00Z"));
  assert.deepEqual(res, { queued: 8, cancelled: 1, error: null });
  const upsert = calls.find((c) => c.op === "upsert:notification_outbox");
  assert.deepEqual(upsert?.opts, { onConflict: HEARING_OUTBOX_CONFLICT_KEY });
  assert.equal(HEARING_OUTBOX_CONFLICT_KEY, "hearing_id,recipient_user_id,channel,kind");
  assert.deepEqual(calls.find((c) => c.op === "cancel:notification_outbox")?.arg, ["gone"]);
  assert.deepEqual(calls[0], { op: "rpc:hearing_reminder_targets", arg: { p_from: "2026-10-25", p_to: "2026-11-02" } });
});

test("queueHearingReminders: an rpc error (migration not applied yet) is reported, never thrown", async () => {
  const client = { rpc() { return { range() { return Promise.resolve({ data: null, error: { message: "function does not exist", code: "PGRST202" } }); } }; } };
  const res = await queueHearingReminders(client as unknown as Parameters<typeof queueHearingReminders>[0], new Date());
  assert.deepEqual(res, { queued: 0, cancelled: 0, error: "function does not exist" });
});

test("deliverHearingReminders: sends a valid row, cancels a stale one, and never touches deadline rows", async () => {
  const updates: { id: string; patch: Record<string, unknown> }[] = [];
  const inserted: Record<string, unknown>[] = [];
  const filters: string[] = [];
  const due = [
    { id: "ok", recipient_user_id: "u1", channel: "in_app", kind: "hearing_reminder_eve", scheduled_for: "2026-11-09T17:00:00Z", attempts: 0, payload: { via: "firm_owner" }, hearings: hearing },
    { id: "stale", recipient_user_id: "u1", channel: "in_app", kind: "hearing_reminder_eve", scheduled_for: "2026-11-09T17:00:00Z", attempts: 0, payload: { via: "owner" }, hearings: { ...hearing, status: "adjourned" } },
  ];
  const query = {
    eq(c: string) { filters.push(`eq:${c}`); return query; },
    not(c: string, op: string) { filters.push(`not:${c}:${op}`); return query; },
    lte() { return query; },
    order() { return query; },
    limit() { return Promise.resolve({ data: due, error: null }); },
  };
  const client = {
    from(table: string) {
      return {
        select() { return query; },
        insert(row: Record<string, unknown>) { inserted.push({ table, ...row }); return Promise.resolve({ error: null }); },
        update(patch: Record<string, unknown>) { return { eq(_c: string, id: string) { updates.push({ id, patch }); return Promise.resolve({ error: null }); } }; },
      };
    },
  };
  const { deliverHearingReminders } = await import("./hearingReminders.ts");
  const res = await deliverHearingReminders(client as unknown as Parameters<typeof deliverHearingReminders>[0], new Date("2026-11-09T17:05:00Z"));
  assert.deepEqual(res, { sent: 1, cancelled: 1, failed: 0, error: null });
  assert.ok(filters.includes("not:hearing_id:is"), "only hearing rows are read here");
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].table, "notifications");
  assert.equal(inserted[0].href, "/dashboard/firm/cases/case-f");
  assert.equal(updates.find((u) => u.id === "ok")?.patch.status, "sent");
  assert.deepEqual(updates.find((u) => u.id === "stale")?.patch, { status: "cancelled", last_error: "hearing is no longer scheduled", attempts: 1 });
});
