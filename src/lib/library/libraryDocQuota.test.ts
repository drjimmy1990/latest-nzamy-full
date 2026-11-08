/**
 * libraryDocQuota.test.ts — final review of batch 2026-11-08, item 3: a library
 * read refused for its DEVICE (owner ٤٢٧) spends none of the account's read
 * quota and cannot open its lock. The document is counted by its route, after
 * the route's device check — not by the proxy, which runs before it.
 *
 * Source contract (the routes and the proxy import next/server, which node:test
 * cannot load).
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/library/libraryDocQuota.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), "utf8").replace(/\r\n/g, "\n");

const DOC_ROUTES: ReadonlyArray<{ file: string; request: string; before: RegExp }> = [
  { file: "app/api/library/laws/[slug]/route.ts", request: "_request", before: /formatArticleWithPaywall\(a, hasFullAccess/ },
  { file: "app/api/library/decrees/[id]/route.ts", request: "_request", before: /const response = \{/ },
  { file: "app/api/library/precedents/[slug]/route.ts", request: "request", before: /hasAccess: hasFullAccess/ },
  { file: "app/api/library/books/[slug]/route.ts", request: "request", before: /hasAccess: hasFullAccess/ },
];

for (const r of DOC_ROUTES) {
  test(`${r.file}: the document is spent after the device check and before the text`, () => {
    const src = read(r.file);
    assert.match(src, /import \{ spendLibraryDocument \} from '@\/lib\/library\/libraryDocQuota';/);
    assert.equal(src.match(/spendLibraryDocument\(/g)?.length, 1, "called once");
    const device = src.indexOf("if (deviceRefusal) return deviceRefusal;");
    const spend = src.indexOf(`const quotaRefusal = await spendLibraryDocument(${r.request}, userId);`);
    const text = src.search(r.before);
    assert.ok(device > 0, "the device check is there");
    assert.ok(spend > device, "spent AFTER the device check (a refused device spends nothing)");
    assert.ok(text > spend, "spent BEFORE the text is built");
    assert.match(src.slice(spend, spend + 200), /if \(quotaRefusal\) return quotaRefusal;/);
  });
}

test("the in-document search spends its document after the device check too", () => {
  const src = read("app/api/library/scoped-search/route.ts");
  const device = src.indexOf("if (deviceRefusal) return deviceRefusal;");
  const spend = src.indexOf("quotaRefusal(await libraryReadQuotaHit(userId, docKey), Date.now())");
  const text = src.indexOf("const serverOnly = await createServiceClient();");
  assert.ok(device > 0 && spend > device && text > spend, "device → spend → text");
  // The activity tally (refused reads too) stays before both.
  const tally = src.indexOf("recordLibraryActivity(userId, 'search')");
  assert.ok(tally > 0 && tally < device);
});

test("the proxy no longer counts a document: it tallies it and leaves the count to the route", () => {
  const proxy = read("proxy.ts");
  const start = proxy.indexOf("async function applyLibraryReadQuota(");
  const body = proxy.slice(start, proxy.indexOf("\n}\n", start));
  const tally = body.indexOf("recordLibraryActivity(user.id, libraryActivityKind(target));");
  const docExit = body.indexOf('if (target.kind === "doc") return response;');
  const hit = body.indexOf("await libraryReadQuotaHit(");
  assert.ok(tally > 0 && docExit > tally && hit > docExit, "tally → a document leaves → the lock check (search)");
  assert.match(body, /libraryReadQuotaHit\(user\.id, null, \{ memoLockCheck: true \}\)/);
  assert.doesNotMatch(body, /target\.docKey/, "the proxy spends no document any more");
});

test("the helper keys the document exactly as the proxy did, and fails open", () => {
  const src = read("lib/library/libraryDocQuota.ts");
  assert.match(src, /libraryQuotaTarget\(request\.method, new URL\(request\.url\)\.pathname\)/);
  assert.match(src, /if \(!target \|\| target\.kind !== "doc"\) return null;/);
  assert.match(src, /quotaRefusal\(await libraryReadQuotaHit\(userId, target\.docKey\), Date\.now\(\)\)/);
  assert.match(src, /if \(!userId \|\| !isSupabaseMode\) return null;/);
  assert.match(src, /"Cache-Control": "private, no-store"/);
  assert.match(src, /\} catch \{\n    return null;\n  \}/);
});
