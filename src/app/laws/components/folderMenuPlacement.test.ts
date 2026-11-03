/**
 * folderMenuPlacement.test.ts — owner note ٠٤ §١: the «⋮» menu opens down or
 * up by the room on screen, aligned to its button, never off screen.
 *   node --test src/app/laws/components/folderMenuPlacement.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";
import { placeFloatingMenu } from "./folderMenuPlacement.ts";

const viewport = { width: 1200, height: 800 };
const menu = { width: 176, height: 175 };
const button = (top: number, left = 300) => ({ top, bottom: top + 32, left, right: left + 32 });

test("opens below the button when it fits there", () => {
  const p = placeFloatingMenu({ anchor: button(100), menu, viewport, isRTL: true });
  assert.equal(p.direction, "down");
  assert.equal(p.top, 100 + 32 + 6);
  assert.equal(p.maxHeight, undefined);
});

test("opens above the button when below has no room (the last folder in the list)", () => {
  const p = placeFloatingMenu({ anchor: button(700), menu, viewport, isRTL: true });
  assert.equal(p.direction, "up");
  assert.equal(p.top, 700 - 6 - 175);
});

test("neither side fits: the larger side, with a max height, still on screen", () => {
  const short = { width: 1200, height: 300 };
  const p = placeFloatingMenu({ anchor: button(80), menu, viewport: short, isRTL: true });
  assert.equal(p.direction, "down");
  assert.ok(p.maxHeight !== undefined && p.maxHeight < menu.height);
  assert.ok(p.top + (p.maxHeight ?? 0) <= short.height);
  const up = placeFloatingMenu({ anchor: button(200), menu, viewport: short, isRTL: true });
  assert.equal(up.direction, "up");
  assert.ok(up.top >= 0);
});

test("RTL aligns the menu's left edge with the button's; LTR its right edge", () => {
  const rtl = placeFloatingMenu({ anchor: button(100, 300), menu, viewport, isRTL: true });
  assert.equal(rtl.left, 300);
  const ltr = placeFloatingMenu({ anchor: button(100, 300), menu, viewport, isRTL: false });
  assert.equal(ltr.left, 332 - 176);
});

test("clamped inside the side margins (a button at the screen edge)", () => {
  const right = placeFloatingMenu({ anchor: button(100, 1180), menu, viewport, isRTL: true });
  assert.equal(right.left, 1200 - 8 - 176);
  const left = placeFloatingMenu({ anchor: button(100, 0), menu, viewport, isRTL: false });
  assert.equal(left.left, 8);
});
