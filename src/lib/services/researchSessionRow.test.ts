import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { toCollectorSession } from "./researchSessionRow.ts";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("LIVE-F18: the saved name (`title` column) is the session's name after a reload", () => {
  const s = toCollectorSession({
    id: "s1", title: "TEST-CODEX-P2", status: "active", created_at: "2026-10-29T10:00:00Z",
    updated_at: "2026-10-29T10:05:00Z", research_items: [{ count: 0 }],
  });
  assert.deepEqual(s, { id: "s1", name: "TEST-CODEX-P2", createdAt: "2026-10-29T10:00:00Z", isArchived: false, itemCount: 0 });
});

test("an archived row reads as archived; the English placeholder reads as no name", () => {
  const s = toCollectorSession({ id: "s2", title: "Untitled Session", status: "archived", created_at: "a", updated_at: "b" });
  assert.equal(s.name, "");
  assert.equal(s.isArchived, true);
  assert.equal(s.archivedAt, "b");
});

test("an already-mapped (local-mode) session passes through", () => {
  const s = toCollectorSession({ id: "s3", name: "محلي", createdAt: "c", isArchived: false });
  assert.deepEqual(s, { id: "s3", name: "محلي", createdAt: "c", isArchived: false });
});

test("researchService maps every server session read and the create answer", () => {
  const src = read("lib/services/researchService.ts");
  assert.match(src, /\.map\(toCollectorSession\)/);
  assert.match(src, /return toCollectorSession\(res\.data/);
});
