import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(join(here, "page.tsx"), "utf8").replace(/\r\n/g, "\n");
// The detail route selects "*" and spreads the row, so requester_user_id
// reaches the page even though ServiceRequestDetail does not declare it.
const route = readFileSync(join(here, "../../../../api/v1/service-requests/[id]/route.ts"), "utf8").replace(/\r\n/g, "\n");

test("Q316: the upload note is said only where the client can see the file", () => {
  const at = page.indexOf("الموكّل يرى هذا الملف");
  assert.ok(at > 0, "the note is on the case page");
  const before = page.slice(Math.max(0, at - 700), at);
  assert.match(before, /requester_user_id\?: string \| null \} \| null\)\?\.requester_user_id !== user\.userId && \(/);
  assert.ok(page.indexOf("الموكّل يرى هذا الملف", at + 1) === -1, "said once");
});

test("Q316: the detail read carries requester_user_id to the page", () => {
  assert.match(route, /\.from\("service_requests"\)\s*\.select\("\*"\)\s*\.eq\("id", id\)/);
  assert.match(route, /\.\.\.\(serviceRequest as Record<string, unknown>\)/);
  assert.match(route, /\.\.\.row,/);
});
