import assert from "node:assert/strict";
import test from "node:test";
import { resolveServiceRequestEntityScope } from "./serviceRequestEntityScope.ts";

const BOTH = { firmId: "firm-1", businessId: "business-1" };

test("a shared company intake chooses only the proven business", () => {
  assert.deepEqual(
    resolveServiceRequestEntityScope({
      ...BOTH,
      userType: "lawyer",
      sourcePath: "/dashboard/client/requests/new",
    }),
    { firmId: null, businessId: "business-1", error: null },
  );
});

test("a lawyer office request chooses only the proven firm", () => {
  assert.deepEqual(
    resolveServiceRequestEntityScope({
      ...BOTH,
      userType: "lawyer",
      sourcePath: "/dashboard/lawyer/cases",
    }),
    { firmId: "firm-1", businessId: null, error: null },
  );
});

test("personal client intake is never exposed to the user's firm", () => {
  assert.deepEqual(
    resolveServiceRequestEntityScope({
      firmId: "firm-1",
      businessId: null,
      userType: "individual",
      sourcePath: "/dashboard/client/requests/new",
    }),
    { firmId: null, businessId: null, error: null },
  );
});

test("an explicit scope can select only a proven membership", () => {
  assert.deepEqual(
    resolveServiceRequestEntityScope({ ...BOTH, requestedScope: "firm" }),
    { firmId: "firm-1", businessId: null, error: null },
  );
  assert.deepEqual(
    resolveServiceRequestEntityScope({
      firmId: null,
      businessId: "business-1",
      requestedScope: "firm",
    }),
    { firmId: null, businessId: null, error: "unauthorized_scope" },
  );
});

test("unknown scope values are rejected and no result can contain both ids", () => {
  assert.deepEqual(
    resolveServiceRequestEntityScope({ ...BOTH, requestedScope: "other" }),
    { firmId: null, businessId: null, error: "invalid_scope" },
  );

  for (const requestedScope of [undefined, "firm", "business", "other"]) {
    const result = resolveServiceRequestEntityScope({
      ...BOTH,
      requestedScope,
      userType: "lawyer",
      sourcePath: "/dashboard/client/requests/new",
    });
    assert.equal(!!result.firmId && !!result.businessId, false);
  }
});
