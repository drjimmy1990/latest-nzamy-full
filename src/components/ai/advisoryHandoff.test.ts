import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveAdvisoryHandoff } from "./advisoryHandoff.ts";

test("the human-review button lands on a real human service", () => {
  const opinion = resolveAdvisoryHandoff("written-opinion");
  assert.equal(opinion.serviceLabel, "رأي قانوني مكتوب");
  assert.ok(opinion.href.startsWith("/"), "must be an in-app route");
  assert.ok(opinion.priceLabel.length > 0);

  const review = resolveAdvisoryHandoff("contract-review");
  assert.equal(review.serviceLabel, "مراجعة من محام متخصص");
  assert.ok(review.href.includes("contract-review"));
});

test("an unknown service id still produces a usable link, never an empty href", () => {
  // getClientServiceById falls back to `general`. The button must degrade to
  // "ask the office for something" rather than to href="" — which renders as
  // a link to the current page and looks like the button is broken.
  const out = resolveAdvisoryHandoff("no-such-service-id");
  assert.ok(out.href.startsWith("/"));
  assert.ok(out.serviceLabel.length > 0);
});
