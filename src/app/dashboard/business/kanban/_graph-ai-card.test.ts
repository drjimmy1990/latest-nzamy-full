/**
 * _graph-ai-card.test.ts — «اقترح سنداً نظامياً»: the server's picks joined to
 * its citations (a pick naming a text the server did not send is dropped),
 * and the law cards placed beside the selection without repeating an article
 * already on the board.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/app/dashboard/business/kanban/_graph-ai-card.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { askCanvasCard, joinSuggestions, sourceNote, suggestionsToNodes } from "./_graph-ai-card.ts";
import type { GraphNode } from "./_graph-model";

const CITES = [
  { sid: "S1", kind: "article", id: "labor__art-80", title: "نظام العمل — الثمانون", url: "/laws/labor#labor__art-80" },
  { sid: "S3", kind: "article", id: "labor__art-77", title: "نظام العمل — السابعة والسبعون", url: "/laws/labor#labor__art-77" },
];

test("joinSuggestions keeps only picks the server cited, in the model's order, each once", () => {
  const out = joinSuggestions({ cards: [{ sid: "S3", why: "التعويض" }, { sid: "S9", why: "مختلق" }, { sid: "S1", why: "الفسخ" }, { sid: "S3", why: "مكرر" }] }, CITES);
  assert.deepEqual(out.map((s) => [s.sid, s.title, s.why]), [
    ["S3", "نظام العمل — السابعة والسبعون", "التعويض"],
    ["S1", "نظام العمل — الثمانون", "الفسخ"],
  ]);
  assert.deepEqual(joinSuggestions(null, CITES), []);
  assert.deepEqual(joinSuggestions({ cards: [{ sid: "S1", why: "x" }] }, "nope"), []);
});

const node = (id: string, x: number, y: number, notes?: string): GraphNode => ({
  id, type: "event", title: id, desc: "", pos: { x, y }, author: { name: "أ", color: "c", role: "r" }, ...(notes ? { notes } : {}),
});

test("law cards go in a column right of the selected cards and point at their library text", () => {
  const board = [node("a", 100, 200), node("b", 400, 120), node("far", 2000, 0)];
  let i = 0;
  const made = suggestionsToNodes(joinSuggestions({ cards: [{ sid: "S1", why: "الفسخ" }, { sid: "S3", why: "التعويض" }] }, CITES), board, new Set(["a", "b"]), () => `n${i++}`, "https://nezamy.sa");
  assert.equal(made.length, 2);
  assert.deepEqual(made.map((n) => n.type), ["law", "law"]);
  assert.deepEqual(made[0].pos, { x: 400 + 220 + 80, y: 120 }, "beside the selection, not the far card");
  assert.ok(made[1].pos.y > made[0].pos.y);
  assert.equal(made[0].notes, "المصدر: نظام العمل — الثمانون\nhttps://nezamy.sa/laws/labor#labor__art-80");
  assert.match(made[0].meta ?? "", /راجعه/);
});

test("an article already on the board is not added twice", () => {
  const already = node("x", 0, 0, sourceNote(CITES[0], "https://nezamy.sa"));
  const made = suggestionsToNodes(joinSuggestions({ cards: [{ sid: "S1", why: "الفسخ" }, { sid: "S3", why: "التعويض" }] }, CITES), [already], new Set(), () => "n", "https://nezamy.sa");
  assert.deepEqual(made.map((n) => n.title), ["نظام العمل — السابعة والسبعون"]);
});

test("askCanvasCard sends the cards' type, title and text, and passes a refusal through", async () => {
  const sent: Array<Record<string, unknown>> = [];
  const reply = (status: number, body: unknown) => (async (_u: string, init: RequestInit) => {
    sent.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;

  const ok = await askCanvasCard([{ type: "event", title: "فصل العامل", desc: "بعد غياب" }], reply(200, { output: { cards: [{ sid: "S1", why: "الفسخ" }] }, citations: CITES, chargedPoints: 10 }));
  assert.equal(ok.ok, true);
  assert.equal(ok.chargedPoints, 10);
  assert.equal(sent[0].tool, "canvas-card");
  assert.deepEqual(sent[0].input, { cards: [{ type: "event", title: "فصل العامل", desc: "بعد غياب" }] });

  const none = await askCanvasCard([{ type: "event", title: "x", desc: "" }], reply(422, { error: "لم أجد في مكتبة الأنظمة…", code: "no_sources" }));
  assert.deepEqual(none, { ok: false, suggestions: [], error: "لم أجد في مكتبة الأنظمة…" });
});
