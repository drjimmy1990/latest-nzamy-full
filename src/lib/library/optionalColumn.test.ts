/**
 * N2.2 — /api/library/init names library.laws.summary_brief, which migration
 * 20261025_20 adds. Code first must still work: a missing-column answer reads
 * the list again without it; nothing else is retried.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isMissingColumnError, readWithOptionalFeatures, selectWithOptionalColumn } from "./optionalColumn.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const INIT = readFileSync(path.join(here, "../../app/api/library/init/route.ts"), "utf8").replace(/\r\n/g, "\n");

type R = { data: string[] | null; error: { code?: string; message?: string } | null };

function fakeClient(answers: Record<string, R>) {
  const calls: string[] = [];
  const run = async (select: string): Promise<R> => {
    calls.push(select);
    return answers[select] ?? { data: null, error: { code: "XX000", message: "unexpected select" } };
  };
  return { run, calls };
}

const WITH = "slug, title, summary_brief";
const WITHOUT = "slug, title";

test("the column exists: one read, with it", async () => {
  const c = fakeClient({ [WITH]: { data: ["a"], error: null } });
  const out = await selectWithOptionalColumn(c.run, WITH, WITHOUT, "summary_brief");
  assert.deepEqual(out, { data: ["a"], error: null });
  assert.deepEqual(c.calls, [WITH]);
});

test("42703 naming the column: read again without it", async () => {
  const c = fakeClient({
    [WITH]: { data: null, error: { code: "42703", message: "column laws.summary_brief does not exist" } },
    [WITHOUT]: { data: ["a"], error: null },
  });
  const warn = console.warn;
  console.warn = () => {};
  try {
    const out = await selectWithOptionalColumn(c.run, WITH, WITHOUT, "summary_brief");
    assert.deepEqual(out.data, ["a"]);
  } finally {
    console.warn = warn;
  }
  assert.deepEqual(c.calls, [WITH, WITHOUT]);
});

test("any other error is returned, not retried (a real failure stays degraded)", async () => {
  const c = fakeClient({ [WITH]: { data: null, error: { code: "42501", message: "permission denied for table laws" } } });
  const out = await selectWithOptionalColumn(c.run, WITH, WITHOUT, "summary_brief");
  assert.equal(out.error?.code, "42501");
  assert.deepEqual(c.calls, [WITH]);
});

test("same select both ways (a viewer who gets no موجز): one read", async () => {
  const c = fakeClient({ [WITHOUT]: { data: [], error: null } });
  await selectWithOptionalColumn(c.run, WITHOUT, WITHOUT, "summary_brief");
  assert.deepEqual(c.calls, [WITHOUT]);
});

test("isMissingColumnError: the code AND the column name", () => {
  assert.equal(isMissingColumnError({ code: "PGRST204", message: "Could not find the 'summary_brief' column" }, "summary_brief"), true);
  assert.equal(isMissingColumnError({ code: "42703", message: "column laws.other does not exist" }, "summary_brief"), false);
  assert.equal(isMissingColumnError(null, "summary_brief"), false);
  assert.equal(isMissingColumnError({ code: "42703", message: "summary_brief" }, ""), false);
});

test("init reads summary_brief only for a subscriber (the ٢٦٠ flag), through the fallback", () => {
  assert.match(INIT, /lawSummaryVisible\(hasFullAccess\)/);
  assert.match(INIT, /`\$\{LAW_LIST_COLUMNS\}, \$\{LAW_SUMMARY_COLUMN\}`/);
  assert.match(INIT, /readWithOptionalFeatures<SectionRead>\(/);
  // The full preamble never rides on the list.
  assert.doesNotMatch(INIT.match(/const LAW_LIST_COLUMNS =\n\s*"([^"]*)"/)?.[1] ?? "preamble", /preamble/);
});

// ── N2.5: two pending migrations, applied in any order ─────────────────────
// The laws section names summary_brief (20261025_20) in its select and the
// catalogue sort keys (20261025_40) in its order. Either migration may be on
// the database without the other: a 42703 naming one drops only that one.

const FEATURES = [
  { key: "brief", columns: ["summary_brief"] },
  { key: "sort", columns: ["latest_amendment_key", "issue_date_key"] },
] as const;

function featureClient(dbColumns: string[]) {
  const calls: string[] = [];
  const run = async (on: ReadonlySet<string>): Promise<R> => {
    calls.push([...on].sort().join("+") || "none");
    const wanted = [...on].flatMap((k) => FEATURES.find((f) => f.key === k)!.columns);
    // Postgres reports the first missing column it meets.
    const missing = wanted.find((c) => !dbColumns.includes(c));
    return missing
      ? { data: null, error: { code: "42703", message: `column laws.${missing} does not exist` } }
      : { data: ["row"], error: null };
  };
  return { run, calls };
}

async function quietly<T>(fn: () => Promise<T>): Promise<T> {
  const warn = console.warn;
  console.warn = () => {};
  try { return await fn(); } finally { console.warn = warn; }
}

test("both migrations applied: one read with both", async () => {
  const c = featureClient(["summary_brief", "latest_amendment_key", "issue_date_key"]);
  const out = await readWithOptionalFeatures(c.run, FEATURES);
  assert.deepEqual(out.data, ["row"]);
  assert.deepEqual(c.calls, ["brief+sort"]);
});

test("only 20 applied: the sort keys are dropped, the brief stays", async () => {
  const c = featureClient(["summary_brief"]);
  const out = await quietly(() => readWithOptionalFeatures(c.run, FEATURES));
  assert.equal(out.error, null);
  assert.deepEqual(c.calls, ["brief+sort", "brief"]);
});

test("only 40 applied: the brief is dropped, the sort stays", async () => {
  const c = featureClient(["latest_amendment_key", "issue_date_key"]);
  const out = await quietly(() => readWithOptionalFeatures(c.run, FEATURES));
  assert.equal(out.error, null);
  assert.deepEqual(c.calls, ["brief+sort", "sort"]);
});

test("neither applied: both dropped one at a time, the section is not degraded", async () => {
  const c = featureClient([]);
  const out = await quietly(() => readWithOptionalFeatures(c.run, FEATURES));
  assert.equal(out.error, null);
  assert.deepEqual(out.data, ["row"]);
  assert.deepEqual(c.calls, ["brief+sort", "sort", "none"]);
});

test("a feature drops on ANY of its columns (the second sort key alone missing)", async () => {
  const c = featureClient(["summary_brief", "latest_amendment_key"]);
  const out = await quietly(() => readWithOptionalFeatures(c.run, FEATURES));
  assert.equal(out.error, null);
  assert.deepEqual(c.calls, ["brief+sort", "brief"]);
});

test("a feature not asked for is never read, and other errors are returned as they came", async () => {
  const c = featureClient(["summary_brief", "latest_amendment_key", "issue_date_key"]);
  await readWithOptionalFeatures(c.run, FEATURES, ["sort"]);
  assert.deepEqual(c.calls, ["sort"]);
  const calls: string[] = [];
  const out = await readWithOptionalFeatures(async (on) => {
    calls.push([...on].join("+"));
    return { data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } } as R;
  }, FEATURES);
  assert.equal(out.error?.code, "57014");
  assert.equal(calls.length, 1);
});
