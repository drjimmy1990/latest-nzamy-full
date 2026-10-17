import assert from "node:assert/strict";
import test from "node:test";
import { LOGO_FRACTION, logoBox } from "./qrWithLogo.ts";

test("the logo tile is centred and stays small enough for level-H error correction", () => {
  const b = logoBox(480, 1280, 1239);
  assert.equal(b.tile.size, Math.round(480 * LOGO_FRACTION));
  assert.equal(b.tile.x, b.tile.y);
  assert.equal(b.tile.x * 2 + b.tile.size, 480);
  // The ring and tile cover well under the ~30% level H recovers.
  assert.ok((b.ring.size * b.ring.size) / (480 * 480) < 0.08);
  assert.ok(b.ring.x < b.tile.x && b.ring.size > b.tile.size);
});

test("the logo keeps its aspect ratio and sits inside the tile", () => {
  for (const [w, h] of [[1280, 1239], [400, 100], [100, 400], [0, 0]] as const) {
    const b = logoBox(480, w, h);
    assert.ok(b.logo.width <= b.tile.size && b.logo.height <= b.tile.size, `${w}x${h}`);
    assert.ok(Math.abs(b.logo.x * 2 + b.logo.width - 480) < 1e-9, `${w}x${h} centred`);
    if (w > 0 && h > 0) assert.ok(Math.abs(b.logo.width / b.logo.height - w / h) < 1e-9, `${w}x${h} ratio`);
  }
});
