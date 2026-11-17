/**
 * contractCaseLink.test.ts — N01-6 «ربط بقضية قائمة».
 * Run: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/services/contractCaseLink.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { parseRequestIdInput, caseRelationshipFilter, caseLinkIssue } from "./contractCaseLink.ts";

test("the body value: absent leaves the link, null or blank clears it, an id sets it", () => {
  assert.deepEqual(parseRequestIdInput(undefined), { kind: "absent" });
  assert.deepEqual(parseRequestIdInput(null), { kind: "clear" });
  assert.deepEqual(parseRequestIdInput("   "), { kind: "clear" });
  assert.deepEqual(parseRequestIdInput(" NZ-MWE8PMNU-ZFA6 "), { kind: "set", requestId: "NZ-MWE8PMNU-ZFA6" });
  assert.deepEqual(
    parseRequestIdInput("6f1c2a9e-0d4b-4c1e-9a3b-2f6d8e7c5b4a"),
    { kind: "set", requestId: "6f1c2a9e-0d4b-4c1e-9a3b-2f6d8e7c5b4a" },
  );
});

test("anything that is not an id shape is refused", () => {
  for (const v of [42, true, {}, [], "a,b", "x.or(y)", "id with space", "x".repeat(65)]) {
    assert.deepEqual(parseRequestIdInput(v), { kind: "invalid" }, JSON.stringify(v));
  }
});

test("a case of mine: assigned to me, or under my active firm", () => {
  assert.equal(caseRelationshipFilter("u1", null), "assigned_to.eq.u1");
  assert.equal(caseRelationshipFilter("u1", "f1"), "assigned_to.eq.u1,firm_id.eq.f1");
});

test("a case not found among mine is refused; a different client's case is refused", () => {
  assert.ok(caseLinkIssue(null, null));
  assert.ok(caseLinkIssue({ lawyer_client_id: "card-a" }, "card-b"));
  assert.equal(caseLinkIssue({ lawyer_client_id: "card-a" }, "card-a"), null);
  assert.equal(caseLinkIssue({ lawyer_client_id: null }, "card-a"), null);
  assert.equal(caseLinkIssue({ lawyer_client_id: "card-a" }, null), null);
});

test("wiring: POST and PATCH both validate request_id through the shared lookup", () => {
  const read = (rel: string) =>
    readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const shared = read("../../app/api/v1/lawyer/contracts/_shared.ts");
  const post = read("../../app/api/v1/lawyer/contracts/route.ts");
  const patch = read("../../app/api/v1/lawyer/contracts/[id]/route.ts");
  assert.match(shared, /export async function resolveCaseLink\(/);
  assert.match(shared, /\.from\("service_requests"\)[\s\S]{0,160}\.or\(caseRelationshipFilter\(userId, firmId\)\)/);
  assert.match(post, /resolveCaseLink\(/);
  assert.match(post, /request_id: requestId,/);
  assert.match(patch, /resolveCaseLink\(/);
  assert.match(patch, /patch\.request_id = /);
  // GET filters for the two read-only lists (N01-7)
  assert.match(post, /searchParams\.get\("requestId"\)/);
  assert.match(post, /searchParams\.get\("lawyerClientId"\)/);
});
