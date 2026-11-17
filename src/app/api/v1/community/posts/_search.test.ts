import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCommunityTsQuery,
  communitySearchWords,
  communitySortColumns,
  communitySortFor,
  MAX_SEARCH_WORDS,
} from "./_search.ts";

test("words are folded like community_fold: alef, taa marbuta, alef maqsura, tashkeel, digits, case", () => {
  assert.deepEqual(communitySearchWords("الحَضانة  إيجار مستشفى ١٤٤٤ ABC"), ["الحضانه", "ايجار", "مستشفي", "1444", "abc"]);
});

test("a query becomes ANDed words, each an OR of article forms with a prefix match", () => {
  assert.equal(
    buildCommunityTsQuery("قرار"),
    "(قرار:* | القرار:* | والقرار:* | بالقرار:* | للقرار:*)",
  );
  assert.equal(buildCommunityTsQuery("الحضانة 1444"), "(الحضانه:* | والحضانه:* | بالحضانه:* | للحضانه:*) & 1444:*");
});

test("no tsquery operator a visitor types reaches to_tsquery", () => {
  const hostile = `a' & | ! ( ) : * \\ < > -- ; "x" عقد)|(!`;
  const q = buildCommunityTsQuery(hostile) ?? "";
  // only our own operators and the allowed word characters
  const stripped = q.replace(/[()|&:* ]/g, "");
  assert.match(stripped, /^[ء-يa-z0-9]*$/u);
  assert.equal(buildCommunityTsQuery("!!! ::: '''"), null);
  assert.equal(buildCommunityTsQuery(""), null);
  assert.equal(buildCommunityTsQuery(null), null);
});

test("a long query is capped, duplicates are dropped", () => {
  const many = Array.from({ length: 20 }, (_, i) => `w${i}`).join(" ");
  assert.equal(communitySearchWords(many).length, MAX_SEARCH_WORDS);
  assert.deepEqual(communitySearchWords("عقد عقد"), ["عقد"]);
});

test("sort: hot = votes, top = answers, anything else = newest", () => {
  assert.equal(communitySortFor("hot"), "hot");
  assert.equal(communitySortFor("top"), "top");
  assert.equal(communitySortFor("x; drop"), "new");
  assert.deepEqual(communitySortColumns("hot")[0], ["vote_count", false]);
  assert.deepEqual(communitySortColumns("top")[0], ["answer_count", false]);
  assert.deepEqual(communitySortColumns("new"), [["created_at", false]]);
});
