import assert from "node:assert/strict";
import test from "node:test";
import { articleStatusNotice, isRepealedArticleStatus, type ArticleStatus } from "./data.ts";

test("renders only status_undeclared as an explicit unverified-status notice", () => {
  assert.equal(articleStatusNotice("status_undeclared", true), "لم يُتحقّق من الحالة");
  assert.equal(articleStatusNotice("status_undeclared", false), "Status not verified");
  for (const status of ["active", "repealed", "amended", "suspended", "added", "merged"] as ArticleStatus[]) {
    assert.equal(articleStatusNotice(status, true), null, `${status} keeps its existing presentation`);
  }
});

test("the historical-text toggle remains exclusive to explicit repeal", () => {
  assert.equal(isRepealedArticleStatus("repealed"), true);
  for (const status of ["active", "status_undeclared", "amended", "suspended", "added", "merged"] as ArticleStatus[]) {
    assert.equal(isRepealedArticleStatus(status), false, `${status} must not expose a repeal-text toggle`);
  }
});
