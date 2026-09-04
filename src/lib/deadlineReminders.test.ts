import test from "node:test";
import assert from "node:assert/strict";
import { enqueueDeadlineReminders, reminderScheduledForIso } from "./deadlineReminders.ts";

type ExistingRow = { kind: string; status: string; scheduled_for: string };

/**
 * A fake `SupabaseClient` that implements the two chains
 * `enqueueDeadlineReminders` calls: the RLS read of what is already queued
 * (`.from("notification_outbox").select(...).eq(...).eq(...)`) and the
 * `.upsert(rows, opts)`. Records exactly what was sent so the test can assert
 * on it without a DB.
 */
function fakeSupabase(
  result: { error: { code?: string; message?: string } | null } = { error: null },
  existing: ExistingRow[] = [],
) {
  const calls: { table: string; rows: Record<string, unknown>[]; opts: unknown }[] = [];
  const client = {
    from(table: string) {
      return {
        select() {
          return { eq() { return { eq() { return Promise.resolve({ data: existing, error: null }); } }; } };
        },
        upsert(rows: Record<string, unknown>[], opts: unknown) {
          calls.push({ table, rows, opts });
          return Promise.resolve(result);
        },
      };
    },
  };
  return { client: client as unknown as Parameters<typeof enqueueDeadlineReminders>[0]["supabase"], calls };
}

test("a kind already SENT for the same schedule is never queued again; a sent kind whose date moved, or a cancelled kind, is revived", async () => {
  const today = new Date("2026-09-04T00:00:00+03:00");
  const { client, calls } = fakeSupabase({ error: null }, [
    { kind: "deadline_reminder_7d", status: "sent", scheduled_for: "2026-09-27T03:00:00+00:00" }, // = 06:00 Riyadh, same schedule
    { kind: "deadline_reminder_3d", status: "sent", scheduled_for: "2026-09-20T03:00:00+00:00" }, // an older schedule — moved
    { kind: "deadline_reminder_1d", status: "cancelled", scheduled_for: "2026-10-03T03:00:00+00:00" },
  ]);
  const result = await enqueueDeadlineReminders({
    supabase: client, deadlineId: "d1", recipientUserId: "u1", title: "موعد", dueDate: "2026-10-04", offsets: [7, 3, 1], today,
  });
  const kinds = calls[0].rows.map((r) => r.kind).sort();
  assert.deepEqual(kinds, ["deadline_due", "deadline_reminder_1d", "deadline_reminder_3d"], "7d was already sent for this exact schedule");
  assert.equal(result.queued, 3);
});

test("enqueueDeadlineReminders upserts on the outbox's own unique key, not a plain insert", async () => {
  const { client, calls } = fakeSupabase();
  const today = new Date("2026-09-04T00:00:00+03:00");

  const result = await enqueueDeadlineReminders({
    supabase: client,
    deadlineId: "d1",
    recipientUserId: "u1",
    title: "موعد جلسة",
    dueDate: "2026-10-04", // 30 days out — all of {7,3,1} plus the due row are still ahead
    offsets: [7, 3, 1],
    today,
  });

  assert.equal(result.error, null);
  assert.equal(calls.length, 1, "exactly one upsert call, not a per-row insert loop");
  assert.equal(calls[0].opts && (calls[0].opts as { onConflict: string }).onConflict, "deadline_id,recipient_user_id,channel,kind");

  const kinds = calls[0].rows.map((r) => r.kind).sort();
  assert.deepEqual(kinds, ["deadline_due", "deadline_reminder_1d", "deadline_reminder_3d", "deadline_reminder_7d"]);
});

test("status: pending (plus a reset attempts/last_error/sent_at) rides on every row — the field that actually revives a cancelled or sent kind", async () => {
  const { client, calls } = fakeSupabase();
  const today = new Date("2026-09-04T00:00:00+03:00");

  await enqueueDeadlineReminders({
    supabase: client,
    deadlineId: "d1",
    recipientUserId: "u1",
    title: "موعد جلسة",
    dueDate: "2026-10-04",
    offsets: [7, 3, 1],
    today,
  });

  const rows = calls[0].rows;
  assert.ok(rows.length > 0);
  for (const row of rows) {
    assert.equal(row.status, "pending", `row ${row.kind} must explicitly set status:"pending" or ON CONFLICT DO UPDATE leaves a revived row's old status untouched`);
    assert.equal(row.attempts, 0);
    assert.equal(row.last_error, null);
    assert.equal(row.sent_at, null);
  }

  // Every row shares the identical key set — PostgREST builds one upsert
  // statement from the batch, and a shape mismatch across rows (e.g. the
  // due-day row missing a field the offset rows carry) is the kind of thing
  // that breaks the whole statement, not just one row.
  const keySets = rows.map((r) => JSON.stringify(Object.keys(r).sort()));
  assert.equal(new Set(keySets).size, 1, "every row (offset-based and due-day) must carry the same key set");
});

test("a due date that only leaves the closest offset still ahead queues just that one plus the due row — the gap this pins is what happens later, on redate", async () => {
  const { client, calls } = fakeSupabase();
  const today = new Date("2026-09-04T00:00:00+03:00");

  // Mirrors the redate repro: created 2 days out with the default offsets,
  // so only 1d and the due row are "pending" at creation — 7d/3d never get
  // a row at all yet. That is exactly the state `enqueueDeadlineReminders`
  // must later be able to upsert *into* (insert the missing 7d/3d, revive
  // the existing 1d/due) without a partial-conflict wipeout; this test only
  // pins the first half (the initial, partial set) since the revival half
  // needs a real unique constraint to observe.
  await enqueueDeadlineReminders({
    supabase: client,
    deadlineId: "d1",
    recipientUserId: "u1",
    title: "موعد جلسة",
    dueDate: "2026-09-06", // 2 days out
    offsets: [7, 3, 1],
    today,
  });

  const kinds = calls[0].rows.map((r) => r.kind).sort();
  assert.deepEqual(kinds, ["deadline_due", "deadline_reminder_1d"]);
});

test("offset 0 folds into deadline_due only — no separate deadline_reminder_0d kind", async () => {
  const { client, calls } = fakeSupabase();
  const today = new Date("2026-09-04T00:00:00+03:00");

  await enqueueDeadlineReminders({
    supabase: client,
    deadlineId: "d1",
    recipientUserId: "u1",
    title: "موعد جلسة",
    dueDate: "2026-09-04",
    offsets: [0],
    today,
  });

  const kinds = calls[0].rows.map((r) => r.kind);
  assert.deepEqual(kinds, ["deadline_due"]);
});

test("a fully-past due date queues nothing and never calls upsert at all", async () => {
  const { client, calls } = fakeSupabase();
  const today = new Date("2026-09-04T00:00:00+03:00");

  const result = await enqueueDeadlineReminders({
    supabase: client,
    deadlineId: "d1",
    recipientUserId: "u1",
    title: "موعد جلسة",
    dueDate: "2026-08-01",
    offsets: [7, 3, 1],
    today,
  });

  assert.equal(result.queued, 0);
  assert.equal(calls.length, 0);
});

test("an upsert error is reported, not swallowed", async () => {
  const { client } = fakeSupabase({ error: { code: "42501", message: "denied" } });
  const today = new Date("2026-09-04T00:00:00+03:00");

  const result = await enqueueDeadlineReminders({
    supabase: client,
    deadlineId: "d1",
    recipientUserId: "u1",
    title: "موعد جلسة",
    dueDate: "2026-10-04",
    offsets: [7],
    today,
  });

  assert.equal(result.queued, 0);
  assert.equal(result.error, "denied");
});

test("reminderScheduledForIso: N days before due at 06:00 Riyadh; null on a bad date or negative offset", () => {
  assert.equal(reminderScheduledForIso("2026-09-24", 3), "2026-09-21T06:00:00+03:00");
  assert.equal(reminderScheduledForIso("2026-09-24", 0), "2026-09-24T06:00:00+03:00");
  assert.equal(reminderScheduledForIso("not-a-date", 3), null);
  assert.equal(reminderScheduledForIso("2026-09-24", -1), null);
});
