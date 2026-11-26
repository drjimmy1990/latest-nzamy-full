import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

/**
 * Batch l16 (B-43b): the research-sessions list caps its page size and offset
 * (a malformed value reads as the default). The helper is the route's own,
 * so it is evaluated from the source here (a route file exports handlers only).
 */
const route = readFileSync(new URL("./route.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const body = route.slice(route.indexOf("function pageParam("), route.indexOf("\n}\n", route.indexOf("function pageParam(")) + 2);
const pageParam = new Function(
  `return ${body.replace(/\(raw: string \| null, fallback: number, min: number, max: number\): number/, "(raw, fallback, min, max)")}`,
)() as (raw: string | null, fallback: number, min: number, max: number) => number;

test("B-43b: limit and offset are clamped; malformed or missing values read as the default", () => {
  assert.equal(pageParam("50", 20, 1, 100), 50);
  assert.equal(pageParam("100000", 20, 1, 100), 100);
  assert.equal(pageParam("0", 20, 1, 100), 1);
  assert.equal(pageParam("-5", 20, 1, 100), 20);
  assert.equal(pageParam("abc", 20, 1, 100), 20);
  assert.equal(pageParam(null, 0, 0, 100000), 0);
  assert.equal(pageParam(" 7 ", 0, 0, 100000), 7);
});

test("B-43b: the route reads both parameters through the clamp", () => {
  assert.match(route, /const limit = pageParam\(searchParams\.get\("limit"\), 20, 1, MAX_PAGE\);/);
  assert.match(route, /const offset = pageParam\(searchParams\.get\("offset"\), 0, 0, MAX_OFFSET\);/);
  assert.match(route, /const MAX_PAGE = 100;/);
  assert.doesNotMatch(route, /parseInt\(searchParams/);
});
