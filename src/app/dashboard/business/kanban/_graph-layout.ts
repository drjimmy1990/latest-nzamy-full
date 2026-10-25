/**
 * _graph-layout.ts — «ترتيب تلقائي» (N3.10): a small force-directed layout.
 *
 * Written here rather than pulled from d3-force: the board has tens of cards,
 * the whole algorithm is ~60 lines, and a dependency would be one more package
 * on a page every lawyer opens. The forces are the usual three:
 *   * repulsion between every pair of cards (Coulomb, 1/d²), measured between
 *     card CENTRES and padded by the cards' own size so wide Arabic titles do
 *     not end up underneath each other;
 *   * a spring on every link (Hooke), pulling linked cards to a rest length;
 *   * a weak pull towards the centre so unlinked islands do not drift away;
 * integrated with velocity damping for a FIXED number of iterations.
 *
 * Deterministic: the only randomness — the jitter that separates two cards on
 * the very same point, where repulsion has no direction — comes from a seeded
 * PRNG (mulberry32), so the same board always lays out the same way and the
 * button is safe to undo and press again.
 *
 * Then a final pass removes any overlap that survived, and the whole result is
 * translated so the top-left card sits at LAYOUT_MARGIN: the canvas draws a card
 * at max(0, x) but its links at the raw x, so a negative coordinate would detach
 * the card from its lines.
 */

export interface LayoutPoint { x: number; y: number }
export interface LayoutNode { id: string; pos: LayoutPoint; w?: number; h?: number }
export interface LayoutEdge { from: string; to: string }

export const LAYOUT_MARGIN = 40;
const DEFAULT_W = 220;
const DEFAULT_H = 120;

export interface LayoutOptions {
  seed?: number;
  iterations?: number;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function forceLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  { seed = 20261025, iterations = 300 }: LayoutOptions = {},
): Map<string, LayoutPoint> {
  const out = new Map<string, LayoutPoint>();
  if (nodes.length === 0) return out;
  const rand = mulberry32(seed);

  const sims = nodes.map((n) => {
    const w = n.w ?? DEFAULT_W;
    const h = n.h ?? DEFAULT_H;
    const x = Number.isFinite(n.pos?.x) ? n.pos.x : 0;
    const y = Number.isFinite(n.pos?.y) ? n.pos.y : 0;
    return { id: n.id, w, h, cx: x + w / 2, cy: y + h / 2, vx: 0, vy: 0 };
  });
  const index = new Map(sims.map((s, i) => [s.id, i]));
  const links = edges
    .map((e) => [index.get(e.from), index.get(e.to)] as const)
    .filter((p): p is readonly [number, number] => p[0] !== undefined && p[1] !== undefined && p[0] !== p[1]);

  const REPULSION = 90_000;
  const SPRING = 0.04;
  const GRAVITY = 0.01;
  const DAMPING = 0.82;
  const MAX_STEP = 60;

  for (let it = 0; it < iterations; it++) {
    const cool = 1 - it / iterations;
    let mx = 0;
    let my = 0;
    for (const s of sims) { mx += s.cx; my += s.cy; }
    mx /= sims.length;
    my /= sims.length;

    const fx = new Array(sims.length).fill(0);
    const fy = new Array(sims.length).fill(0);

    for (let i = 0; i < sims.length; i++) {
      for (let j = i + 1; j < sims.length; j++) {
        const a = sims[i];
        const b = sims[j];
        let dx = b.cx - a.cx;
        let dy = b.cy - a.cy;
        if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) {
          dx = rand() - 0.5;
          dy = rand() - 0.5;
        }
        const dist = Math.max(1, Math.hypot(dx, dy));
        const pad = (Math.max(a.w, a.h) + Math.max(b.w, b.h)) / 2;
        const f = (REPULSION * (1 + pad / 200)) / (dist * dist);
        const ux = dx / dist;
        const uy = dy / dist;
        fx[i] -= f * ux; fy[i] -= f * uy;
        fx[j] += f * ux; fy[j] += f * uy;
      }
    }

    for (const [i, j] of links) {
      const a = sims[i];
      const b = sims[j];
      const dx = b.cx - a.cx;
      const dy = b.cy - a.cy;
      const dist = Math.max(1, Math.hypot(dx, dy));
      const rest = (Math.max(a.w, a.h) + Math.max(b.w, b.h)) / 2 + 80;
      const f = SPRING * (dist - rest);
      const ux = dx / dist;
      const uy = dy / dist;
      fx[i] += f * ux; fy[i] += f * uy;
      fx[j] -= f * ux; fy[j] -= f * uy;
    }

    for (let i = 0; i < sims.length; i++) {
      const s = sims[i];
      fx[i] += (mx - s.cx) * GRAVITY;
      fy[i] += (my - s.cy) * GRAVITY;
      s.vx = (s.vx + fx[i]) * DAMPING;
      s.vy = (s.vy + fy[i]) * DAMPING;
      const step = Math.hypot(s.vx, s.vy);
      const cap = MAX_STEP * Math.max(0.1, cool);
      if (step > cap) { s.vx = (s.vx / step) * cap; s.vy = (s.vy / step) * cap; }
      s.cx += s.vx;
      s.cy += s.vy;
    }
  }

  // Overlap removal: push intersecting boxes apart along the shallower axis.
  const GAP = 24;
  for (let pass = 0; pass < 50; pass++) {
    let moved = false;
    for (let i = 0; i < sims.length; i++) {
      for (let j = i + 1; j < sims.length; j++) {
        const a = sims[i];
        const b = sims[j];
        const ox = (a.w + b.w) / 2 + GAP - Math.abs(b.cx - a.cx);
        const oy = (a.h + b.h) / 2 + GAP - Math.abs(b.cy - a.cy);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        if (ox < oy) {
          const dir = b.cx >= a.cx ? 1 : -1;
          a.cx -= (dir * ox) / 2; b.cx += (dir * ox) / 2;
        } else {
          const dir = b.cy >= a.cy ? 1 : -1;
          a.cy -= (dir * oy) / 2; b.cy += (dir * oy) / 2;
        }
      }
    }
    if (!moved) break;
  }

  let minX = Infinity;
  let minY = Infinity;
  for (const s of sims) {
    minX = Math.min(minX, s.cx - s.w / 2);
    minY = Math.min(minY, s.cy - s.h / 2);
  }
  for (const s of sims) {
    out.set(s.id, {
      x: Math.round(s.cx - s.w / 2 - minX + LAYOUT_MARGIN),
      y: Math.round(s.cy - s.h / 2 - minY + LAYOUT_MARGIN),
    });
  }
  return out;
}
