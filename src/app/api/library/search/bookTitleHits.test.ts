import { test } from "node:test";
import assert from "node:assert/strict";
import { matchBookTitles } from "./bookTitleHits.ts";

const rows = [
  { id: "elam-1", title: "إعلام الموقعين عن رب العالمين — الجزء 1", author: "ابن القيم", total_volumes: 1 },
  { id: "elam-2", title: "إعلام الموقعين عن رب العالمين — الجزء 2", author: "ابن القيم", total_volumes: 2 },
  { id: "elam-3", title: "إعلام الموقعين عن رب العالمين — الجزء 3", author: "ابن القيم", total_volumes: 3 },
  { id: "elam-4", title: "إعلام الموقعين عن رب العالمين — الجزء 4", author: "ابن القيم", total_volumes: 4 },
  { id: "kashaf", title: "كشاف القناع عن متن الإقناع", author: "البهوتي", total_volumes: 1 },
  { id: "masader", title: "مصادر الحق في الفقه الإسلامي", author: "السنهوري", total_volumes: 1 },
];

test("the owner's query finds the book, as one series card", () => {
  const hits = matchBookTitles(rows, "إعلام الموقعين");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].slug, "elam-1");
  assert.equal(hits[0].title, "إعلام الموقعين عن رب العالمين");
  assert.equal(hits[0].volumeCount, 4);
  assert.ok(hits[0].volumesLabel);
});

test("hamza and harakat do not matter", () => {
  assert.equal(matchBookTitles(rows, "اعلام الموقعين")[0]?.slug, "elam-1");
  assert.equal(matchBookTitles(rows, "إِعْلَامُ المُوَقِّعِين")[0]?.slug, "elam-1");
  assert.equal(matchBookTitles(rows, "الاقناع")[0]?.slug, "kashaf");
});

test("every word must be in the title; order of words is free", () => {
  assert.equal(matchBookTitles(rows, "الموقعين إعلام")[0]?.slug, "elam-1");
  assert.deepEqual(matchBookTitles(rows, "إعلام البهوتي"), []);
});

test("a phrase match ranks before a scattered-words match", () => {
  const more = [
    ...rows,
    { id: "x", title: "الحق والفقه: مصادر", author: "", total_volumes: 1 },
  ];
  const hits = matchBookTitles(more, "مصادر الحق");
  assert.equal(hits[0].slug, "masader");
});

test("too-short or empty queries match nothing", () => {
  assert.deepEqual(matchBookTitles(rows, ""), []);
  assert.deepEqual(matchBookTitles(rows, "في"), []);
  assert.deepEqual(matchBookTitles(rows, "إعلام", 0), []);
});
