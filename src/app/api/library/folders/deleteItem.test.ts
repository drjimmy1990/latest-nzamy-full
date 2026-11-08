import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const SOURCE = readFileSync("src/app/api/library/folders/route.ts", "utf8");

test("DELETE ?itemId= answers the same 404 for a missing item and for another user's item", () => {
  const del = SOURCE.slice(SOURCE.indexOf("export async function DELETE"));
  const itemBranch = del.slice(del.indexOf("if (itemId) {"), del.indexOf("return NextResponse.json({ success: true });"));
  assert.ok(itemBranch.length > 0, "the item branch is found");
  assert.doesNotMatch(itemBranch, /status: 403/);
  assert.equal((itemBranch.match(/NextResponse\.json\(\{ error: 'Item not found' \}, \{ status: 404 \}\)/g) ?? []).length, 2);
  assert.match(itemBranch, /\.eq\('user_id', user\.id\)/);
});
