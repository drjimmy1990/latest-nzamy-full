/**
 * library-rows-diff --scope-rows (owner package 19 Nov, item 5.9): the trial on
 * a few files sees only their documents, finds children left behind under
 * them, and diffs values field by field. Pure — no network.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COLUMN_ABSENT,
  diffKeys,
  diffRowValues,
  diffVerdict,
  LIBRARY_ROW_TABLES,
  postgrestInList,
  ROW_SCOPE,
  rowInScope,
  scopedDiffMarkdown,
  scopedRowUrls,
  scopeFilter,
  tsvCell,
  valueDiffTsv,
  valuesEqual,
} from "./rowsDiff.ts";

type Row = Record<string, unknown>;
const byKey = (pk: string, rows: Row[]) => new Map(rows.map((r) => [String(r[pk]), r]));

test("every table has a scope rule, and every parent comes before its children", () => {
  const order = LIBRARY_ROW_TABLES.map((t) => t.name);
  for (const name of order) {
    assert.ok(name in ROW_SCOPE, name);
    const spec = ROW_SCOPE[name];
    if (spec) assert.ok(order.indexOf(spec.parent) < order.indexOf(name), `${spec.parent} before ${name}`);
  }
});

test("a 1-law folder against a 3-law library: only that law and its children are in scope; a child left behind under it is found", () => {
  // Loaded library (old rows): 3 laws.
  const loaded: Record<string, Row[]> = {
    laws: [{ slug: "law-a" }, { slug: "law-b" }, { slug: "law-c" }],
    articles: [
      { id: "law-a__art-1", law_slug: "law-a", text: "قديم" },
      { id: "law-a__art-2", law_slug: "law-a", text: "مادة ستُحذف" },
      { id: "law-b__art-1", law_slug: "law-b", text: "ب" },
    ],
    article_amendments: [
      { id: "u1", article_id: "law-a__art-1" },
      { id: "u2", article_id: "law-a__art-1" },
      { id: "u9", article_id: "law-b__art-1" },
    ],
  };
  // New rows: law-a only, article 2 renumbered away, one amendment card fewer.
  const incoming: Record<string, Row[]> = {
    laws: [{ slug: "law-a" }],
    articles: [{ id: "law-a__art-1", law_slug: "law-a", text: "جديد" }],
    article_amendments: [{ id: "u1", article_id: "law-a__art-1" }],
  };
  const scope = new Map<string, Set<string>>();
  const results: Record<string, ReturnType<typeof diffKeys>> = {};
  for (const t of ["laws", "articles", "article_amendments"]) {
    const pk = t === "laws" ? "slug" : "id";
    const inKeys = new Set((incoming[t] ?? []).map((r) => String(r[pk])));
    const filter = scopeFilter(t, pk, inKeys, scope);
    const loadedKeys = new Set((loaded[t] ?? []).filter((r) => rowInScope(r, filter)).map((r) => String(r[pk])));
    scope.set(t, new Set([...inKeys, ...loadedKeys]));
    results[t] = diffKeys(t, inKeys, loadedKeys);
  }
  assert.equal(results.laws.leftBehind, 0, "law-b and law-c are out of scope, not left behind");
  assert.equal(results.laws.updated, 1);
  assert.deepEqual(results.articles.sampleLeftBehind, ["law-a__art-2"]);
  assert.deepEqual(results.article_amendments.sampleLeftBehind, ["u2"], "found through its parent article, not its own key");
  assert.equal(diffVerdict(Object.values(results)), "needs-team");
});

test("an empty table file means nothing of that kind is in scope", () => {
  const filter = scopeFilter("decrees_circulars", "id", new Set(), new Map());
  assert.equal(rowInScope({ id: "x" }, filter), false);
  const child = scopeFilter("decree_pages", "id", new Set(), new Map());
  assert.equal(rowInScope({ id: "p", decree_id: "x" }, child), false);
});

test("values: null = undefined, a number = its string, objects by content; '' ≠ null", () => {
  assert.ok(valuesEqual(null, undefined));
  assert.ok(valuesEqual(5, "5"));
  assert.ok(valuesEqual({ b: 1, a: [1, { y: 2, x: 1 }] }, { a: [1, { x: 1, y: 2 }], b: 1 }));
  assert.ok(!valuesEqual("", null));
  assert.ok(!valuesEqual(true, "true"));
  assert.ok(!valuesEqual([1, 2], [2, 1]));
});

test("diffRowValues compares only the fields of the new row, names a column that is not there yet", () => {
  const incoming = byKey("id", [
    { id: "a", text: "جديد", status: "active", position: 0 },
    { id: "b", text: "كما هو", status: "active" },
    { id: "c", text: "مضاف" },
  ]);
  const loaded = byKey("id", [
    { id: "a", text: "قديم", status: "active", fts: "'x'" },
    { id: "b", text: "كما هو", status: "active", fts: "'y'" },
  ]);
  const d = diffRowValues("articles", "id", incoming, loaded);
  assert.equal(d.changedRows, 1);
  assert.equal(d.unchangedRows, 1);
  assert.deepEqual(d.fieldCounts, { text: 1, position: 1 });
  assert.deepEqual(d.changes, [
    { table: "articles", key: "a", field: "text", old: "قديم", new: "جديد" },
    { table: "articles", key: "a", field: "position", old: COLUMN_ABSENT, new: 0 },
  ]);
  const tsv = valueDiffTsv([d]).split("\n");
  assert.equal(tsv[0], "table\tkey\tfield\told\tnew");
  assert.equal(tsv[1], "articles\ta\ttext\tقديم\tجديد");
});

test("TSV cells escape tabs and line breaks and cut long text with its length", () => {
  assert.equal(tsvCell("a\tb\nc\r"), "a\\tb\\nc\\r");
  assert.equal(tsvCell(null), "null");
  assert.equal(tsvCell({ k: 1 }), '{"k":1}');
  assert.match(tsvCell("x".repeat(2500)), /…\(2500 chars\)$/);
});

test("postgrestInList quotes every key and escapes quotes and backslashes", () => {
  assert.equal(postgrestInList(["law-a", 'he said "x"', "a\\b", "a,b"]), 'in.("law-a","he said \\"x\\"","a\\\\b","a,b")');
});

test("scopedRowUrls: read-only select, filtered by the parent column, batched under the url limit", () => {
  const keys = Array.from({ length: 300 }, (_, i) => `نظام-${String(i).padStart(3, "0")}__art-${i}`);
  const urls = scopedRowUrls("https://db.example.test/", "article_amendments", "id", "article_id", keys, 4000);
  assert.ok(urls.length > 1);
  for (const u of urls) {
    assert.ok(u.length <= 4000, `${u.length}`);
    assert.ok(u.startsWith("https://db.example.test/rest/v1/article_amendments?select=*&order=id.asc&limit=1000&article_id="));
  }
  const decoded = urls.map((u) => decodeURIComponent(u.split("&article_id=")[1]));
  const all = decoded.flatMap((d) => d.slice(4, -1).split(",").map((q) => q.slice(1, -1)));
  assert.deepEqual(all, [...keys].sort());
});

test("the markdown report lists the table, what was left behind, and the changed fields", () => {
  const keyDiffs = [diffKeys("articles", new Set(["a"]), new Set(["a", "z"]))];
  const valueDiffs = [diffRowValues("articles", "id", byKey("id", [{ id: "a", text: "ب|ج" }]), byKey("id", [{ id: "a", text: "أ" }]))];
  const md = scopedDiffMarkdown({ rowsDir: "/rows", comparedWith: "/old", keyDiffs, valueDiffs, leftBehind: { articles: ["z"] }, verdict: diffVerdict(keyDiffs) });
  assert.match(md, /\| articles \| 1 \| 2 \| 0 \| 1 \| 1 \| 1 \|/);
  assert.match(md, /- `z`/);
  assert.match(md, /Fields changed \(rows\): text 1/);
  assert.match(md, /\| `a` \| text \| أ \| ب\\\|ج \|/);
  assert.match(md, /Verdict: \*\*needs-team\*\*/);
});
