/**
 * The next radio to choose for a key press inside a radio group, or null when
 * the key does not move the choice. Arrow keys wrap, and left and right follow
 * the reading direction (RTL by default). Pure, so `node --test` can load it.
 */
export function nextRadioIndex(key: string, index: number, count: number, rtl = true): number | null {
  if (count <= 0) return null;
  if (key === "ArrowDown" || key === (rtl ? "ArrowLeft" : "ArrowRight")) return (index + 1) % count;
  if (key === "ArrowUp" || key === (rtl ? "ArrowRight" : "ArrowLeft")) return (index - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}
