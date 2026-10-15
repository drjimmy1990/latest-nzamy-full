import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildCartRows, MAX_CART_ITEMS } from "./_cartRows.ts";

const U = "11111111-0000-0000-0000-000000000001";

test("rows carry only real law_draft_carts columns — never article_title — and keep the client's order", () => {
  const r = buildCartRows(U, [
    { law_slug: "labor-law", article_number: "77", article_title: "المادة السابعة والسبعون", payload: { articleTitle: "x" } },
    { law_slug: " civil ", article_number: 5 },
  ]);
  assert.ok(r.ok);
  assert.deepEqual(r.rows, [
    { user_id: U, law_slug: "labor-law", article_number: "77", position: 0, payload: { articleTitle: "x" } },
    { user_id: U, law_slug: "civil", article_number: "5", position: 1, payload: null },
  ]);
  for (const row of r.rows) assert.equal("article_title" in row, false);
});

test("an empty cart is a valid replacement", () => {
  assert.deepEqual(buildCartRows(U, []), { ok: true, rows: [] });
});

test("bad bodies are refused before anything is written", () => {
  for (const items of [undefined, null, "x", {}]) assert.equal(buildCartRows(U, items).ok, false);
  assert.equal(buildCartRows(U, [null]).ok, false);
  assert.equal(buildCartRows(U, [{ article_number: "1" }]).ok, false);
  assert.equal(buildCartRows(U, [{ law_slug: "a" }]).ok, false);
  assert.equal(buildCartRows(U, [{ law_slug: "a", article_number: "1", payload: [1] }]).ok, false);
  assert.equal(buildCartRows(U, [{ law_slug: "a", article_number: "1", payload: { t: "x".repeat(200_001) } }]).ok, false);
  assert.equal(buildCartRows(U, Array(MAX_CART_ITEMS + 1).fill({ law_slug: "a", article_number: "1" })).ok, false);
});

test("the route replaces safely: read old ids, insert, then delete the old ids (undoing the insert on failure)", () => {
  const src = readFileSync(new URL("./route.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const put = src.slice(src.indexOf("export async function PUT"));
  const readOld = put.indexOf('.select("id")\n    .eq("user_id", user.id);');
  const insert = put.indexOf(".insert(built.rows)");
  const del = put.indexOf('.in("id", previousIds)');
  assert.ok(readOld > 0 && insert > readOld && del > insert, "order: read old ids → insert → delete old ids");
  assert.match(put, /\.in\("id", insertedIds\)/, "a failed cleanup removes the rows just inserted");
  assert.doesNotMatch(src, /article_title:/, "never writes the missing column");
  // The old pattern: delete the whole cart first, result ignored.
  assert.doesNotMatch(put, /await supabase\s*\.from\("law_draft_carts"\)\s*\.delete\(\)\s*\.eq\("user_id", user\.id\);/);
});
