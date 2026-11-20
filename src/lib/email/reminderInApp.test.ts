/**
 * notifyReminderOnce (the in-app half of the l11-remind reminders) and the
 * 23514 → "schema_missing" reading of claimReminder (20261201_45 not run).
 */
import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { claimReminder, notifyReminderOnce, sendReminderOnce, type ReminderKey } from "./reminderDelivery.ts";

type Row = Record<string, unknown>;
type Err = { code?: string; message: string } | null;

function fakeAdmin(tables: Record<string, Row[]>, failOn: Record<string, Err> = {}) {
  const pk = ["kind", "subject_id", "recipient_user_id", "due_on"];
  function builder(table: string) {
    let op: "select" | "upsert" | "update" | "insert" = "select";
    let payload: Row | null = null;
    let ignoreDup = false;
    const filters: Array<(r: Row) => boolean> = [];
    let single = false;
    const run = (): { data: unknown; error: Err } => {
      const err = failOn[`${table}:${op}`];
      if (err) return { data: null, error: err };
      const rows = (tables[table] ??= []);
      if (op === "insert" && payload) {
        rows.push({ ...payload });
        return { data: null, error: null };
      }
      if (op === "upsert" && payload) {
        const exists = rows.some((r) => pk.every((k) => r[k] === payload![k]));
        if (exists && ignoreDup) return { data: [], error: null };
        rows.push({ ...payload });
        return { data: [{ kind: payload.kind }], error: null };
      }
      const hit = rows.filter((r) => filters.every((f) => f(r)));
      if (op === "update" && payload) {
        for (const r of hit) Object.assign(r, payload);
        return { data: hit.map((r) => ({ kind: r.kind })), error: null };
      }
      if (single) return { data: hit[0] ?? null, error: null };
      return { data: hit.map((r) => ({ ...r })), error: null };
    };
    const b = {
      select() { return b; },
      insert(p: Row) { op = "insert"; payload = p; return b; },
      upsert(p: Row, o: { ignoreDuplicates?: boolean }) { op = "upsert"; payload = p; ignoreDup = !!o?.ignoreDuplicates; return b; },
      update(p: Row) { op = "update"; payload = p; return b; },
      eq(c: string, v: unknown) { filters.push((r) => r[c] === v); return b; },
      match(m: Row) { for (const [k, v] of Object.entries(m)) filters.push((r) => r[k] === v); return b; },
      maybeSingle() { single = true; return Promise.resolve(run()); },
      then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) { return Promise.resolve(run()).then(res, rej); },
    };
    return b;
  }
  return { from: (t: string) => builder(t) } as unknown as SupabaseClient;
}

const KEY: ReminderKey = { kind: "task_due_1d_app", subjectId: "t1", recipientUserId: "u1", dueOn: "2026-11-21" };
const NOTICE = { title: "تذكير بمهمة: x", body: "موعد هذه المهمة غداً.", href: "/dashboard/lawyer/tasks" };
const quiet = async <T>(fn: () => Promise<T>) => {
  const o = console.error;
  console.error = () => {};
  try { return await fn(); } finally { console.error = o; }
};

test("in-app: one notice per (task, due date, recipient) — a second run writes nothing", async () => {
  const tables: Record<string, Row[]> = { email_reminder_log: [], notifications: [] };
  const admin = fakeAdmin(tables);
  assert.equal(await notifyReminderOnce(admin, KEY, NOTICE), "sent");
  assert.equal(await notifyReminderOnce(admin, KEY, NOTICE), "already");
  assert.equal(tables.notifications.length, 1);
  assert.deepEqual(tables.notifications[0], { user_id: "u1", title: NOTICE.title, body: NOTICE.body, href: NOTICE.href });
  assert.equal(tables.email_reminder_log[0].status, "sent");
  // a re-dated task is a new reminder
  assert.equal(await notifyReminderOnce(admin, { ...KEY, dueOn: "2026-11-22" }, NOTICE), "sent");
  assert.equal(tables.notifications.length, 2);
});

test("in-app and e-mail keep their own rows: one does not use the other up", async () => {
  const tables: Record<string, Row[]> = { email_reminder_log: [], notifications: [] };
  const admin = fakeAdmin(tables);
  assert.equal(await notifyReminderOnce(admin, KEY, NOTICE), "sent");
  const calls: number[] = [];
  const fetchImpl = (async () => { calls.push(1); return new Response("{}", { status: 200 }); }) as typeof fetch;
  const outcome = await sendReminderOnce(
    admin,
    { ...KEY, kind: "task_due_1d" },
    { to: "lawyer@example.test", subject: "s", text: "t" },
    { env: { RESEND_API_KEY: "re_test", EMAIL_FROM: "noreply@example.test" }, fetchImpl, sinkCheck: async () => ({ sink: false }) },
  );
  assert.equal(outcome, "sent");
  assert.equal(calls.length, 1);
  assert.equal(tables.email_reminder_log.length, 2);
});

test("before 20261201_45 (the old CHECK refuses the kind, 23514): schema_missing, no notice written", async () => {
  const tables: Record<string, Row[]> = { email_reminder_log: [], notifications: [] };
  const admin = fakeAdmin(tables, { "email_reminder_log:upsert": { code: "23514", message: "violates check constraint" } });
  assert.equal(await claimReminder(admin, KEY), "schema_missing");
  assert.equal(await notifyReminderOnce(admin, KEY, NOTICE), "schema_missing");
  assert.equal(tables.notifications.length, 0);
});

test("a failed notification insert is recorded failed and retried on the next run", async () => {
  const tables: Record<string, Row[]> = { email_reminder_log: [], notifications: [] };
  const broken = fakeAdmin(tables, { "notifications:insert": { code: "XX000", message: "boom" } });
  assert.equal(await quiet(() => notifyReminderOnce(broken, KEY, NOTICE)), "failed");
  assert.equal(tables.email_reminder_log[0].status, "failed");
  assert.equal(tables.email_reminder_log[0].last_error, "notify_XX000");
  const healthy = fakeAdmin(tables);
  assert.equal(await notifyReminderOnce(healthy, KEY, NOTICE), "sent");
  assert.equal(tables.notifications.length, 1);
  assert.equal(tables.email_reminder_log[0].attempts, 2);
});
