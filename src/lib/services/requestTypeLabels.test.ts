/**
 * requestTypeLabels.test.ts — N06-20: no raw `service_requests.type` on screen.
 *
 * Run: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/services/requestTypeLabels.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REQUEST_TYPE_LABELS_AR, requestTypeLabelAr } from "./requestTypeLabels.ts";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8").replace(/\r\n/g, "\n");

test("every type the CHECK constraint allows has an Arabic label", () => {
  const sql = read("supabase/migrations/20260814_service_orders_types.sql");
  const block = /check \(type in \(([\s\S]*?)\)\)/.exec(sql);
  assert.ok(block, "type check not found");
  const allowed = [...block[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.ok(allowed.length >= 8);
  for (const t of allowed) assert.ok(REQUEST_TYPE_LABELS_AR[t], `no label for ${t}`);
});

test("the labels are Arabic, and an unknown or empty type gives null, never the raw value", () => {
  assert.equal(requestTypeLabelAr("service"), "خدمة");
  assert.equal(requestTypeLabelAr("consultation"), "استشارة");
  for (const label of Object.values(REQUEST_TYPE_LABELS_AR)) assert.doesNotMatch(label, /[A-Za-z]/);
  assert.equal(requestTypeLabelAr("brand_new_type"), null);
  assert.equal(requestTypeLabelAr("toString"), null);
  assert.equal(requestTypeLabelAr(""), null);
  assert.equal(requestTypeLabelAr(null), null);
  assert.equal(requestTypeLabelAr(undefined), null);
});

test("the lawyer dashboard's recent-cases table and the case page both read the shared map", () => {
  const dash = read("src/app/dashboard/lawyer/page.tsx");
  assert.match(dash, /requestTypeLabelAr\(c\.type\)/);
  const casePage = read("src/app/dashboard/lawyer/cases/[id]/page.tsx");
  assert.match(casePage, /REQUEST_TYPE_LABELS_AR\[caseData\.type\]/);
  assert.doesNotMatch(casePage, /const CASE_TYPE_LABELS/);
});
