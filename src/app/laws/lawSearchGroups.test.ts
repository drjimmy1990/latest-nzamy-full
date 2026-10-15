import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MATCHED_ARTICLES_SHOWN, groupLawSearchCards, type LawSearchCardLike } from "./lawSearchGroups.ts";

const lawHit = (slug: string, title: string, extra: Partial<LawSearchCardLike> = {}): LawSearchCardLike => ({
  id: `law:${slug}`, slug, title, desc: `وصف ${title}`, free: true, status: "active", hitKind: "law", lawTitle: title, ...extra,
});
const articleHit = (id: string, slug: string, lawTitle: string, n: number, extra: Partial<LawSearchCardLike> = {}): LawSearchCardLike => ({
  id, slug, title: `${lawTitle} — المادة ${n}`, desc: `نص المادة ${n}`, free: true, status: "active",
  articleStatus: "active", hitKind: "article", lawTitle, articleLabel: `المادة ${n}`, ...extra,
});

test("article hits of one law become one card listing them, in the server's order", () => {
  const cards = groupLawSearchCards([
    articleHit("a1", "labor", "نظام العمل", 5),
    articleHit("b1", "civil", "نظام المعاملات المدنية", 9),
    articleHit("a2", "labor", "نظام العمل", 77),
  ]);
  assert.deepEqual(cards.map((c) => c.id), ["law:labor", "law:civil"]);
  assert.equal(cards[0].title, "نظام العمل");
  assert.deepEqual(cards[0].matchedArticles.map((a) => [a.id, a.label, a.snippet]), [
    ["a1", "المادة 5", "نص المادة 5"],
    ["a2", "المادة 77", "نص المادة 77"],
  ]);
  assert.equal(cards[0].desc, "", "an article snippet is listed, not used as the law's description");
  assert.equal(cards[0].articleStatus, undefined, "an article status is never the card's");
  assert.equal(cards[0].matchedArticles[0].status, "active");
});

test("the law-title hit and that law's articles are one card with the law's description", () => {
  const cards = groupLawSearchCards([
    lawHit("labor", "نظام العمل"),
    articleHit("b1", "civil", "نظام المعاملات المدنية", 9),
    articleHit("a1", "labor", "نظام العمل", 5),
  ]);
  assert.deepEqual(cards.map((c) => c.id), ["law:labor", "law:civil"]);
  assert.equal(cards[0].desc, "وصف نظام العمل");
  assert.equal(cards[0].hitKind, "law");
  assert.deepEqual(cards[0].matchedArticles.map((a) => a.id), ["a1"]);
});

test("only the first articles are listed; the rest are counted, from the loaded hits only", () => {
  const rows = Array.from({ length: 5 }, (_, i) => articleHit(`a${i}`, "labor", "نظام العمل", i + 1));
  const [card] = groupLawSearchCards(rows);
  assert.equal(card.matchedArticles.length, MATCHED_ARTICLES_SHOWN);
  assert.equal(card.moreMatchedArticles, 5 - MATCHED_ARTICLES_SHOWN);
  assert.equal(groupLawSearchCards(rows, 10)[0].moreMatchedArticles, 0);
});

test("after load-more, a law whose hits span two pages is still one card, with no repeated hit", () => {
  const page1 = [articleHit("a1", "labor", "نظام العمل", 1), articleHit("b1", "civil", "نظام المعاملات المدنية", 2)];
  const page2 = [articleHit("a2", "labor", "نظام العمل", 3), articleHit("a1", "labor", "نظام العمل", 1)];
  const cards = groupLawSearchCards([...page1, ...page2]);
  assert.deepEqual(cards.map((c) => c.id), ["law:labor", "law:civil"]);
  assert.deepEqual(cards[0].matchedArticles.map((a) => a.id), ["a1", "a2"]);
  assert.equal(new Set(cards.map((c) => c.id)).size, cards.length, "card keys are unique");
});

test("a locked hit lists its article label, never its snippet, and locks the card", () => {
  const [card] = groupLawSearchCards([
    articleHit("a1", "paid", "نظام مدفوع", 3, { free: false }),
    articleHit("a2", "paid", "نظام مدفوع", 4, { free: false }),
  ]);
  assert.equal(card.free, false);
  assert.deepEqual(card.matchedArticles.map((a) => [a.label, a.snippet]), [["المادة 3", ""], ["المادة 4", ""]]);
});

test("the parent law's status is kept, and a hit with no meta.articleLabel takes it from its title", () => {
  const [card] = groupLawSearchCards([
    articleHit("a1", "old", "نظام ملغى", 2, { status: "repealed", articleLabel: undefined, articleStatus: "status_undeclared" }),
  ]);
  assert.equal(card.status, "repealed");
  assert.equal(card.matchedArticles[0].label, "المادة 2");
  assert.equal(card.matchedArticles[0].status, "status_undeclared");
});

test("a hit with no law slug stays its own card, unchanged", () => {
  const stray = { id: "x1", slug: "", title: "نتيجة", desc: "نص", free: true, articleStatus: "status_undeclared", hitKind: "article" };
  const cards = groupLawSearchCards([stray, { ...stray, id: "x2" }]);
  assert.deepEqual(cards.map((c) => c.id), ["x1", "x2"]);
  assert.equal(cards[0].articleStatus, "status_undeclared");
  assert.deepEqual(cards[0].matchedArticles, []);
});

test("the page groups the loaded hits and both card layouts list the matching articles", () => {
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  const cards = readFileSync(new URL("./components/LawsTabContent.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("../api/library/search/route.ts", import.meta.url), "utf8");
  assert.match(page, /const lawCards = isSearchActive \? groupLawSearchCards\(filteredLaws\) : filteredLaws;/);
  assert.match(page, /filteredLaws=\{lawCards\}/);
  for (const key of ["hitKind: r.meta?.kind", "lawTitle: r.meta?.lawTitle", "articleLabel: r.meta?.articleLabel"]) {
    assert.ok(page.includes(key), key);
  }
  assert.equal((cards.match(/\{matchedArticlesList\}/g) || []).length, 2, "grid and list layouts");
  assert.match(cards, /\{isUnlocked && a\.snippet && \(/, "a locked card lists labels only");
  assert.match(route, /articleLabel: articleLabel \|\| null,/);
});

test("no rows → no cards; malformed rows are skipped", () => {
  assert.deepEqual(groupLawSearchCards([]), []);
  // @ts-expect-error — a malformed payload must not break the page.
  assert.deepEqual(groupLawSearchCards([null, undefined]), []);
});
