/**
 * folderMenuPlacement.ts — where the folder card's «⋮» menu opens (owner
 * note ٠٤ §١).
 * ─────────────────────────────────────────────────────────
 * The menu used to be `absolute bottom-full` inside the card, and the card,
 * the folder list (max-h + overflow-y-auto) and the widget all clip their
 * overflow, so it opened into a box that hid every pixel of it. It is now
 * portalled to document.body with `position: fixed`, at coordinates this
 * function computes from the button's getBoundingClientRect():
 *
 *   - below the button when the menu fits below it, else above it when it
 *     fits there, else on whichever side has more room (clamped on screen);
 *   - aligned to the button's inline-start edge's opposite side, as before:
 *     in RTL the menu's left edge meets the button's left edge, in LTR the
 *     right edges meet — then clamped inside the viewport's side margins.
 *
 * Pure: tested in folderMenuPlacement.test.ts.
 */

export interface RectLike {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface MenuPlacement {
  top: number;
  left: number;
  direction: "down" | "up";
  /** Set when neither side fits: the menu scrolls inside this height. */
  maxHeight?: number;
}

export function placeFloatingMenu(input: {
  anchor: RectLike;
  menu: { width: number; height: number };
  viewport: { width: number; height: number };
  isRTL: boolean;
  gap?: number;
  margin?: number;
}): MenuPlacement {
  const { anchor, menu, viewport, isRTL } = input;
  const gap = input.gap ?? 6;
  const margin = input.margin ?? 8;

  const spaceBelow = viewport.height - anchor.bottom - gap - margin;
  const spaceAbove = anchor.top - gap - margin;

  let direction: "down" | "up";
  let top: number;
  let maxHeight: number | undefined;
  if (menu.height <= spaceBelow) {
    direction = "down";
    top = anchor.bottom + gap;
  } else if (menu.height <= spaceAbove) {
    direction = "up";
    top = anchor.top - gap - menu.height;
  } else if (spaceBelow >= spaceAbove) {
    direction = "down";
    top = anchor.bottom + gap;
    maxHeight = Math.max(spaceBelow, 0);
  } else {
    direction = "up";
    maxHeight = Math.max(spaceAbove, 0);
    top = anchor.top - gap - maxHeight;
  }

  const preferredLeft = isRTL ? anchor.left : anchor.right - menu.width;
  const maxLeft = viewport.width - margin - menu.width;
  const left = Math.max(margin, Math.min(preferredLeft, maxLeft));

  return { top: Math.round(top), left: Math.round(left), direction, ...(maxHeight !== undefined ? { maxHeight: Math.round(maxHeight) } : {}) };
}
