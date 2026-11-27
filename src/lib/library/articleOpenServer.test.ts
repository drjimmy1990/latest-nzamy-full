/**
 * articleOpenServer.test.ts — l18 review (owner ٢٣٦ on the server): «اشرح لي»
 * pins an article on POST /api/v1/ai/runs; the pin is dropped for an article
 * locked to the caller. Source contract: the module imports "server-only" and
 * "@/", which `node --test` cannot load.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8").replace(/\r\n/g, "\n");

test("the lock is the law route's rule, on the article's OWN law, and fails closed", () => {
  const src = read("src", "lib", "library", "articleOpenServer.ts");
  assert.match(src, /^import "server-only";$/m);
  assert.match(src, /if \(await hasFullLibraryAccess\(userId, memo\)\) return true;/);
  assert.match(src, /\.from\("articles"\)\.select\("law_slug"\)\.eq\("id", articleId\)/, "the article's own law");
  assert.match(src, /if \(probe\.isWhitelisted === true \|\| probe\.freeLimit === -1\) return true;/);
  assert.match(src, /const freeLimit = effectiveFreeLimit\(probe, total\.count\);/);
  assert.match(src, /\.order\("order_index", \{ ascending: true \}\)\n\s+\.order\("id", \{ ascending: true \}\)\n\s+\.limit\(freeLimit\);/);
  assert.match(src, /\} catch \{\n\s+return false;\n\s+\}/, "any failure → locked");
  // the law route locks the text by the same order
  const law = read("src", "app", "api", "library", "laws", "[slug]", "route.ts");
  assert.match(law, /\.order\('order_index', \{ ascending: true \}\)\n\s+\.order\('id', \{ ascending: true \}\)/);
});

test("POST /api/v1/ai/runs drops the pinned article when it is locked to the caller, before the retrieval", () => {
  const route = read("src", "app", "api", "v1", "ai", "runs", "route.ts");
  const check = route.indexOf("!(await articleOpenForViewer(admin, user.id, pin.articleId))");
  const retrieve = route.indexOf("const r = await retrieveLibrary(");
  assert.ok(check > 0 && retrieve > check, "the check comes first");
  assert.match(route, /const \{ articleId: _locked, \.\.\.rest \} = pin;/);
  assert.match(route, /\n\s+usedPin,\n/);
  assert.match(route, /return previewOnly \? previewOnlySources\(r\) : r;/, "the free-question preview still applies");
});
