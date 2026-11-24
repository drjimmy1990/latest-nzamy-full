/**
 * Live check of 13 Nov, row 49: GET /api/v1/admin/erp read four whole tables.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/admin/erpOverview.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ERP_FIRMS_MAX, ERP_IN_CHUNK, erpTruncationNoteAr, idChunks } from "./erpOverview.ts";

test("idChunks drops empties and duplicates and splits at the chunk size", () => {
  assert.deepEqual(idChunks(["a", "b", "a", null, "", undefined, "c"], 2), [["a", "b"], ["c"]]);
  assert.deepEqual(idChunks([], 2), []);
  const many = Array.from({ length: 250 }, (_, i) => `id-${i}`);
  assert.deepEqual(idChunks(many).map((c) => c.length), [ERP_IN_CHUNK, ERP_IN_CHUNK, 50]);
  assert.throws(() => idChunks(["a"], 0));
});

test("the truncation note appears only when firms were left out", () => {
  assert.equal(erpTruncationNoteAr(10, 10), null);
  assert.equal(erpTruncationNoteAr(0, 0), null);
  assert.match(erpTruncationNoteAr(500, 812) ?? "", /أحدث .* مكتب من أصل/);
});

test("the route reads one bounded page of firms and scopes the other reads to them", () => {
  const route = readFileSync(new URL("../../app/api/v1/admin/erp/route.ts", import.meta.url), "utf8");
  assert.match(route, /\.limit\(ERP_FIRMS_MAX\)/);
  assert.match(route, /\{ count: "exact" \}/);
  assert.match(route, /\.in\("firm_id", ids\)/);
  assert.match(route, /\.in\("assigned_user_id", ids\)/);
  assert.match(route, /\.in\("user_id", ids\)/);
  assert.doesNotMatch(route, /Promise\.all\(\[/, "no unbounded parallel whole-table reads");
  assert.match(route, /truncated: firmsTotal > firms\.length/);
  assert.ok(ERP_FIRMS_MAX <= 1000);
  const tab = readFileSync(new URL("../../app/dashboard/admin/tabs/ERPTab.tsx", import.meta.url), "utf8");
  assert.match(tab, /summary\.truncated && /);
});
