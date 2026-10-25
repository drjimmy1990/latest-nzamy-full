import assert from "node:assert/strict";
import test from "node:test";
import { articleStatusNotice, isRepealedArticleStatus, type ArticleStatus } from "./data.ts";

test("owner ٢٥٩: no article gets a status notice — an unrecorded status shows nothing", () => {
  assert.equal(articleStatusNotice("status_undeclared", true), null);
  assert.equal(articleStatusNotice("status_undeclared", false), null);
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
