import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("precedent detail has a stable order_index then id query order", () => {
  const route = readFileSync(new URL("./[slug]/route.ts", import.meta.url), "utf8");
  assert.match(
    route,
    /\.order\('order_index', \{ ascending: true \}\)\s*\.order\('id', \{ ascending: true \}\)/,
  );
});
