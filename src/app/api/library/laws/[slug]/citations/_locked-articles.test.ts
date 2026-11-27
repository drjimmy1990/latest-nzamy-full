/**
 * Owner answer ٢٣٦ (27 Nov 2026, batch l18-answers): on an article locked for
 * a non-subscriber, «الإحالات المرتبطة» (the box, its count and its content)
 * and the «اشرح لي» / «أضف للمسودة» buttons are hidden — in the interface AND
 * in the answers that feed them.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test "src/app/api/library/laws/[slug]/citations/_locked-articles.test.ts"
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { articleBoxLocked, articleBoxLockedByOwnLaw, lockedArticleRefs, withoutLockedArticles } from "./_locked-articles.ts";
import { LAW_LINKS_ID, type LawLinks } from "./_shape.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const item = (key: string, title: string) => ({
  key, kind: "article", title, status: "in_force", docKind: "law", docId: "other", anchorId: key.slice(8), anchorMissing: false, href: "/x", docHref: "/y",
}) as unknown as LawLinks["items"][string];

const BULK: LawLinks = {
  found: true,
  perType: 3,
  items: {
    "article:x1": item("article:x1", "مادة يذكرها الحر"),
    "article:x2": item("article:x2", "مادة لا يذكرها إلا المقفول"),
    "article:x3": item("article:x3", "مادة يذكرها النظام"),
  },
  articles: {
    free1: [["REFERS_TO", "out", 4, [["article:x1", 0]]]],
    locked1: [["REFERS_TO", "out", 9, [["article:x1", 0], ["article:x2", 0]]]],
    [LAW_LINKS_ID]: [["AMENDS", "in", 1, [["article:x3", 0]]]],
  },
} as unknown as LawLinks;

test("bulk: a locked article's groups (and their counts) leave; so do the nodes only it listed; the law box stays", () => {
  const out = withoutLockedArticles(BULK, new Set(["free1"]));
  assert.deepEqual(Object.keys(out.articles).sort(), [LAW_LINKS_ID, "free1"].sort());
  assert.deepEqual(Object.keys(out.items).sort(), ["article:x1", "article:x3"]);
  assert.doesNotMatch(JSON.stringify(out), /لا يذكرها إلا المقفول|locked1/);
  assert.equal(out.found, true);
  assert.equal(out.perType, 3);
});

test("bulk: null = every article open (a subscriber, a whitelisted law) — the answer is untouched", () => {
  assert.equal(withoutLockedArticles(BULK, null), BULK);
});

test("bulk: an empty open set (a failed read) hides every article's links (fails closed)", () => {
  const out = withoutLockedArticles(BULK, new Set());
  assert.deepEqual(Object.keys(out.articles), [LAW_LINKS_ID]);
  assert.deepEqual(Object.keys(out.items), ["article:x3"]);
});

test("?article=: a locked box answers nothing — no item, no total", () => {
  assert.equal(articleBoxLocked("locked1", new Set(["free1"])), true);
  assert.equal(articleBoxLocked("free1", new Set(["free1"])), false);
  assert.equal(articleBoxLocked(LAW_LINKS_ID, new Set()), false);
  assert.equal(articleBoxLocked("locked1", null), false);
  const r = lockedArticleRefs();
  assert.equal(r.found, false);
  for (const s of Object.values(r.sections)) {
    assert.equal(s.total, 0);
    assert.deepEqual(s.items, []);
  }
});

test("the route strips per viewer AFTER the cache, by the law route's own rule", () => {
  const route = read("./route.ts");
  // l19 (POST-L18-01): the viewer read is started beside the graph read and bounded (boundedViewer)
  assert.match(route, /const \{ viewer, timedOut: viewerLate, ms: viewerMs \} = await viewerRead;\n\s+const body = \{ available: true, \.\.\.maskDecreeTitlesForViewer\(withoutLockedArticles\(shapedLaw, viewer\.openIds\), viewer\.isSubscriber\) \};/);
  const article = route.slice(route.indexOf("if (url.searchParams.has('article'))"));
  const lockAt = article.indexOf("articleBoxLockedByOwnLaw(id, slug, {");
  assert.ok(lockAt >= 0 && lockAt < article.indexOf("articleCache.get(key)"), "a locked box never reaches the cache read");
  // l18 review: the lock is read from the article's own law (library.articles.law_slug)
  assert.match(route, /\.from\('articles'\)\.select\('law_slug'\)\.eq\('id', articleId\)/);
  assert.match(route, /if \(probe\.isWhitelisted === true \|\| probe\.freeLimit === -1\) return \{ isSubscriber, openIds: null \};/);
  assert.match(route, /const freeLimit = effectiveFreeLimit\(probe, total\.count\);/);
  assert.match(route, /\.order\('order_index', \{ ascending: true \}\)\n\s+\.order\('id', \{ ascending: true \}\)\n\s+\.limit\(freeLimit\);/);
  // the law route locks text by the same order
  const law = read("../route.ts");
  assert.match(law, /\.order\('order_index', \{ ascending: true \}\)\n\s+\.order\('id', \{ ascending: true \}\)/);
  // the client box imports _shape — the strip stays out of it
  assert.doesNotMatch(read("./_shape.ts"), /_locked-articles/);
});

test("the reader hides the buttons and the boxes on a locked article", () => {
  const card = read("../../../../../laws/[slug]/_article-components.tsx");
  assert.match(card, /const showExplainBtn = !isRepealed && !isLocked && \(viewMode !== "regulation" \|\| !!mergedReg\);/);
  assert.match(card, /\{viewMode !== "regulation" && refBox && !isLocked && <ArticleRefsButton articleId=\{article\.id\} \/>\}/);
  assert.match(card, /\{viewMode !== "regulation" && refBox && !isLocked && <ArticleRefsInline /);
  assert.match(card, /\{\(!isLocked \|\| mainInCart\) && \(\n\s+<button\n\s+onClick=\{mainOnToggleCart\}/);
  assert.match(card, /\{!isReadingMode && mergedReg && \(!isLocked \|\| regInCart\) && \(/);
  const page = read("../../../../../laws/[slug]/page.tsx");
  assert.match(page, /<RefBox articleId=\{activeArticle && \(activeArticle\.free \|\| viewerHasFullAccess === true\) \? activeArticle\.id : null\} \/>/);
});

// l18 review (blocking): `?article=<id>` under a whitelisted law's slug must not
// open a locked article of another law — the graph node is `article:<id>`
// whatever the slug.
test("?article=: the lock comes from the article's own law, not the URL's slug", async () => {
  const lawOf: Record<string, string> = { free1: "open-law", locked1: "locked-law", lockedA: "locked-law" };
  const openByLaw: Record<string, ReadonlySet<string> | null> = { "open-law": null, "locked-law": new Set(["freeA"]) };
  const asked: string[] = [];
  const deps = (urlSlug: string, isSubscriber = false) => ({
    isSubscriber,
    urlOpenIds: urlSlug in openByLaw ? openByLaw[urlSlug] : new Set<string>(),
    ownLawSlug: async (id: string) => lawOf[id] ?? null,
    openIdsFor: async (s: string) => { asked.push(s); return s in openByLaw ? openByLaw[s] : new Set<string>(); },
  });
  // whitelisted URL slug + a locked article id of another law → locked
  assert.equal(await articleBoxLockedByOwnLaw("locked1", "open-law", deps("open-law")), true);
  assert.deepEqual(asked, ["locked-law"]);
  // the article's own law, inside / outside its free window
  assert.equal(await articleBoxLockedByOwnLaw("free1", "open-law", deps("open-law")), false);
  assert.equal(await articleBoxLockedByOwnLaw("lockedA", "locked-law", deps("locked-law")), true);
  // an unknown id (or a failed read) stays locked; a subscriber and the law box are open
  assert.equal(await articleBoxLockedByOwnLaw("nope", "open-law", deps("open-law")), true);
  assert.equal(await articleBoxLockedByOwnLaw("locked1", "open-law", { ...deps("open-law"), ownLawSlug: async () => { throw new Error("x"); } }), true);
  assert.equal(await articleBoxLockedByOwnLaw("locked1", "open-law", deps("open-law", true)), false);
  assert.equal(await articleBoxLockedByOwnLaw(LAW_LINKS_ID, "locked-law", deps("locked-law")), false);
});
