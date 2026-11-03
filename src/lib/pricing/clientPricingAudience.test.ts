import assert from "node:assert/strict";
import test from "node:test";
import { clientPricingAudience } from "./clientPricingAudience.ts";

test("S6: who pays the business price", () => {
  assert.equal(clientPricingAudience({ userType: "corporate", hasBusinessScope: false }), "corporate");
  // A company member filing for the company (the request resolves a businessId).
  assert.equal(clientPricingAudience({ userType: "individual", hasBusinessScope: true }), "corporate");
  assert.equal(clientPricingAudience({ userType: "individual", hasBusinessScope: false }), "individual");
  // micro cannot reach the client intake (routeAccess.ts); left out on purpose.
  assert.equal(clientPricingAudience({ userType: "micro", hasBusinessScope: false }), "individual");
  assert.equal(clientPricingAudience({ userType: null, hasBusinessScope: false }), "individual");
  assert.equal(clientPricingAudience({ userType: undefined, hasBusinessScope: false }), "individual");
});
