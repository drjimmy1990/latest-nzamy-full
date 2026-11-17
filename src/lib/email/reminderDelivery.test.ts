import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  claimReminder,
  emailMuted,
  loadEmailRecipients,
  MAX_EMAIL_ATTEMPTS,
  riyadhDayPlus,
  sendReminderOnce,
  type ReminderKey,
} from "./reminderDelivery.ts";

// ── a tiny in-memory stand-in for the PostgREST builder ──────────────────────
type Row = Record<string, unknown>;
type Err = { code?: string; message: string } | null;

function fakeAdmin(tables: Record<string, Row[]>, opts: { failOn?: Record<string, Err> } = {}) {
  const pk = ["kind", "subject_id", "recipient_user_id", "due_on"];
  function builder(table: string) {
    let op: "select" | "upsert" | "update" = "select";
    let payload: Row | null = null;
    let ignoreDup = false;
    const filters: Array<(r: Row) => boolean> = [];
    let single = false;
    const run = (): { data: unknown; error: Err } => {
      const err = opts.failOn?.[`${table}:${op}`];
      if (err) return { data: null, error: err };
      const rows = (tables[table] ??= []);
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
      upsert(p: Row, o: { ignoreDuplicates?: boolean }) { op = "upsert"; payload = p; ignoreDup = !!o?.ignoreDuplicates; return b; },
      update(p: Row) { op = "update"; payload = p; return b; },
      eq(c: string, v: unknown) { filters.push((r) => r[c] === v); return b; },
      in(c: string, vs: unknown[]) { filters.push((r) => vs.includes(r[c])); return b; },
      match(m: Row) { for (const [k, v] of Object.entries(m)) filters.push((r) => r[k] === v); return b; },
      maybeSingle() { single = true; return Promise.resolve(run()); },
      then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) { return Promise.resolve(run()).then(res, rej); },
    };
    return b;
  }
  return { from: (t: string) => builder(t) } as unknown as SupabaseClient;
}

const ENV = { RESEND_API_KEY: "re_test", EMAIL_FROM: "noreply@example.test" };
function okFetch(status = 200) {
  const calls: RequestInit[] = [];
  const impl = (async (_u: unknown, init?: RequestInit) => {
    calls.push(init ?? {});
    return new Response("{}", { status });
  }) as typeof fetch;
  return { impl, calls };
}
const KEY: ReminderKey = { kind: "hearing_1d", subjectId: "h1", recipientUserId: "u1", dueOn: "2026-11-20" };
const MSG = { to: "lawyer@example.test", subject: "s", text: "t" };
const quiet = async <T>(fn: () => Promise<T>) => {
  const o = console.error;
  console.error = () => {};
  try { return await fn(); } finally { console.error = o; }
};

test("once: the second run finds the row and sends nothing", async () => {
  const tables: Record<string, Row[]> = { email_reminder_log: [] };
  const admin = fakeAdmin(tables);
  const f = okFetch();
  assert.equal(await sendReminderOnce(admin, KEY, MSG, { env: ENV, fetchImpl: f.impl }), "sent");
  assert.equal(await sendReminderOnce(admin, KEY, MSG, { env: ENV, fetchImpl: f.impl }), "already");
  assert.equal(f.calls.length, 1);
  assert.equal(tables.email_reminder_log.length, 1);
  assert.equal(tables.email_reminder_log[0].status, "sent");
  const headers = f.calls[0].headers as Record<string, string>;
  assert.equal(headers["Idempotency-Key"], "nezamy-hearing_1d-h1-u1-2026-11-20");
  // another recipient or another date is its own reminder
  assert.equal(await sendReminderOnce(admin, { ...KEY, recipientUserId: "u2" }, MSG, { env: ENV, fetchImpl: f.impl }), "sent");
  assert.equal(await sendReminderOnce(admin, { ...KEY, dueOn: "2026-11-27" }, MSG, { env: ENV, fetchImpl: f.impl }), "sent");
});

test("a failed send is recorded, retried, and given up after the third attempt", async () => {
  const tables: Record<string, Row[]> = { email_reminder_log: [] };
  const admin = fakeAdmin(tables);
  const bad = okFetch(500);
  for (let i = 1; i <= MAX_EMAIL_ATTEMPTS; i++) {
    assert.equal(await quiet(() => sendReminderOnce(admin, KEY, MSG, { env: ENV, fetchImpl: bad.impl })), "failed");
    assert.equal(tables.email_reminder_log[0].attempts, i);
    assert.equal(tables.email_reminder_log[0].status, "failed");
    assert.equal(tables.email_reminder_log[0].last_error, "failed");
  }
  assert.equal(await sendReminderOnce(admin, KEY, MSG, { env: ENV, fetchImpl: bad.impl }), "already");
  assert.equal(bad.calls.length, MAX_EMAIL_ATTEMPTS);
});

test("a row left 'sending' (a crashed run) is never sent again", async () => {
  const tables: Record<string, Row[]> = {
    email_reminder_log: [{ kind: "hearing_1d", subject_id: "h1", recipient_user_id: "u1", due_on: "2026-11-20", status: "sending", attempts: 1 }],
  };
  const f = okFetch();
  assert.equal(await sendReminderOnce(fakeAdmin(tables), KEY, MSG, { env: ENV, fetchImpl: f.impl }), "already");
  assert.equal(f.calls.length, 0);
});

test("missing table → schema_missing and no e-mail; another error → error", async () => {
  const f = okFetch();
  const missing = fakeAdmin({}, { failOn: { "email_reminder_log:upsert": { code: "PGRST205", message: "x" } } });
  assert.equal(await sendReminderOnce(missing, KEY, MSG, { env: ENV, fetchImpl: f.impl }), "schema_missing");
  const broken = fakeAdmin({}, { failOn: { "email_reminder_log:upsert": { code: "XX000", message: "x" } } });
  assert.equal(await quiet(() => claimReminder(broken, KEY)), "error");
  assert.equal(f.calls.length, 0);
});

test("mute: e-mail off, everything off, or the category off; no row = defaults", () => {
  assert.equal(emailMuted(null, ["hearing"]), false);
  assert.equal(emailMuted({ user_id: "u", email_notifications: false }, ["hearing"]), true);
  assert.equal(emailMuted({ user_id: "u", notifications_enabled: false }, ["hearing"]), true);
  assert.equal(emailMuted({ user_id: "u", email_notifications: true, preferences: { notifications: { categories: { hearing: false } } } }, ["hearing"]), true);
  assert.equal(emailMuted({ user_id: "u", preferences: { notifications: { categories: { hearing: true, renewal: false } } } }, ["hearing"]), false);
  assert.equal(emailMuted({ user_id: "u", preferences: "junk" }, ["hearing"]), false);
});

test("recipients: address from profiles, muted and address-less accounts left out; a settings error sends to nobody", async () => {
  const tables: Record<string, Row[]> = {
    profiles: [
      { id: "a", email: "a@example.test" },
      { id: "b", email: "b@example.test" },
      { id: "c", email: null },
      { id: "d", email: "not an address" },
    ],
    user_settings: [{ user_id: "b", email_notifications: false }],
  };
  const r = await loadEmailRecipients(fakeAdmin(tables), ["a", "b", "c", "d", "a"], ["hearing"]);
  assert.equal(r.error, null);
  assert.deepEqual([...r.addresses.entries()], [["a", "a@example.test"]]);
  assert.equal(r.muted, 1);
  assert.equal(r.noAddress, 2);

  const failing = await loadEmailRecipients(
    fakeAdmin(tables, { failOn: { "user_settings:select": { code: "XX000", message: "down" } } }),
    ["a"],
    ["hearing"],
  );
  assert.ok(failing.error);
  assert.equal(failing.addresses.size, 0);
});

test("riyadhDayPlus: Riyadh calendar days (UTC+3)", () => {
  assert.equal(riyadhDayPlus(new Date("2026-11-19T20:59:00Z"), 0), "2026-11-19");
  assert.equal(riyadhDayPlus(new Date("2026-11-19T21:00:00Z"), 0), "2026-11-20");
  assert.equal(riyadhDayPlus(new Date("2026-11-19T21:00:00Z"), 1), "2026-11-21");
  assert.equal(riyadhDayPlus(new Date("2026-12-31T22:00:00Z"), 30), "2027-01-31");
});
