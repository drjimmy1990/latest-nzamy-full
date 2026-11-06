/**
 * progressEvents.test.ts — what a waiting screen may be told (S2 E2, R7): file
 * names, searches and law titles, never a text, a token or a link. Writing it
 * never disturbs the run.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/progressEvents.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fakeDb } from "../payments/fakeDb.test-helper.ts";
import { buildSources } from "./retrieval.ts";
import {
  STEP_LABEL_AR,
  cleanLabel,
  fileEvents,
  progressSink,
  queryEvents,
  recordProgress,
  sourceEvents,
  toSourceRefs,
  verifyEvent,
  type ProgressEvent,
} from "./progressEvents.ts";

async function withConsoleSpy<T>(fn: (lines: string[]) => Promise<T>): Promise<T> {
  const lines: string[] = [];
  const saved = { error: console.error, warn: console.warn, info: console.info, log: console.log };
  const spy = (...args: unknown[]) => {
    lines.push(args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  };
  console.error = spy;
  console.warn = spy;
  console.info = spy;
  console.log = spy;
  try {
    return await fn(lines);
  } finally {
    Object.assign(console, saved);
  }
}

test("R7: a source event carries the title, never the text", () => {
  assert.deepEqual(
    sourceEvents(
      [{ kind: "article", title: "نظام العمل — المادة ٧٧", text: "SECRET" } as never].map(({ kind, title }: { kind: "article"; title: string }) => ({ kind, title })),
    ),
    [{ kind: "law", label: "نظام العمل — المادة ٧٧" }],
  );
});

test("R7: the caller-side mapping drops the text", () => {
  const refs = toSourceRefs([{ sid: "S1", kind: "article", title: "t", text: "SECRET" }]);
  assert.deepEqual(refs, [{ kind: "article", title: "t" }]);
  assert.ok(!JSON.stringify(refs).includes("SECRET"));
});

test("R7: the real source builder's law and principle texts never reach an event", () => {
  const { sources } = buildSources(
    [{ id: "a1", law_slug: "labor", number: 77, text: "SECRET-LAW-TEXT", status: "active" }],
    [{ id: "p1", principle_number: "12", issuing_body: "المحكمة العليا", year_hijri: "1440", text: "SECRET-PRINCIPLE-TEXT" }],
    new Map([["labor", "نظام العمل"]]),
  );
  assert.equal(sources.length, 2, "the fixture produced both kinds");
  const events = sourceEvents(toSourceRefs(sources));
  assert.deepEqual(events.map((e) => e.kind), ["law", "principle"]);
  assert.ok(events[0].label.startsWith("نظام العمل"));
  assert.ok(events[1].label.startsWith("مبدأ رقم"));
  assert.ok(!JSON.stringify(events).includes("SECRET"));
});

test("cleanLabel: control characters, whitespace, the 200-character cap, and nothing left", () => {
  assert.equal(cleanLabel("a\n\tb"), "a b");
  assert.equal(cleanLabel("  a   b  "), "a b");
  const long = cleanLabel("x".repeat(300))!;
  assert.equal(long.length, 200);
  assert.ok(long.endsWith("…"));
  assert.equal(cleanLabel("x".repeat(200)), "x".repeat(200));
  assert.equal(cleanLabel("  "), null);
  assert.equal(cleanLabel("\u0000\u0001"), null);
  assert.equal(cleanLabel(7), null);
  assert.equal(cleanLabel(null), null);
});

test("cleanLabel: the cut never leaves half a character, so the database check holds", () => {
  const long = cleanLabel("😀".repeat(300))!;
  assert.equal(Array.from(long).length, 200);
  assert.ok(!/[\uD800-\uDBFF]…$/.test(long));
});

test("fileEvents: names only, a blank name skipped, and a signed link never carried", () => {
  assert.deepEqual(fileEvents([{ name: "  " }, { name: "عقد.pdf" }]), [{ kind: "file", label: "عقد.pdf" }]);
  const events = fileEvents([{ name: "مذكرة.docx", url: "https://app.test/api/v1/ai/file-text/SECRET-TOKEN" } as never]);
  assert.deepEqual(events, [{ kind: "file", label: "مذكرة.docx" }]);
});

test("queryEvents: one event per search, blanks skipped", () => {
  assert.deepEqual(queryEvents(["أجر العامل", " "]), [{ kind: "query", label: "أجر العامل" }]);
});

test("verifyEvent: counts the checked citations in Arabic digits and quotes none", () => {
  assert.deepEqual(verifyEvent({ citation_check: [{ quote: "SECRET" }, { quote: "SECRET" }] }), {
    kind: "verify",
    label: "تحقق من ٢ إحالة نظامية في المكتبة",
  });
  assert.equal(verifyEvent({ citation_check: [] }), null);
  assert.equal(verifyEvent({ citation_check: "x" }), null);
  assert.equal(verifyEvent({}), null);
});

test("the step labels are the section's words", () => {
  assert.deepEqual(STEP_LABEL_AR, {
    reading: "يقرأ المستندات",
    drafting: "يكتب الناتج",
    reviewing: "يراجع الناتج",
    sent: "أُرسل الطلب إلى المحرّك",
  });
});

test("recordProgress: one insert, the run and its owner on each row, at most 40", async () => {
  const { client, log } = fakeDb(() => ({}));
  const events: ProgressEvent[] = Array.from({ length: 45 }, (_, i) => ({ kind: "law", label: `م ${i}` }));
  await recordProgress(client, "run-1", "user-1", events);
  assert.equal(log.length, 1);
  assert.equal(log[0].table, "progress_events");
  assert.equal(log[0].op, "insert");
  const rows = log[0].payload as Array<Record<string, unknown>>;
  assert.equal(rows.length, 40);
  assert.deepEqual(rows[0], { run_id: "run-1", user_id: "user-1", kind: "law", label: "م 0" });
});

test("recordProgress: nothing to write makes no call", async () => {
  const { client, log } = fakeDb(() => ({}));
  await recordProgress(client, "run-1", "user-1", []);
  assert.equal(log.length, 0);
});

test("recordProgress: a database error logs its code alone — Postgres puts the failing row in the message", async () => {
  await withConsoleSpy(async (lines) => {
    const { client } = fakeDb(() => ({ error: { code: "23514", message: 'violates check; row (SECRET)', details: "Failing row contains (SECRET)" } as never }));
    await recordProgress(client, "run-1", "user-1", [{ kind: "note", label: "SECRET" }]);
    assert.equal(lines.length, 1);
    assert.match(lines[0], /23514/);
    assert.ok(!lines.join("\n").includes("SECRET"));
  });
});

test("recordProgress: it never throws, and a thrown value is not logged", async () => {
  await withConsoleSpy(async (lines) => {
    const client = {
      from() {
        throw new Error("SECRET");
      },
    } as unknown as SupabaseClient;
    await recordProgress(client, "run-1", "user-1", [{ kind: "note", label: "x" }]);
    assert.ok(!lines.join("\n").includes("SECRET"));
  });
});

test("recordProgress: a missing table (before 20261103_31) is logged once per process, then ignored", async () => {
  await withConsoleSpy(async (lines) => {
    const { client } = fakeDb(() => ({ error: { code: "42P01", message: "missing" } }));
    await recordProgress(client, "run-1", "user-1", [{ kind: "note", label: "x" }]);
    await recordProgress(client, "run-1", "user-1", [{ kind: "note", label: "x" }]);
    const { client: other } = fakeDb(() => ({ error: { code: "PGRST205", message: "missing" } }));
    await recordProgress(other, "run-1", "user-1", [{ kind: "note", label: "x" }]);
    assert.equal(lines.length, 1);
  });
});

function slowClient(delays: number[], seen: string[]) {
  let call = 0;
  return {
    from() {
      return {
        insert: async (rows: Array<{ label: string }>) => {
          await new Promise((r) => setTimeout(r, delays[call++] ?? 0));
          seen.push(rows[0].label);
          return { error: null };
        },
      };
    },
  } as unknown as SupabaseClient;
}

test("progressSink: writes in the order they were reported, and starts before the reply ends", async () => {
  const seen: string[] = [];
  const kept: Promise<void>[] = [];
  const sink = progressSink(slowClient([20, 0], seen), (work) => kept.push(work));
  sink("run-1", "user-1", [{ kind: "query", label: "first" }]);
  sink("run-1", "user-1", [{ kind: "law", label: "second" }]);
  assert.equal(kept.length, 2, "each write is handed over to be kept alive");
  // Nobody closed a request here: the write does not wait for one, which is
  // what lets a fast tool's progress show while its answer is still awaited.
  await Promise.all(kept);
  assert.deepEqual(seen, ["first", "second"]);
});

test("progressSink: no events, no call; a keep-alive that throws loses nothing", async () => {
  const seen: string[] = [];
  const kept: Promise<void>[] = [];
  const sink = progressSink(slowClient([], seen), (work) => {
    kept.push(work);
    throw new Error("`after` was called outside a request scope");
  });
  sink("run-1", "user-1", []);
  assert.equal(kept.length, 0);
  await withConsoleSpy(async () => {
    sink("run-1", "user-1", [{ kind: "step", label: "x" }]);
    await Promise.all(kept);
  });
  assert.deepEqual(seen, ["x"]);
});
