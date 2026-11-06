import assert from "node:assert/strict";
import test from "node:test";

import { catalogueMatches } from "./catalogueMatch.ts";

test("catalogue cards match with the library grammar, not a literal includes", () => {
  assert.equal(catalogueMatches("الاثبات", ["نظام الإثبات"]), true);
  assert.equal(catalogueMatches("نظام -الإثبات", ["نظام الإثبات"]), false);
  assert.equal(catalogueMatches("نظام", ["نظام الإثبات", null, undefined]), true);
  assert.equal(catalogueMatches("عمل + اثبات", ["نظام العمل", "الإثبات"]), true);
  assert.equal(catalogueMatches("تحكيم", ["نظام الإثبات"]), false);
  // The matcher is rebuilt when the query changes.
  assert.equal(catalogueMatches("تحكيم", ["نظام التحكيم"]), true);
});

test("half-typed queries never throw and never blank the catalogue (typed on every keystroke)", () => {
  for (const q of ['"', '"غرامة', "(", ")", "-", "+", "/", "*", "نظام -", "نظام /", "نظام +"]) {
    assert.equal(catalogueMatches(q, ["نظام الغرامة"]), true, JSON.stringify(q));
  }
});
