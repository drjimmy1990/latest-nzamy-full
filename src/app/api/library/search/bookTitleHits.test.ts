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

test("every word must be in the book's title or author; order of words is free", () => {
  assert.equal(matchBookTitles(rows, "الموقعين إعلام")[0]?.slug, "elam-1");
  // «إعلام» is one book's title word and «البهوتي» another book's author: no book carries both.
  assert.deepEqual(matchBookTitles(rows, "إعلام البهوتي"), []);
});

test("an author's name finds his books (owner package 10-06: «السنهوري»)", () => {
  const sanhuri = [
    ...rows,
    { id: "wasit-1", title: "الوسيط في شرح القانون المدني — الجزء 1", author: "عبد الرزاق السنهوري", total_volumes: 1 },
    { id: "wasit-2", title: "الوسيط في شرح القانون المدني — الجزء 2", author: "عبد الرزاق السنهوري", total_volumes: 2 },
  ];
  const hits = matchBookTitles(sanhuri, "السنهوري");
  assert.deepEqual(hits.map((h) => h.slug), ["masader", "wasit-1"]);
  // The series is still one card, with its author.
  assert.equal(hits[1].title, "الوسيط في شرح القانون المدني");
  assert.equal(hits[1].volumeCount, 2);
  assert.equal(hits[1].author, "عبد الرزاق السنهوري");
  // Spelling folds as for titles; a full name works too.
  assert.equal(matchBookTitles(rows, "البهوتى")[0]?.slug, "kashaf");
  assert.equal(matchBookTitles(sanhuri, "عبد الرزاق السنهوري")[0]?.slug, "wasit-1");
  // Title words and the author together narrow to that book.
  assert.deepEqual(matchBookTitles(sanhuri, "الوسيط السنهوري").map((h) => h.slug), ["wasit-1"]);
});

test("a title match ranks before an author match", () => {
  const mixed = [
    { id: "by-ibn-qayyim", title: "زاد المعاد", author: "ابن القيم", total_volumes: 1 },
    { id: "about-ibn-qayyim", title: "ابن القيم وأثره في الفقه", author: "باحث معاصر", total_volumes: 1 },
  ];
  assert.deepEqual(matchBookTitles(mixed, "ابن القيم").map((h) => h.slug), ["about-ibn-qayyim", "by-ibn-qayyim"]);
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
