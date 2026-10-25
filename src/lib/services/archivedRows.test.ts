import test from "node:test";
import assert from "node:assert/strict";
import { isMissingColumnError, isMissingFunctionError, liveRowsOnly, ARCHIVE_UNAVAILABLE_AR } from "./archivedRows.ts";

test("isMissingColumnError: 42703 naming the column, or PostgREST's schema-cache miss", () => {
  assert.equal(isMissingColumnError({ code: "42703", message: "column case_notes.deleted_at does not exist" }, "deleted_at"), true);
  assert.equal(isMissingColumnError({ code: "PGRST204", message: "Could not find the 'deleted_at' column" }, "deleted_at"), true);
  assert.equal(isMissingColumnError({ code: "42703", message: "column x.other does not exist" }, "deleted_at"), false);
  assert.equal(isMissingColumnError({ code: "42501", message: "deleted_at" }, "deleted_at"), false);
  assert.equal(isMissingColumnError(null, "deleted_at"), false);
});

test("isMissingFunctionError: PGRST202 / 42883", () => {
  assert.equal(isMissingFunctionError({ code: "PGRST202", message: "Could not find the function public.archive_case_note" }), true);
  assert.equal(isMissingFunctionError({ code: "42883", message: "function does not exist" }), true);
  assert.equal(isMissingFunctionError({ code: "42501", message: "permission denied" }), false);
  assert.match(ARCHIVE_UNAVAILABLE_AR, /الأرشفة/);
});

test("liveRowsOnly filters archived rows, and falls back without the filter before the migration", async () => {
  const calls: boolean[] = [];
  const ok = await liveRowsOnly(async (exclude) => {
    calls.push(exclude);
    return { data: [1], error: null };
  });
  assert.deepEqual(calls, [true]);
  assert.deepEqual(ok.data, [1]);

  const calls2: boolean[] = [];
  const fallback = await liveRowsOnly(async (exclude) => {
    calls2.push(exclude);
    return exclude
      ? { data: null, error: { code: "42703", message: "column case_notes.deleted_at does not exist" } }
      : { data: [2], error: null };
  });
  assert.deepEqual(calls2, [true, false]);
  assert.deepEqual(fallback.data, [2]);

  const other = await liveRowsOnly(async () => ({ data: null, error: { code: "42501", message: "denied" } }));
  assert.equal(other.error?.code, "42501", "any other error is returned as is, not retried");
});
