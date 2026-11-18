/**
 * openRequestCategory.test.ts — owner ٢٣ (18 Nov 2026): staff publish a triaged
 * request to the lawyers' open list as استشارة / قضية / صياغة.
 *
 * Run: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/services/openRequestCategory.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  OPEN_REQUEST_CATEGORIES,
  isOpenRequestCategory,
  openRequestCategoryLabelAr,
  openRequestPublishBlock,
  suggestOpenRequestCategory,
} from "./openRequestCategory.ts";
import { toOpenRequestItem } from "./openRequestsView.ts";

const read = (rel: string) => readFileSync(new URL(`../../../${rel}`, import.meta.url), "utf8");

test("the three types and their words — the same three the database CHECK holds", () => {
  assert.deepEqual([...OPEN_REQUEST_CATEGORIES], ["consultation", "case", "drafting"]);
  assert.equal(openRequestCategoryLabelAr("consultation"), "استشارة");
  assert.equal(openRequestCategoryLabelAr("case"), "قضية");
  assert.equal(openRequestCategoryLabelAr("drafting"), "صياغة");
  assert.equal(openRequestCategoryLabelAr("auction"), null);
  assert.equal(isOpenRequestCategory("service"), false);
  const sql = read("supabase/migrations/20261127_70_open_requests_publish.sql");
  assert.match(sql, /marketplace_category in \('consultation', 'case', 'drafting'\)/);
});

test("the admin's pre-selection follows the catalogue category; staff still choose", () => {
  assert.equal(suggestOpenRequestCategory({ type: "consultation" }), "consultation");
  assert.equal(suggestOpenRequestCategory({ type: "service", metadata: { categoryId: "consultation" } }), "consultation");
  assert.equal(suggestOpenRequestCategory({ type: "service", metadata: { categoryId: "contracts" } }), "drafting");
  assert.equal(suggestOpenRequestCategory({ type: "service", metadata: { categoryId: "legal-filing" } }), "drafting");
  assert.equal(suggestOpenRequestCategory({ type: "service", metadata: { categoryId: "case-study" } }), "case");
  assert.equal(suggestOpenRequestCategory({ type: "service", metadata: { categoryId: "special" } }), null);
  assert.equal(suggestOpenRequestCategory({ type: "service", metadata: null }), null);
});

test("only a waiting, unrouted, real account's request may be published", () => {
  const real = { isTestAccount: false };
  assert.equal(openRequestPublishBlock({ status: "pending_assignment", assigned_to: null }, real), null);
  assert.equal(openRequestPublishBlock({ status: "pending", assigned_to: null }, real), null);
  assert.match(openRequestPublishBlock({ status: "in_review", assigned_to: null }, real) ?? "", /بانتظار الاستلام/);
  assert.match(openRequestPublishBlock({ status: "pending_assignment", assigned_to: "u1" }, real) ?? "", /ألغِ التوجيه/);
  assert.match(openRequestPublishBlock({ status: "pending_assignment", assigned_to: null }, { isTestAccount: true }) ?? "", /حساب تجريبي/);
});

test("the lawyer's card names the published type first", () => {
  const item = toOpenRequestItem({ id: "R1", type: "service", category: "drafting", city: "riyadh", public_summary: "صياغة: عقد توريد" });
  assert.equal(item?.typeLabel, "صياغة");
  assert.equal(toOpenRequestItem({ id: "R2", type: "service" })?.typeLabel, "خدمة", "before the SQL: the row type");
});

test("the admin route publishes server-side, refuses test accounts, and says when the SQL has not run", () => {
  const route = read("src/app/api/v1/admin/service-orders/[id]/route.ts");
  assert.match(route, /body\.action === "publish_open" \|\| body\.action === "unpublish_open"/);
  assert.match(route, /marketplace_published_at: nowIso, marketplace_published_by: adminUserId, marketplace_category: body\.category/);
  assert.match(route, /from\("profiles"\)\.select\("is_demo"\)/);
  assert.match(route, /from\("test_accounts"\)\.select\("user_id"\)/);
  assert.match(route, /openRequestPublishBlock\(order, \{ isTestAccount \}\)/);
  assert.match(route, /"42703" \|\| publishError\.code === "PGRST204"/);
  assert.match(route, /action: publishing \? "service_order_published_open" : "service_order_unpublished_open"/);
  const page = read("src/app/dashboard/admin/service-orders/page.tsx");
  assert.match(page, /<OpenRequestPublishBox/);
  assert.match(page, /action: "publish_open", category/);
  const box = read("src/app/dashboard/admin/service-orders/_components/OpenRequestPublishBox.tsx");
  assert.match(box, /نشر في الطلبات المفتوحة/);
  assert.match(box, /سحب من الطلبات المفتوحة/);
  assert.match(box, /ما يراه المحامي/);
});

test("the function lists published, typed rows only, never a test account's", () => {
  const sql = read("supabase/migrations/20261127_70_open_requests_publish.sql");
  const fn = sql.slice(sql.indexOf("create function public.marketplace_open_requests"), sql.indexOf("$fn$;"));
  assert.match(fn, /sr\.marketplace_published_at is not null/);
  assert.match(fn, /sr\.assigned_to is null/);
  assert.match(fn, /p\.is_demo/);
  assert.match(fn, /public\.test_accounts/);
  assert.match(fn, /security definer/);
  assert.match(fn, /set search_path = ''/);
  assert.doesNotMatch(fn, /sr\.title|sr\.description|sr\.requester\b|sr\.metadata/);
  const verify = read("supabase/migrations/_verify.sql");
  assert.match(verify, /-- >>> verify:l7_misc[\s\S]*run 20261127_70[\s\S]*-- <<< verify:l7_misc/);
});
