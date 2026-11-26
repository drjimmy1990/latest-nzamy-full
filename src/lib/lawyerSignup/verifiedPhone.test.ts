/**
 * R6 (batch l11-sec): one verified account per mobile — the app-side check
 * and the reader of the database refusal (20261201_10).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isVerifiedPhoneDbError,
  verifiedPhoneTakenFor,
  VERIFIED_PHONE_APPROVAL_REFUSAL_AR,
  VERIFIED_PHONE_PROFILE_REFUSAL_AR,
} from "./verifiedPhone.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

/** A tiny PostgREST stand-in: eq / neq / in filters, limit, maybeSingle. */
function fakeAdmin(tables: Tables, failOn: string | null = null): SupabaseClient {
  return {
    from(table: string) {
      const filters: Array<(r: Row) => boolean> = [];
      let max = Infinity;
      const run = () => {
        if (failOn === table) return { data: null, error: { code: "XX000", message: "boom" } };
        return { data: (tables[table] ?? []).filter((r) => filters.every((f) => f(r))).slice(0, max), error: null };
      };
      const q = {
        select() { return q; },
        eq(c: string, v: unknown) { filters.push((r) => r[c] === v); return q; },
        neq(c: string, v: unknown) { filters.push((r) => r[c] !== v); return q; },
        in(c: string, vs: unknown[]) { filters.push((r) => vs.includes(r[c])); return q; },
        limit(n: number) { max = n; return q; },
        maybeSingle() { const r = run(); return Promise.resolve({ data: r.error ? null : (r.data?.[0] ?? null), error: r.error }); },
        then(ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) { return Promise.resolve(run()).then(ok, bad); },
      };
      return q;
    },
  } as unknown as SupabaseClient;
}

const base: Tables = {
  profiles: [
    { id: "me", phone: "+966500000001" },
    { id: "holder", phone: "+966500000001" },
    { id: "pending", phone: "+966500000002" },
    { id: "me2", phone: "+966500000002" },
    { id: "nophone", phone: null },
  ],
  lawyer_profiles: [
    { user_id: "holder", verification_status: "verified" },
    { user_id: "pending", verification_status: "pending" },
  ],
  provider_profiles: [],
};

test("R6: another VERIFIED account on the same mobile → taken", async () => {
  assert.equal(await verifiedPhoneTakenFor(fakeAdmin(base), "me"), true);
});

test("R6: the other account on the number is only pending → free", async () => {
  assert.equal(await verifiedPhoneTakenFor(fakeAdmin(base), "me2"), false);
});

test("R6: a verified PROVIDER on the number counts too", async () => {
  const t: Tables = { ...base, provider_profiles: [{ user_id: "pending", verification_status: "verified" }] };
  assert.equal(await verifiedPhoneTakenFor(fakeAdmin(t), "me2"), true);
});

test("R6: no mobile on file → nothing to compare", async () => {
  assert.equal(await verifiedPhoneTakenFor(fakeAdmin(base), "nophone"), false);
});

test("R6: a failed read → null (the caller lets the database decide)", async () => {
  assert.equal(await verifiedPhoneTakenFor(fakeAdmin(base, "profiles"), "me"), null);
  assert.equal(await verifiedPhoneTakenFor(fakeAdmin(base, "lawyer_profiles"), "me"), null);
});

test("R6: the database refusal is recognised only by its own message", () => {
  assert.equal(isVerifiedPhoneDbError({ code: "23505", message: "verified_phone_taken: another verified account…" }), true);
  assert.equal(isVerifiedPhoneDbError({ code: "23505", message: "duplicate key value violates unique constraint \"lawyer_profiles_verified_licence_uniq\"" }), false);
  assert.equal(isVerifiedPhoneDbError({ code: "23514", message: "verified_phone_taken" }), false);
  assert.equal(isVerifiedPhoneDbError(null), false);
  assert.match(VERIFIED_PHONE_APPROVAL_REFUSAL_AR, /الجوال/);
  // Owner ٢٣٥ (batch l18): the user's refusal is the one neutral sentence.
  assert.equal(VERIFIED_PHONE_PROFILE_REFUSAL_AR, "تعذّر استعمال هذا الرقم، استعمل رقمًا آخر أو تواصل معنا");
});

test("R6: the approval checks before writing and maps the refusal on both profile tables; PATCH /profile maps it", () => {
  const route = readFileSync(join(ROOT, "src/app/api/v1/admin/verifications/[id]/route.ts"), "utf8");
  const check = route.indexOf("verifiedPhoneTakenFor(adminClient, userId)");
  const write = route.indexOf('.from("lawyer_profiles")\n    .update(') >= 0
    ? route.indexOf('.from("lawyer_profiles")\n    .update(')
    : route.search(/\.from\("lawyer_profiles"\)\s*\.update\(/);
  assert.ok(check > 0 && write > check, "the pre-check runs before the lawyer_profiles write");
  assert.ok(route.indexOf("isVerifiedPhoneDbError(lawyerErr)") < route.indexOf('lawyerErr?.code === "23505"'),
    "the phone refusal is read before the licence 23505");
  assert.match(route, /isVerifiedPhoneDbError\(providerErr\)/);
  const profile = readFileSync(join(ROOT, "src/app/api/v1/profile/route.ts"), "utf8");
  assert.match(profile, /isVerifiedPhoneDbError\(error\)/);
  const sql = readFileSync(join(ROOT, "supabase/migrations/20261201_10_l11_sec_fees_scope_device_phone.sql"), "utf8");
  assert.match(sql, /'verified_phone_taken: /);
  assert.match(sql, /constraint = 'verified_phone_unique'/);
});
