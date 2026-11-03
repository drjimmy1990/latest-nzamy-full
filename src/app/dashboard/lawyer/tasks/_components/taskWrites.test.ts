import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRowWriteQueue, revertFields, confirmFields } from "./taskWrites.ts";

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

test("CODE-F11: writes to one row are sent in click order, each after the previous settles", async () => {
  const q = createRowWriteQueue();
  const log: string[] = [];
  const first = deferred<boolean>();
  const a = q.enqueue("t1", async () => { log.push("send-1"); return first.promise; });
  const b = q.enqueue("t1", async () => { log.push("send-2"); return true; });
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(log, ["send-1"]); // the second waits for the first's answer
  first.resolve(false);
  assert.equal(await a, false);
  assert.equal(await b, true);
  assert.deepEqual(log, ["send-1", "send-2"]);
});

test("CODE-F11: a failed job does not block or reject the next one; other rows run independently", async () => {
  const q = createRowWriteQueue();
  const a = q.enqueue("t1", async () => { throw new Error("boom"); });
  const b = q.enqueue("t1", async () => "ok");
  const c = q.enqueue("t2", async () => "other");
  await assert.rejects(a);
  assert.equal(await b, "ok");
  assert.equal(await c, "other");
});

test("CODE-F11: an older failure does not roll back a field a newer edit owns", () => {
  const q = createRowWriteQueue();
  const older = q.begin("t1", ["status"]);
  const newer = q.begin("t1", ["status"]);
  assert.deepEqual(q.ownedFields(older), []);
  assert.deepEqual(q.ownedFields(newer), ["status"]);
});

test("CODE-F11: versions are per field — a title edit does not steal a pending status write's rollback", () => {
  const q = createRowWriteQueue();
  const status = q.begin("t1", ["status"]);
  q.begin("t1", ["title"]);
  q.begin("t2", ["status"]);
  assert.deepEqual(q.ownedFields(status), ["status"]);
  const edit = q.begin("t1", ["title", "priority"]);
  q.begin("t1", ["priority"]);
  assert.deepEqual(q.ownedFields(edit), ["title"]);
});

test("CODE-F11: rollback goes to the server-confirmed value, not the optimistic value at click time", () => {
  type Row = { status: string; title: string };
  let confirmed: Row = { status: "todo", title: "أ" };
  // click 1: todo → done (optimistic), click 2: done → in_progress (optimistic)
  const screen: Row = { status: "in_progress", title: "أ" };
  // both fail; the latest owns status and reverts — to "todo", not to "done"
  assert.deepEqual(revertFields(screen, confirmed, ["status"]), { status: "todo", title: "أ" });
  confirmed = confirmFields(confirmed, { title: "ب" });
  assert.deepEqual(confirmed, { status: "todo", title: "ب" });
  assert.deepEqual(revertFields(screen, confirmed, []), screen);
});

// Wiring: the page must not read a value assigned inside a state updater, and
// must celebrate only after the server answered.
const PAGE = readFileSync(new URL("../page.tsx", import.meta.url), "utf8");

test("CODE-F11 wiring: no handler assigns request variables inside a setTasks updater", () => {
  assert.equal(/setTasks\(\s*prev\s*=>/.test(PAGE), false, "setTasks(prev => …) is gone; writes go through commitTasks");
  assert.match(PAGE, /createRowWriteQueue\(\)/);
  assert.match(PAGE, /writesRef\.current\.enqueue\(/);
  assert.match(PAGE, /writesRef\.current\.ownedFields\(/);
});

test("CODE-F12 wiring: the edit save is not optimistic, so its card (and open editor) cannot move mid-save", () => {
  const onEditSave = PAGE.slice(PAGE.indexOf("const onEditSave"), PAGE.indexOf("const onDragStart"));
  assert.match(onEditSave, /writeFields\(taskId, patch, send, null, \{ optimistic: false \}\)/);
  assert.match(PAGE, /if \(!optimistic\) return false;/);
});

test("CODE-F12 wiring: no delete action that only archives; restore is reachable on touch", () => {
  const CARD = readFileSync(new URL("./TaskCard.tsx", import.meta.url), "utf8");
  assert.equal(/onDelete/.test(CARD), false);
  assert.equal(/onDelete/.test(PAGE), false);
  assert.equal(/<Trash\b/.test(PAGE + CARD), false);
  assert.match(PAGE, /opacity-100 md:opacity-0 md:group-hover:opacity-100[^"]*"?[^>]*>\s*\n?\s*<ArrowCounterClockwise/);
});

test("LIVE-F27 wiring: kanban cards are exactly the column's array — no exit-animation ghosts", () => {
  assert.equal(/mode={?"popLayout"/.test(PAGE), false);
  assert.equal(/layoutId=/.test(PAGE), false);
  assert.equal(PAGE.includes("activeVisible"), false, "no grouping bypasses the filters");
  assert.match(PAGE, /visibleTasks\(tasks, filters,/);
  assert.match(PAGE, /groupTasks\(visible, kanbanGroup,/);
});

test("LIVE-F38 wiring: the page reads today from useRiyadhToday, never a UTC slice", () => {
  assert.match(PAGE, /useRiyadhToday\(\)/);
  assert.equal(PAGE.includes("toISOString().slice(0"), false);
  assert.equal(/=\s*useState\(new Date\(\)\)/.test(PAGE), false);
});

test("CODE-F11 wiring: the celebration runs inside the success branch of the status write", () => {
  const onToggle = PAGE.slice(PAGE.indexOf("const onToggle"), PAGE.indexOf("const onArchive"));
  const celebrate = onToggle.indexOf("showAchievement(");
  const awaited = onToggle.indexOf("await writeFields(");
  assert.ok(awaited > 0 && celebrate > awaited, "showAchievement comes after the awaited write");
  assert.match(onToggle, /if \(ok && next === "done"\)/);
});
