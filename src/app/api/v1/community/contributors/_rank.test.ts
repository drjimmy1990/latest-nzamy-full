import test from "node:test";
import assert from "node:assert/strict";
import { tallyAuthors, rankContributors } from "./_rank.ts";

test("tallyAuthors counts answers per author, most first, ties stable", () => {
  const tally = tallyAuthors([
    { author_id: "b" }, { author_id: "a" }, { author_id: "b" }, { author_id: "c" },
    { author_id: "c" }, { author_id: "b" }, { author_id: null }, {},
  ]);
  assert.deepEqual(tally, [["b", 3], ["c", 2], ["a", 1]]);
});

test("only gated (public-profile) lawyers with a real name are listed — nobody is filled in", () => {
  const tally: [string, number][] = [["hidden", 9], ["noname", 7], ["pub1", 4], ["pub2", 2], ["pub3", 1]];
  const gate = new Map([
    ["noname", { slug: "x" }],
    ["pub1", { slug: "pub-one" }],
    ["pub2", { slug: null }],
    ["pub3", { slug: "" }],
  ]);
  const names = new Map([["hidden", "محامٍ غير ظاهر"], ["noname", "  "], ["pub1", "أ. واحد"], ["pub2", "أ. اثنان"], ["pub3", "أ. ثلاثة"]]);
  assert.deepEqual(rankContributors(tally, gate, names, 5), [
    { name: "أ. واحد", slug: "pub-one", answers: 4 },
    { name: "أ. اثنان", slug: null, answers: 2 },
    { name: "أ. ثلاثة", slug: null, answers: 1 },
  ]);
  assert.equal(rankContributors(tally, gate, names, 1).length, 1);
  assert.deepEqual(rankContributors([], gate, names, 5), []);
});
