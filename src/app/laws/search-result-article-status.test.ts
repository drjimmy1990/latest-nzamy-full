import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { articleStatusNotice } from "./data.ts";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const cardsSource = readFileSync(new URL("./components/LawsTabContent.tsx", import.meta.url), "utf8");

test("law search rows retain the article status returned by the search API", () => {
  assert.match(pageSource, /articleStatus:\s*r\.meta\?\.status/);
  assert.doesNotMatch(pageSource, /lawStatus:\s*r\.meta\?\.status/);
});

test("only an unverified article status is labelled, without borrowing a parent-law status", () => {
  assert.equal(articleStatusNotice("status_undeclared", true), "لم يُتحقّق من الحالة");
  assert.equal(articleStatusNotice("active", true), null);
  assert.match(cardsSource, /sys\._isSearchResult && sys\.articleStatus === "status_undeclared"/);
  assert.match(cardsSource, /حالة المادة: \$\{searchArticleStatusNotice\}/);
  assert.equal((cardsSource.match(/حالة المادة: \$\{searchArticleStatusNotice\}/g) || []).length, 2, "grid and list cards both render the article-only notice");
  assert.doesNotMatch(cardsSource, /law_status|docStatus/);
});
