/**
 * _graph-geometry.ts — where a card is drawn and where its arrows attach
 * (owner's NOTE-08 items 01, 02, 04, 05, 06).
 *
 * Pure and free of runtime imports (./_graph-model pulls in the icon set), so
 * `node --test` loads it. Every place that needs a card's rectangle — the card
 * itself, its arrows, the arrow labels, the arrow being drawn, fit-to-view —
 * goes through `nodeBox`, so they can no longer disagree:
 *   * a card is drawn at its real `pos`, negative included. The card used to
 *     be clamped to `Math.max(0, pos)` while its arrows used the real `pos`,
 *     so dragging past the top/left edge detached the arrows (item 05);
 *   * the size is the MEASURED one when the canvas has it (a card without
 *     `h` is auto-height: neither the model's 120 nor the resize handler's 90
 *     is its height), then `node.w/h`, then the defaults (item 06).
 */
import type { GraphNode, Point } from "./_graph-model";

export const NODE_W = 220;
export const NODE_H = 120;

export interface Size { w: number; h: number; }
export interface Box { x: number; y: number; w: number; h: number; }
export type Side = "left" | "right" | "top" | "bottom";

function positive(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined;
}

/** The card's rectangle on the canvas: measured size, then `w/h`, then defaults. */
export function nodeBox(node: Pick<GraphNode, "pos" | "w" | "h">, measured?: Size | null): Box {
  return {
    x: node.pos.x,
    y: node.pos.y,
    w: positive(measured?.w) ?? positive(node.w) ?? NODE_W,
    h: positive(measured?.h) ?? positive(node.h) ?? NODE_H,
  };
}

export function boxCenter(b: Box): Point {
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

export function portAt(b: Box, side: Side): Point {
  switch (side) {
    case "left": return { x: b.x, y: b.y + b.h / 2 };
    case "right": return { x: b.x + b.w, y: b.y + b.h / 2 };
    case "top": return { x: b.x + b.w / 2, y: b.y };
    case "bottom": return { x: b.x + b.w / 2, y: b.y + b.h };
  }
}

/** Which way a control point leaves its port: always away from the card. */
const OUTWARD: Record<Side, Point> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
};

/**
 * The facing sides of two cards: left/right when they are further apart
 * across than down, top/bottom otherwise (decided on the real centres).
 */
export function bestPorts(a: Box, b: Box): { src: Point; tgt: Point; srcSide: Side; tgtSide: Side } {
  const ca = boxCenter(a);
  const cb = boxCenter(b);
  const dx = cb.x - ca.x;
  const dy = cb.y - ca.y;
  let srcSide: Side;
  let tgtSide: Side;
  if (Math.abs(dx) > Math.abs(dy)) {
    srcSide = dx > 0 ? "right" : "left";
    tgtSide = dx > 0 ? "left" : "right";
  } else {
    srcSide = dy > 0 ? "bottom" : "top";
    tgtSide = dy > 0 ? "top" : "bottom";
  }
  return { src: portAt(a, srcSide), tgt: portAt(b, tgtSide), srcSide, tgtSide };
}

export interface Curve { src: Point; cp1: Point; cp2: Point; tgt: Point; }

/**
 * The arrow between two cards. Each control point is pushed OUT of its own
 * port's side (item 04). It used to be `src.x + ctrl` / `tgt.x - ctrl`
 * whatever the side, which is right only when the source is left of the
 * target; in the usual Arabic reading order (source on the right) both
 * control points pointed into the cards and the curve looped back through them.
 */
export function edgeCurve(a: Box, b: Box): Curve {
  const { src, tgt, srcSide, tgtSide } = bestPorts(a, b);
  const ctrl = Math.max(Math.abs(tgt.x - src.x), Math.abs(tgt.y - src.y)) * 0.45;
  const o1 = OUTWARD[srcSide];
  const o2 = OUTWARD[tgtSide];
  return {
    src,
    cp1: { x: src.x + o1.x * ctrl, y: src.y + o1.y * ctrl },
    cp2: { x: tgt.x + o2.x * ctrl, y: tgt.y + o2.y * ctrl },
    tgt,
  };
}

export function curvePath(c: Curve): string {
  return `M ${c.src.x} ${c.src.y} C ${c.cp1.x} ${c.cp1.y}, ${c.cp2.x} ${c.cp2.y}, ${c.tgt.x} ${c.tgt.y}`;
}

/** The point halfway along the curve (t = 0.5) — where the arrow's label sits. */
export function curveMidpoint(c: Curve): Point {
  return {
    x: (c.src.x + 3 * c.cp1.x + 3 * c.cp2.x + c.tgt.x) / 8,
    y: (c.src.y + 3 * c.cp1.y + 3 * c.cp2.y + c.tgt.y) / 8,
  };
}

/** The straight line shown while an arrow is being drawn, from the card's real centre. */
export function tempLinePath(from: Box, to: Point): string {
  const c = boxCenter(from);
  return `M ${c.x} ${c.y} L ${to.x} ${to.y}`;
}

/**
 * A pointer position in canvas coordinates. The canvas is drawn under
 * `translate(pan) scale(scale)` with origin 0 0, so the inverse divides by
 * the zoom AFTER removing the pan — items 01 and 02 forgot the division, so
 * at any zoom other than 100% the arrow and the new card landed off the cursor.
 */
export function screenToCanvas(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number },
  pan: Point,
  scale: number,
): Point {
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return { x: (clientX - rect.left - pan.x) / s, y: (clientY - rect.top - pan.y) / s };
}

/** Top-left for a new card so that its default-size centre lands on `p`. */
export function cardPosCenteredAt(p: Point, size: Size = { w: NODE_W, h: NODE_H }): Point {
  return { x: p.x - size.w / 2, y: p.y - size.h / 2 };
}
