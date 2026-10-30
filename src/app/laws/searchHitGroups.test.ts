import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { deepHitHref, groupFeqhSearchCards, groupPrincipleSearchCards } from "./searchHitGroups.ts";

test("deepHitHref: ?target=, ?q= and the #anchor, in that shape", () => {
  assert.equal(deepHitHref("/precedents/c1", "p9", "عمل"), `/precedents/c1?target=p9&q=${encodeURIComponent("عمل")}#p9`);
  assert.equal(deepHitHref("/book/fiqh", "b-1", ""), "/book/fiqh?target=b-1#b-1");
  assert.equal(deepHitHref("/laws/x?viewMode=regulation", "a1", "q1"), "/laws/x?viewMode=regulation&target=a1&q=q1#a1");
  assert.equal(deepHitHref("/laws/x", "", "q1"), "/laws/x?q=q1");
});

test("١٢-١: principles sit under their collection; a title hit and its principles are ONE card", () => {
  const cols = [
    { id: "c1", slug: "c1", title: "مجموعة الأحكام ١٤٤٠", court: "المحكمة العليا", free: true },
    { id: "c2", slug: "c2", title: "مجموعة بلا مبادئ مطابقة", court: "—", free: true },
  ];
  const principles = [
    { id: "p1", collectionId: "c3", collectionTitle: "مبادئ ديوان المظالم", principleNum: "4", source: "ديوان المظالم", text: "نص ١" },
    { id: "p2", collectionId: "c1", principleNum: "12", source: "المحكمة العليا", text: "نص ٢" },
    { id: "p3", collectionId: "c3", text: "نص ٣", locked: true },
    { id: "p2", collectionId: "c1", text: "مكرر" },
    { id: "p4", collectionId: "", text: "بلا مجموعة" },
  ];
  const groups = groupPrincipleSearchCards(principles, cols, "عمل");
  assert.deepEqual(groups.map((g) => g.key), ["col:c1", "col:c2", "col:c3", "row:p4"]);
  const [c1, c2, c3, orphan] = groups;
  assert.equal(c1.title, "مجموعة الأحكام ١٤٤٠");
  assert.equal(c1.collection?.id, "c1");
  assert.equal(c1.total, 1, "a duplicate hit is listed once");
  assert.equal(c1.rows[0].label, "مبدأ رقم (12)");
  assert.equal(c1.rows[0].href, `/precedents/c1?target=p2&q=${encodeURIComponent("عمل")}#p2`);
  assert.equal(c2.total, 0);
  assert.equal(c2.court, "", "the «—» placeholder is not a court");
  assert.equal(c3.title, "مبادئ ديوان المظالم");
  assert.equal(c3.court, "ديوان المظالم");
  assert.equal(c3.rows[1].snippet, "", "a locked hit shows no text");
  assert.equal(c3.rows[1].locked, true);
  assert.equal(c3.rows[1].label, "", "no invented number");
  assert.equal(orphan.href, "");
  assert.equal(orphan.rows[0].href, "");
});

test("rows are capped; the rest is counted, never hidden from the parent link", () => {
  const principles = Array.from({ length: 7 }, (_, i) => ({ id: `p${i}`, collectionId: "c1", text: `t${i}` }));
  const [g] = groupPrincipleSearchCards(principles, [], "x", 4);
  assert.equal(g.rows.length, 4);
  assert.equal(g.more, 3);
  assert.equal(g.total, 7);
  assert.equal(g.href, "/precedents/c1?q=x");
});

test("١٢-١: fiqh passages sit under their book; the book-title hit names the card", () => {
  const hits = [
    { id: "x1", slug: "mughni", title: "المغني — كتاب البيوع", hitKind: undefined, chapter: "كتاب البيوع", page: 12, desc: "مقطع", author: "ابن قدامة" },
    { id: "mughni", slug: "mughni", title: "المغني", hitKind: "book", desc: "وصف" },
    { id: "x2", slug: "mughni", title: "المغني — باب الربا", topic: "باب الربا", desc: "مقطع ٢", locked: true },
    { id: "y1", slug: "umm", bookTitle: "الأم", title: "الأم — الطهارة", desc: "نص" },
  ];
  const groups = groupFeqhSearchCards(hits, "بيع");
  assert.deepEqual(groups.map((g) => g.key), ["book:mughni", "book:umm"]);
  const [mughni, umm] = groups;
  assert.equal(mughni.title, "المغني");
  assert.equal(mughni.bookHit?.id, "mughni");
  assert.equal(mughni.author, "ابن قدامة");
  assert.equal(mughni.total, 2, "the book-title hit is the card, not a row");
  assert.equal(mughni.rows[0].label, "كتاب البيوع · ص 12");
  assert.equal(mughni.rows[0].href, `/book/mughni?target=x1&q=${encodeURIComponent("بيع")}#x1`);
  assert.equal(mughni.rows[1].snippet, "");
  assert.equal(mughni.rows[1].label, "باب الربا");
  assert.equal(mughni.href, `/book/mughni?q=${encodeURIComponent("بيع")}`);
  assert.equal(umm.title, "الأم");
});

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("source: the tabs render grouped search cards; links carry ?target= and ?q=; the page highlights", () => {
  const prec = read("./components/PrecedentsTabContent.tsx");
  assert.match(prec, /groupPrincipleSearchCards\(filteredPrinciples as unknown as PrincipleHitLike\[\], filteredCollections, q\)/);
  assert.match(prec, /<SearchHitGroupCard[\s\S]*?kind="principle"/);
  assert.match(prec, /locked=\{g\.collection\?\.free === false && !viewerHasFullAccess\}/);
  const feqh = read("./components/FeqhTabContent.tsx");
  assert.match(feqh, /groupFeqhSearchCards\(filteredFeqhBooks as unknown as FeqhHitLike\[\], q\)/);
  const all = read("./components/LawsTabContent.tsx");
  assert.match(all, /const articleHref = deepHitHref\(`\/laws\/\$\{sys\.slug\}`, a\.id, searchQ\);/);
  assert.match(all, /<Hl text=\{a\.snippet\} \/>/);
  assert.match(all, /groupPrincipleSearchCards\(/);
  assert.match(all, /feqhGroups\.slice\(0, 3\)\.map\(/);
  const page = read("./page.tsx");
  assert.match(page, /<HighlightProvider query=\{isSearchActive \? search : ""\}>/);
  assert.match(page, /locked: r\.locked === true,\r?\n\s*\/\/ Shown only when the search sends a real principle number\./);
  assert.match(page, /collectionTitle: typeof r\.meta\?\.collectionTitle === 'string'/);
  const card = read("./components/SearchHitGroupCard.tsx");
  // a locked row never prints text; the dark-mode-invisible greys are not used for text
  assert.match(card, /\{row\.snippet \? \(/);
  assert.doesNotMatch(card, /text-(?:gray|slate)-(?:100|200)\b/);
});
