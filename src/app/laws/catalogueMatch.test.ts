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
