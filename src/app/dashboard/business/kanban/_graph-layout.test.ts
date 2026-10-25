import test from "node:test";
import assert from "node:assert/strict";
import { forceLayout, LAYOUT_MARGIN, type LayoutNode } from "./_graph-layout.ts";

const box = (id: string, x: number, y: number, w = 220, h = 120): LayoutNode & { w: number; h: number } => ({ id, pos: { x, y }, w, h });

type Box = { id: string; pos: { x: number; y: number }; w: number; h: number };
function overlaps(a: Box, b: Box): boolean {
  return a.pos.x < b.pos.x + b.w && b.pos.x < a.pos.x + a.w && a.pos.y < b.pos.y + b.h && b.pos.y < a.pos.y + a.h;
}

test("same input, same output — the layout is seeded, not random", () => {
  const nodes = [box("a", 0, 0), box("b", 10, 10), box("c", 500, 40), box("d", 30, 300)];
  const edges = [{ from: "a", to: "b" }, { from: "b", to: "c" }];
  const one = forceLayout(nodes, edges);
  const two = forceLayout(nodes, edges);
  assert.deepEqual([...one.entries()], [...two.entries()]);
});

test("cards stacked on the same point are pulled apart and every result is finite", () => {
  const nodes = Array.from({ length: 6 }, (_, i) => box(`n${i}`, 100, 100));
  const out = forceLayout(nodes, []);
  assert.equal(out.size, 6);
  const placed = nodes.map((n) => ({ ...n, pos: out.get(n.id)! }));
  for (const p of placed) {
    assert.ok(Number.isFinite(p.pos.x) && Number.isFinite(p.pos.y), `${p.id} is finite`);
  }
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      assert.equal(overlaps(placed[i], placed[j]), false, `${placed[i].id} and ${placed[j].id} do not overlap`);
    }
  }
});

test("the result starts at the margin: no negative coordinates (cards render at max(0, x))", () => {
  const nodes = [box("a", -900, -400), box("b", -950, -380), box("c", 40, 20)];
  const out = forceLayout(nodes, [{ from: "a", to: "c" }]);
  const xs = [...out.values()].map((p) => p.x);
  const ys = [...out.values()].map((p) => p.y);
  assert.equal(Math.min(...xs), LAYOUT_MARGIN);
  assert.equal(Math.min(...ys), LAYOUT_MARGIN);
});

test("linked cards end closer together than unlinked ones", () => {
  const nodes = [box("a", 0, 0), box("b", 900, 0), box("c", 0, 900), box("d", 900, 900)];
  const out = forceLayout(nodes, [{ from: "a", to: "d" }]);
  const d = (x: string, y: string) => Math.hypot(out.get(x)!.x - out.get(y)!.x, out.get(x)!.y - out.get(y)!.y);
  assert.ok(d("a", "d") < d("b", "c"), `linked ${d("a", "d")} < unlinked ${d("b", "c")}`);
});

test("edges to unknown ids, an empty board and a single card are harmless", () => {
  assert.equal(forceLayout([], []).size, 0);
  const one = forceLayout([box("solo", 300, 300)], [{ from: "solo", to: "ghost" }]);
  assert.deepEqual(one.get("solo"), { x: LAYOUT_MARGIN, y: LAYOUT_MARGIN });
});
