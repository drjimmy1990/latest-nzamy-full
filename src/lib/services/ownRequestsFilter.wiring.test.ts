import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const route = readFileSync(join(import.meta.dirname, "../../app/api/v1/service-requests/route.ts"), "utf8");
const get = route.slice(route.indexOf("export async function GET"), route.indexOf("export async function POST"));

test("GET /api/v1/service-requests always scopes the list to the caller's own work", () => {
  assert.match(get, /query = query\.or\(ownRequestsOrFilter\(\{ uid: user\.id, receiver, \.\.\.scope \}\)\)/);
  // the two old shapes that let the marketplace browse arm through
  assert.doesNotMatch(get, /receiver\.eq\.\$\{receiver\},requester_user_id/);
  assert.doesNotMatch(get, /if \(!entityIds\.firmId && !entityIds\.businessId\)/);
});

test("an unknown receiver is refused before it reaches the filter syntax", () => {
  const guard = get.indexOf("!isKnownReceiver(receiver)");
  const use = get.indexOf("ownRequestsOrFilter(");
  assert.ok(guard > 0 && guard < use, "the receiver allowlist check must come first");
});
