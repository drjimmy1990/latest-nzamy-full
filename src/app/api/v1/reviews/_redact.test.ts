import test from "node:test";
import assert from "node:assert/strict";
import { redactAnonymousReview, requestIdsForEnrichment } from "./_redact.ts";

const anon = { is_anonymous: true, request_id: "req-1" };
const named = { is_anonymous: false, request_id: "req-2" };

test("an anonymous review never carries requestId, reviewerName or serviceTitleAr", () => {
  // Even when the caller hands over a resolved name and title, which is
  // exactly the bug this module exists to make unrepeatable.
  const out = redactAnonymousReview(anon, "سارة العتيبي", "مراجعة عقد إيجار");
  assert.deepEqual(out, { requestId: null, reviewerName: null, serviceTitleAr: null });
});

test("a named review keeps all three", () => {
  const out = redactAnonymousReview(named, "سارة العتيبي", "مراجعة عقد إيجار");
  assert.deepEqual(out, { requestId: "req-2", reviewerName: "سارة العتيبي", serviceTitleAr: "مراجعة عقد إيجار" });
});

test("a named review with nothing resolved stays null-safe", () => {
  const out = redactAnonymousReview({ is_anonymous: false, request_id: null }, null, null);
  assert.deepEqual(out, { requestId: null, reviewerName: null, serviceTitleAr: null });
});

test("anonymous rows are excluded from the service-title lookup entirely", () => {
  assert.deepEqual(requestIdsForEnrichment([anon, named]), ["req-2"]);
  assert.deepEqual(requestIdsForEnrichment([anon]), []);
});

test("the lookup set is deduplicated and skips rows with no request", () => {
  const rows = [
    { is_anonymous: false, request_id: "req-2" },
    { is_anonymous: false, request_id: "req-2" },
    { is_anonymous: false, request_id: null },
    { is_anonymous: true, request_id: "req-3" },
  ];
  assert.deepEqual(requestIdsForEnrichment(rows), ["req-2"]);
});

test("an empty page resolves nothing", () => {
  assert.deepEqual(requestIdsForEnrichment([]), []);
});
