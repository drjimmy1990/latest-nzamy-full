/**
 * topUpDraft.test.ts — the in-tool top-up: the draft kept per tool, the safe
 * way back, the packs per account type.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  clearToolDraft,
  DRAFT_MAX_AGE_MS,
  draftText,
  loadToolDraft,
  readTopUpReturn,
  safeToolReturnPath,
  saveToolDraft,
  saveTopUpReturn,
  toolDraftKey,
  topUpPacksFor,
} from "./topUpDraft.ts";

function memory() {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

const T0 = 1_800_000_000_000;

test("the draft round-trips per tool and is cleared", () => {
  const s = memory();
  assert.equal(saveToolDraft(s, "quick-answer", { question: "ما مدة الاستئناف؟" }, T0), true);
  assert.deepEqual(loadToolDraft(s, "quick-answer", T0 + 60_000), { question: "ما مدة الاستئناف؟" });
  assert.equal(loadToolDraft(s, "analyze-strength", T0), null, "keyed by tool");
  assert.equal(draftText(loadToolDraft(s, "quick-answer", T0), "question"), "ما مدة الاستئناف؟");
  clearToolDraft(s, "quick-answer");
  assert.equal(loadToolDraft(s, "quick-answer", T0), null);
});

test("a stale draft is dropped; bad tool ids, bad JSON and throwing storage keep nothing", () => {
  const s = memory();
  saveToolDraft(s, "quick-answer", { question: "x" }, T0);
  assert.equal(loadToolDraft(s, "quick-answer", T0 + DRAFT_MAX_AGE_MS + 1), null);
  assert.equal(s.m.size, 0, "removed");
  assert.equal(toolDraftKey("../x"), null);
  assert.equal(saveToolDraft(s, "Bad Tool", { a: 1 }, T0), false);
  s.m.set("nzamy:tool-draft:quick-answer", "{not json");
  assert.equal(loadToolDraft(s, "quick-answer", T0), null);
  const throwing = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
    removeItem: () => {
      throw new Error("blocked");
    },
  };
  assert.equal(saveToolDraft(throwing, "quick-answer", { a: 1 }, T0), false);
  assert.equal(loadToolDraft(throwing, "quick-answer", T0), null);
  assert.doesNotThrow(() => clearToolDraft(throwing, "quick-answer"));
  assert.equal(saveToolDraft(null, "quick-answer", { a: 1 }, T0), false);
});

test("the way back is a relative /ai path only — never another origin", () => {
  for (const ok of ["/ai/quick-answer", "/ai/analyze-strength", "/ai", "/ai/legal-opinion?tab=a"]) {
    assert.equal(safeToolReturnPath(ok), ok, ok);
  }
  for (const bad of [
    "https://evil.example/ai/x",
    "//evil.example/ai",
    "/ai//evil.example",
    "/ai/../admin",
    "/dashboard",
    "/ai\\evil",
    "javascript:alert(1)",
    "/ai/x<script>",
    null,
    42,
  ]) {
    assert.equal(safeToolReturnPath(bad), null, String(bad));
  }
  const s = memory();
  assert.equal(saveTopUpReturn(s, "https://evil.example"), false);
  assert.equal(readTopUpReturn(s), null);
  assert.equal(saveTopUpReturn(s, "/ai/quick-answer"), true);
  assert.equal(readTopUpReturn(s), "/ai/quick-answer");
  s.m.set("nzamy:topup-return", "//evil.example");
  assert.equal(readTopUpReturn(s), null, "re-validated on read");
});

test("the packs follow the book's audience: an individual 100 / 250, a lawyer 500 and up, cheapest first (l12 Q87: the 50 pack is retired)", () => {
  assert.deepEqual(topUpPacksFor("individual").map((p) => p.id), ["topup-100", "topup-250"]);
  assert.deepEqual(topUpPacksFor("lawyer").map((p) => p.id), ["topup-500", "topup-1000", "topup-2500", "topup-5000", "topup-10000"]);
  assert.deepEqual(topUpPacksFor(null).map((p) => p.id), []);
});

test("wiring: the hook keeps the draft on insufficient points and clears it on an accepted run; the layout hosts the modal", () => {
  const root = process.cwd();
  const hook = readFileSync(join(root, "src", "hooks", "useAiRun.ts"), "utf8");
  assert.match(hook, /INSUFFICIENT_POINTS_CODE/);
  assert.match(hook, /saveToolDraft\(/);
  assert.match(hook, /clearToolDraft\(/);
  assert.match(hook, /INSUFFICIENT_POINTS_EVENT/);
  const layout = readFileSync(join(root, "src", "app", "ai", "layout.tsx"), "utf8");
  assert.match(layout, /<TopUpModalHost \/>/);
  for (const page of [["quick-answer"], ["analyze-strength"]]) {
    const src = readFileSync(join(root, "src", "app", "ai", ...page, "page.tsx"), "utf8");
    assert.match(src, /useToolDraft\(/, page.join("/"));
  }
  const result = readFileSync(join(root, "src", "app", "payments", "result", "page.tsx"), "utf8");
  assert.match(result, /<TopUpReturnLink/);
});
