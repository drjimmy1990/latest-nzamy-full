/**
 * fakeDb.test-helper.ts — a hand-built stand-in for the Supabase service
 * client, for the fulfilment behaviour tests (the pattern of
 * src/lib/deadlineReminders.test.ts). It records every query — table,
 * operation, payload, filters — and answers each one from a handler.
 * Not a test file itself (no `.test.ts` suffix): the suite does not run it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type FakeError = { code?: string; message?: string } | null;

export interface FakeQuery {
  table: string;
  op: "select" | "insert" | "update" | "rpc";
  payload?: unknown;
  filters: Array<[string, string, unknown]>;
  columns?: string;
  returning?: string;
}

export type FakeHandler = (q: FakeQuery) => { data?: unknown; error?: FakeError } | undefined;

export function fakeDb(handler: FakeHandler) {
  const log: FakeQuery[] = [];
  const settle = (q: FakeQuery) => {
    log.push(q);
    const r = handler(q) ?? {};
    return Promise.resolve({ data: r.data ?? null, error: r.error ?? null });
  };

  function from(table: string) {
    const q: FakeQuery = { table, op: "select", filters: [] };
    const chain = {
      select(columns?: string) {
        if (q.op === "select") q.columns = columns;
        else q.returning = columns;
        return chain;
      },
      insert(payload: unknown) {
        q.op = "insert";
        q.payload = payload;
        return chain;
      },
      update(payload: unknown) {
        q.op = "update";
        q.payload = payload;
        return chain;
      },
      eq(c: string, v: unknown) { q.filters.push(["eq", c, v]); return chain; },
      is(c: string, v: unknown) { q.filters.push(["is", c, v]); return chain; },
      in(c: string, v: unknown) { q.filters.push(["in", c, v]); return chain; },
      lt(c: string, v: unknown) { q.filters.push(["lt", c, v]); return chain; },
      gt(c: string, v: unknown) { q.filters.push(["gt", c, v]); return chain; },
      not(c: string, op: string, v: unknown) { q.filters.push(["not", `${c}.${op}`, v]); return chain; },
      order() { return chain; },
      limit() { return chain; },
      single() { return chain; },
      maybeSingle() { return chain; },
      then<A, B>(resolve: (v: { data: unknown; error: FakeError }) => A, reject?: (e: unknown) => B) {
        return settle(q).then(resolve, reject);
      },
    };
    return chain;
  }

  const client = {
    from,
    rpc(fn: string, args: unknown) {
      return {
        then<A, B>(resolve: (v: { data: unknown; error: FakeError }) => A, reject?: (e: unknown) => B) {
          return settle({ table: fn, op: "rpc", payload: args, filters: [] }).then(resolve, reject);
        },
      };
    },
    auth: { admin: { updateUserById: async () => ({ data: null, error: null }) } },
  };

  return { client: client as unknown as SupabaseClient, log };
}

/** True when the query carries this filter. */
export function has(q: FakeQuery, kind: string, column: string, value?: unknown): boolean {
  return q.filters.some(([k, c, v]) => k === kind && c === column && (value === undefined || v === value));
}

export const RANKS = { free: 0, shield: 1, ai: 2, pro: 3, max: 4, corp: 5, enterprise: 6 } as const;
