import assert from "node:assert/strict";
import test from "node:test";

import { selectAllPages, type PageResult } from "./selectAllPages.ts";

/** A fake PostgREST window over `rows` that never returns more than `cap` rows. */
function fakeTable(rows: number[], cap: number) {
  const calls: Array<[number, number]> = [];
  const page = async (from: number, to: number): Promise<PageResult<number>> => {
    calls.push([from, to]);
    const want = Math.min(to - from + 1, cap);
    return { data: rows.slice(from, from + want), error: null };
  };
  return { page, calls };
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

test("returns every row past the 1000-row cap (the 1,838-article law)", async () => {
  const { page } = fakeTable(range(1838), 1000);
  const { data, error } = await selectAllPages(page);
  assert.equal(error, null);
  assert.equal(data.length, 1838);
  assert.deepEqual(data.slice(995, 1005), range(1005).slice(995));
});

test("stays complete when the server cap is below pageSize", async () => {
  const { page } = fakeTable(range(2323), 500);
  const { data, error } = await selectAllPages(page, { pageSize: 1000 });
  assert.equal(error, null);
  assert.equal(data.length, 2323);
});

test("an exact multiple of the page size ends on an empty window", async () => {
  const { page, calls } = fakeTable(range(2000), 1000);
  const { data } = await selectAllPages(page);
  assert.equal(data.length, 2000);
  assert.deepEqual(calls.at(-1), [2000, 2999]);
});

test("an empty table returns no rows and no error", async () => {
  const { page } = fakeTable([], 1000);
  assert.deepEqual(await selectAllPages(page), { data: [], error: null });
});

test("a failing window returns the error with the rows read so far", async () => {
  let n = 0;
  const page = async (): Promise<PageResult<number>> =>
    n++ === 0 ? { data: range(1000), error: null } : { data: null, error: { message: "57014" } };
  const { data, error } = await selectAllPages(page);
  assert.equal(data.length, 1000);
  assert.deepEqual(error, { message: "57014" });
});

test("reports an error instead of silently stopping past maxRows", async () => {
  const { page } = fakeTable(range(30), 10);
  const over = await selectAllPages(page, { pageSize: 10, maxRows: 20 });
  assert.equal(over.data.length, 20);
  assert.match(over.error?.message ?? "", /more than 20 rows/);

  const { page: exact } = fakeTable(range(20), 10);
  const fits = await selectAllPages(exact, { pageSize: 10, maxRows: 20 });
  assert.equal(fits.data.length, 20);
  assert.equal(fits.error, null);
});
