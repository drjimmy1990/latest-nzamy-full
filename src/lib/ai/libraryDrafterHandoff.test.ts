/**
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/libraryDrafterHandoff.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  LIBRARY_HANDOFF_KEY, LIBRARY_NOTES_MAX, DRAFTER_LIBRARY_URL, consumeLibraryHandoff, discardLibraryHandoff, notesWithLibraryText, writeLibraryHandoff,
} from "./libraryDrafterHandoff.ts";
import { TRANSCRIPT_HANDOFF_KEY } from "./transcriptHandoff.ts";

function memory() {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

test("write → consume once, under its own key (never the transcript's)", () => {
  const s = memory();
  assert.deepEqual(writeLibraryHandoff(s, "  نص المادة  ", "باحث المكتبة", 1000), { ok: true, truncated: false });
  assert.ok(s.m.has(LIBRARY_HANDOFF_KEY));
  assert.ok(!s.m.has(TRANSCRIPT_HANDOFF_KEY));
  const h = consumeLibraryHandoff(s, 2000);
  assert.equal(h?.text, "نص المادة");
  assert.equal(h?.sourceLabel, "باحث المكتبة");
  assert.equal(consumeLibraryHandoff(s, 2000), null, "read once");
});

test("expired, empty, missing storage and a throwing storage", () => {
  const s = memory();
  writeLibraryHandoff(s, "x", "", 0);
  assert.equal(consumeLibraryHandoff(s, 31 * 60 * 1000), null);
  assert.equal(s.m.size, 0, "an expired value is removed too");
  assert.deepEqual(writeLibraryHandoff(s, "   ", "a"), { ok: false, reason: "empty" });
  assert.deepEqual(writeLibraryHandoff(null, "x", "a"), { ok: false, reason: "storage" });
  const bad = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); }, removeItem: () => { throw new Error("x"); } };
  assert.deepEqual(writeLibraryHandoff(bad, "x", "a"), { ok: false, reason: "storage" });
  assert.equal(consumeLibraryHandoff(bad), null);
  discardLibraryHandoff(bad);
});

test("a text longer than the drafter's notes limit is cut to it, and the cut is reported", () => {
  const s = memory();
  assert.deepEqual(writeLibraryHandoff(s, "س".repeat(LIBRARY_NOTES_MAX + 10), "x", 1), { ok: true, truncated: true });
  const h = consumeLibraryHandoff(s, 2);
  assert.equal(h?.text.length, LIBRARY_NOTES_MAX);
  assert.equal(h?.truncated, true);
});

test("the notes field keeps what was there and names the source", () => {
  assert.equal(notesWithLibraryText("", { text: "نص", sourceLabel: "" }), "نص");
  assert.equal(notesWithLibraryText("ملاحظتي", { text: "نص", sourceLabel: "نظام العمل — المادة ٧٧" }), "ملاحظتي\n\nمن نظام العمل — المادة ٧٧:\nنص");
  assert.equal(DRAFTER_LIBRARY_URL, "/ai/draft?from=library");
});

test("the drafter consumes ?from=library into the notes field and discards it otherwise", () => {
  const page = readFileSync(join(process.cwd(), "src/app/ai/draft/page.tsx"), "utf8");
  assert.ok(page.includes("consumeLibraryHandoff(sessionStorageOrNull())"));
  assert.ok(page.includes("discardLibraryHandoff(sessionStorageOrNull())"));
  assert.ok(/setNotesText\(\(prev\) => notesWithLibraryText\(prev, handoff\)\)/.test(page));
  // Researcher V3: the tab's answers carry the shared action strip.
  const tab = readFileSync(join(process.cwd(), "src/app/laws/components/AiTabContent.tsx"), "utf8");
  assert.ok(tab.includes("<ResearchTurnView"));
  const actions = readFileSync(join(process.cwd(), "src/app/laws/research/_components/ResearchAnswerActions.tsx"), "utf8");
  assert.ok(actions.includes("<SendToDrafterNotesButton"));
});

test("B-24 (batch l16, owner package 25-Nov §2.8 (5)): «أرسل إلى الصائغ» explains itself in two visible lines", () => {
  const button = readFileSync(join(process.cwd(), "src/components/draft/SendToDrafterNotesButton.tsx"), "utf8");
  assert.ok(button.includes('data-testid="send-to-drafter-hint"'));
  assert.ok(button.includes("{DRAFTER_HINT[0]}") && button.includes("{DRAFTER_HINT[1]}"));
  assert.ok(button.includes("لا يُرسل شيئاً ولا يخصم نقاطاً"));
});
