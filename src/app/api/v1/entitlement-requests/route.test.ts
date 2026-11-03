/**
 * route.test.ts — POST /api/v1/entitlement-requests, the LIVE-F05 gate.
 *
 * A source-contract test (the technique the admin approval's route.test.ts
 * uses): the route imports `next/server` and the Supabase client, so it cannot
 * be imported and executed from `node --test`. The rule itself is tested in
 * src/lib/library/libraryPurchaseEligibility.test.ts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
const post = source.slice(source.indexOf("export async function POST"), source.indexOf("export async function GET"));

test("LIVE-F05: a library request from an ineligible account is refused BEFORE it is recorded", () => {
  const gateAt = post.indexOf("if (isLibrarySaleRequest(kind))");
  const typeAt = post.indexOf('.select("user_type")');
  const readFailAt = post.indexOf("if (profileError)");
  const ruleAt = post.indexOf("libraryPurchaseEligibility(");
  const refuseAt = post.indexOf('code: "library_not_eligible"');
  const insertAt = post.indexOf('.from("entitlement_requests")');
  assert.ok(gateAt > -1 && typeAt > gateAt, "the account type is read for a library request");
  assert.ok(readFailAt > typeAt && readFailAt < ruleAt, "a failed read is refused (fail closed)");
  assert.ok(refuseAt > ruleAt && refuseAt < insertAt, "the refusal comes before the insert");
  assert.ok(post.slice(refuseAt, refuseAt + 80).includes("status: 403"));
});
