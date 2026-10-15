import test from "node:test";
import assert from "node:assert/strict";
import { toFeedQuestion, filterAndSortFeed, displayWhen, formatPostedDate } from "./_feedView.ts";

// What GET /api/v1/community/posts now returns (toFeedItem in api/v1/community/posts/_feed.ts).
const API_ITEM = {
  id: "0f8fad5b-d9cb-469f-a165-70867728950e",
  tab: "lawyers",
  visibility: "lawyers_only",
  category: "real-estate",
  title: "سؤال",
  body: "تفاصيل",
  tags: ["إيجار"],
  asker: "عضو في المجتمع",
  askerType: "user",
  answers: [],
  answerCount: 3,
  views: 12,
  votes: 4,
  isAnswered: true,
  isPinned: false,
  createdAt: "2026-10-16T08:00:00.000Z",
};

const DEMO_ITEM = {
  id: 1760600000000,
  tab: "public",
  category: "labor",
  title: "سؤال تجريبي",
  asker: "زائر",
  askerType: "guest",
  answers: [{ id: 1, author: "أ", authorType: "lawyer", authorRating: 1, content: "x", votes: 0, isAccepted: false, ago: "الآن" }],
  views: 1,
  votes: 2,
  isAnswered: true,
  ago: "الآن",
  tags: [],
};

test("an API item keeps its uuid as a string key, its count and its tab", () => {
  const q = toFeedQuestion(API_ITEM);
  assert.equal(q.key, API_ITEM.id);
  assert.equal(q.href, `/community/${API_ITEM.id}`);
  assert.equal(q.tab, "lawyers");
  assert.equal(q.answerCount, 3, "from answerCount, not the empty answers array");
  assert.equal(q.answers.length, 0);
  assert.equal(q.createdAtMs, Date.parse(API_ITEM.createdAt));
  assert.notEqual(q.when, "", "a date is printed");
  assert.equal(q.when.includes("T08"), false, "never the raw ISO string");
});

test("a demo item keeps its own ago and counts its inline answers", () => {
  const q = toFeedQuestion(DEMO_ITEM);
  assert.equal(q.key, "1760600000000");
  assert.equal(q.answerCount, 1);
  assert.equal(q.when, "الآن");
  assert.equal(q.createdAtMs, 1760600000000);
});

test("tab filter keeps each tab's own posts; «الأحدث» orders uuids by date, not NaN", () => {
  const older = toFeedQuestion({ ...API_ITEM, id: "b", tab: "public", createdAt: "2026-10-01T00:00:00Z" });
  const newer = toFeedQuestion({ ...API_ITEM, id: "a", tab: "public", createdAt: "2026-10-15T00:00:00Z" });
  const lawyers = toFeedQuestion(API_ITEM);
  const base = { category: "all", search: "", sort: "new" as const };
  assert.deepEqual(filterAndSortFeed([older, lawyers, newer], { ...base, tab: "public" }).map((q) => q.key), ["a", "b"]);
  assert.deepEqual(filterAndSortFeed([older, lawyers, newer], { ...base, tab: "lawyers" }).map((q) => q.key), [API_ITEM.id]);
});

test("«الأعلى» sorts by the real answer count; category and search narrow", () => {
  const few = toFeedQuestion({ ...API_ITEM, id: "few", tab: "public", answerCount: 1, category: "labor", title: "عمل" });
  const many = toFeedQuestion({ ...API_ITEM, id: "many", tab: "public", answerCount: 9, category: "family", title: "حضانة" });
  const opts = { tab: "public" as const, category: "all", search: "", sort: "top" as const };
  assert.deepEqual(filterAndSortFeed([few, many], opts).map((q) => q.key), ["many", "few"]);
  assert.deepEqual(filterAndSortFeed([few, many], { ...opts, category: "labor" }).map((q) => q.key), ["few"]);
  assert.deepEqual(filterAndSortFeed([few, many], { ...opts, search: "حضان" }).map((q) => q.key), ["many"]);
});

test("displayWhen prints a date for ISO input and passes worded values through", () => {
  assert.equal(displayWhen("منذ ساعة"), "منذ ساعة");
  assert.equal(displayWhen(""), "");
  assert.equal(displayWhen("2026-10-16T08:00:00.000Z"), formatPostedDate("2026-10-16T08:00:00.000Z"));
  assert.equal(formatPostedDate("not a date"), "");
});
