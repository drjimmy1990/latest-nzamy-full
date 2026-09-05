import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveFirmVisibilityFirmId } from "./_resolveFirmVisibility.ts";

/**
 * Stubs the two-query shape `resolveFirmVisibilityFirmId` issues:
 *   supabase.from("service_requests").select(...).eq("id", caseId).maybeSingle()
 *   supabase.from("firm_members").select(...).eq("user_id", ...).eq("status", "active")[.eq("firm_id", ...)].limit(1).maybeSingle()
 *
 * `firmMembersRow` may be a function of the recorded `eq(...)` calls so a
 * test can assert the resolver filtered by the case's firm (or deliberately
 * did NOT), rather than just canning a fixed response regardless of the
 * query actually built.
 */
interface Call {
  table: string;
  eqCalls: Array<[string, unknown]>;
}

function makeStub(opts: {
  serviceRequests: { data: unknown; error: unknown };
  firmMembers: (eqCalls: Array<[string, unknown]>) => { data: unknown; error: unknown };
}) {
  const calls: Call[] = [];

  function chainFor(table: string, resolve: (eqCalls: Array<[string, unknown]>) => { data: unknown; error: unknown }) {
    const eqCalls: Array<[string, unknown]> = [];
    const chain = {
      select() {
        return chain;
      },
      eq(col: string, val: unknown) {
        eqCalls.push([col, val]);
        return chain;
      },
      limit() {
        return chain;
      },
      async maybeSingle() {
        calls.push({ table, eqCalls: [...eqCalls] });
        return resolve(eqCalls);
      },
    };
    return chain;
  }

  const supabase = {
    from(table: string) {
      if (table === "service_requests") {
        return chainFor(table, () => opts.serviceRequests);
      }
      if (table === "firm_members") {
        return chainFor(table, (eqCalls) => opts.firmMembers(eqCalls));
      }
      throw new Error(`unexpected table in stub: ${table}`);
    },
  };

  return { supabase: supabase as unknown as SupabaseClient, calls };
}

test("resolveFirmVisibilityFirmId: case belongs to firm A, caller active only in firm B -> refused", async () => {
  const { supabase, calls } = makeStub({
    serviceRequests: { data: { firm_id: "firm-A" }, error: null },
    // caller is only active in firm B, so a query filtered to firm-A finds nothing.
    firmMembers: (eqCalls) => {
      const wantsA = eqCalls.some(([col, val]) => col === "firm_id" && val === "firm-A");
      return wantsA ? { data: null, error: null } : { data: { firm_id: "firm-B" }, error: null };
    },
  });

  const result = await resolveFirmVisibilityFirmId(supabase, "user-1", "case-1");
  assert.ok("error" in result, "expected a refusal, not a firm_id");
  const firmMembersCall = calls.find((c) => c.table === "firm_members");
  assert.ok(firmMembersCall, "firm_members should have been queried");
  assert.ok(
    firmMembersCall!.eqCalls.some(([col, val]) => col === "firm_id" && val === "firm-A"),
    "the membership lookup must be filtered to the case's own firm (A), not left unfiltered",
  );
});

test("resolveFirmVisibilityFirmId: case belongs to firm A, caller active in both A and B -> resolves to A", async () => {
  const { supabase } = makeStub({
    serviceRequests: { data: { firm_id: "firm-A" }, error: null },
    firmMembers: (eqCalls) => {
      const wantsA = eqCalls.some(([col, val]) => col === "firm_id" && val === "firm-A");
      // The caller has an active row in both firms; a query filtered to A finds it.
      return wantsA ? { data: { firm_id: "firm-A" }, error: null } : { data: { firm_id: "firm-B" }, error: null };
    },
  });

  const result = await resolveFirmVisibilityFirmId(supabase, "user-1", "case-1");
  assert.deepEqual(result, { firmId: "firm-A" });
});

test("resolveFirmVisibilityFirmId: case unreadable (RLS hid it / not found) -> refused, never falls back to an unfiltered pick", async () => {
  const { supabase, calls } = makeStub({
    serviceRequests: { data: null, error: null },
    firmMembers: () => {
      throw new Error("firm_members must not be queried when the case itself could not be confirmed");
    },
  });

  const result = await resolveFirmVisibilityFirmId(supabase, "user-1", "case-1");
  assert.ok("error" in result, "expected a refusal");
  assert.equal(calls.some((c) => c.table === "firm_members"), false, "firm_members was queried despite an unreadable case");
});

test("resolveFirmVisibilityFirmId: case unreadable due to a query error -> refused the same way (fail closed, not open)", async () => {
  const { supabase, calls } = makeStub({
    serviceRequests: { data: null, error: { message: "boom", code: "500" } },
    firmMembers: () => {
      throw new Error("firm_members must not be queried when the case lookup errored");
    },
  });

  const result = await resolveFirmVisibilityFirmId(supabase, "user-1", "case-1");
  assert.ok("error" in result, "expected a refusal");
  assert.equal(calls.some((c) => c.table === "firm_members"), false);
});

test("resolveFirmVisibilityFirmId: solo case (service_requests.firm_id is null) -> falls back to the caller's own first active membership", async () => {
  const { supabase, calls } = makeStub({
    serviceRequests: { data: { firm_id: null }, error: null },
    firmMembers: () => ({ data: { firm_id: "firm-B" }, error: null }),
  });

  const result = await resolveFirmVisibilityFirmId(supabase, "user-1", "case-1");
  assert.deepEqual(result, { firmId: "firm-B" });
  const firmMembersCall = calls.find((c) => c.table === "firm_members");
  assert.ok(firmMembersCall, "firm_members should have been queried");
  assert.equal(
    firmMembersCall!.eqCalls.some(([col]) => col === "firm_id"),
    false,
    "a solo case must not filter the membership lookup by firm_id",
  );
});

test("resolveFirmVisibilityFirmId: solo case, caller has no active membership anywhere -> refused", async () => {
  const { supabase } = makeStub({
    serviceRequests: { data: { firm_id: null }, error: null },
    firmMembers: () => ({ data: null, error: null }),
  });

  const result = await resolveFirmVisibilityFirmId(supabase, "user-1", "case-1");
  assert.ok("error" in result);
});
