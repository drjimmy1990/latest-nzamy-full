/**
 * BUG-LIB-01 (S1 Task 7) — pure helpers for a reader that colours only the
 * blocks near the viewport. The legend then cannot walk rendered <mark>s (most
 * are not rendered), so ↑/↓ step from one MATCHING BLOCK to the next instead,
 * and the block's own marks render once it scrolls near.
 *
 * No imports: node:test loads it.
 */

/**
 * The next (`dir` 1) or previous (-1) entry of `matchIndexes` (ascending block
 * indexes that hold a match) after `current`, wrapping at both ends. `current`
 * need not be a match itself (the block in view, or -1 before any).
 * null when nothing matches.
 */
export function stepPrincipleIndex(matchIndexes: readonly number[], current: number, dir: 1 | -1): number | null {
  if (matchIndexes.length === 0) return null;
  if (dir === 1) {
    for (const i of matchIndexes) if (i > current) return i;
    return matchIndexes[0];
  }
  for (let k = matchIndexes.length - 1; k >= 0; k -= 1) {
    if (matchIndexes[k] < current) return matchIndexes[k];
  }
  return matchIndexes[matchIndexes.length - 1];
}
