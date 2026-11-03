import test from "node:test";
import assert from "node:assert/strict";
import {
  NODE_H,
  NODE_W,
  bestPorts,
  cardPosCenteredAt,
  curveMidpoint,
  curvePath,
  edgeCurve,
  nodeBox,
  screenToCanvas,
  tempLinePath,
} from "./_graph-geometry.ts";

const card = (x: number, y: number, w?: number, h?: number) => ({ pos: { x, y }, w, h });

test("item 01/02: a pointer maps to the canvas with the pan removed and the zoom divided out", () => {
  const rect = { left: 100, top: 50 };
  const pan = { x: 40, y: -20 };
  assert.deepEqual(screenToCanvas(540, 370, rect, pan, 1), { x: 400, y: 340 });
  // At 50% the same screen point is twice as far into the canvas.
  assert.deepEqual(screenToCanvas(540, 370, rect, pan, 0.5), { x: 800, y: 680 });
  assert.deepEqual(screenToCanvas(540, 370, rect, pan, 2), { x: 200, y: 170 });
  // A broken scale never divides by zero.
  assert.deepEqual(screenToCanvas(540, 370, rect, pan, 0), { x: 400, y: 340 });
  // The old formula (no division) put a card 400px off at 50% zoom.
  const p = screenToCanvas(540, 370, rect, pan, 0.5);
  assert.notEqual(p.x, 540 - rect.left - pan.x);
});

test("item 01/02: a new card is centred on the drop / right-click point", () => {
  assert.deepEqual(cardPosCenteredAt({ x: 800, y: 680 }), { x: 800 - NODE_W / 2, y: 680 - NODE_H / 2 });
});

test("item 04: control points leave each port outward — source to the RIGHT of the target (RTL)", () => {
  const src = nodeBox(card(600, 100));
  const tgt = nodeBox(card(100, 100));
  const c = edgeCurve(src, tgt);
  assert.equal(c.src.x, 600, "leaves from the source's left side");
  assert.equal(c.tgt.x, 100 + NODE_W, "enters the target's right side");
  assert.ok(c.cp1.x < c.src.x, "cp1 goes left, out of the source — not into it");
  assert.ok(c.cp2.x > c.tgt.x, "cp2 goes right, out of the target — not into it");
});

test("item 04: left-to-right is unchanged, and vertical ports push up/down", () => {
  const ltr = edgeCurve(nodeBox(card(100, 100)), nodeBox(card(600, 100)));
  assert.ok(ltr.cp1.x > ltr.src.x && ltr.cp2.x < ltr.tgt.x);
  const up = edgeCurve(nodeBox(card(100, 600)), nodeBox(card(100, 100)));
  assert.equal(up.src.y, 600, "source below → leaves from its top");
  assert.ok(up.cp1.y < up.src.y, "and its control point goes up");
  assert.ok(up.cp2.y > up.tgt.y, "target above → its control point goes down");
  const down = edgeCurve(nodeBox(card(100, 100)), nodeBox(card(100, 600)));
  assert.ok(down.cp1.y > down.src.y && down.cp2.y < down.tgt.y);
});

test("item 05: a card at negative coordinates is drawn and anchored at the same place", () => {
  const box = nodeBox(card(-300, -150));
  assert.equal(box.x, -300, "no clamp to 0");
  assert.equal(box.y, -150);
  const { src } = bestPorts(box, nodeBox(card(400, -150)));
  assert.deepEqual(src, { x: -300 + NODE_W, y: -150 + NODE_H / 2 }, "the arrow starts on the card's real edge");
});

test("item 06: anchors use the measured size, then w/h, then the defaults", () => {
  assert.deepEqual(nodeBox(card(0, 0)), { x: 0, y: 0, w: NODE_W, h: NODE_H });
  assert.deepEqual(nodeBox(card(0, 0, 400, 200)), { x: 0, y: 0, w: 400, h: 200 });
  assert.deepEqual(nodeBox(card(0, 0, 400), { w: 400, h: 163 }), { x: 0, y: 0, w: 400, h: 163 }, "auto-height: the measured height");
  assert.deepEqual(nodeBox(card(0, 0, Number.NaN, -5)), { x: 0, y: 0, w: NODE_W, h: NODE_H }, "junk sizes fall back");
  // A widened card's right port is on its real edge, not at 220.
  const wide = nodeBox(card(0, 0, 500, 90));
  const { src } = bestPorts(wide, nodeBox(card(900, 0)));
  assert.deepEqual(src, { x: 500, y: 45 });
});

test("item 06: the label sits on the curve's midpoint, and the drawing line starts at the real centre", () => {
  const c = edgeCurve(nodeBox(card(0, 0)), nodeBox(card(600, 0)));
  const m = curveMidpoint(c);
  assert.equal(m.x, (c.src.x + c.tgt.x) / 2, "symmetric curve → the middle");
  assert.equal(m.y, NODE_H / 2);
  assert.match(curvePath(c), /^M 220 60 C /);
  assert.equal(tempLinePath(nodeBox(card(0, 0, 400, 200)), { x: 10, y: 20 }), "M 200 100 L 10 20");
});
