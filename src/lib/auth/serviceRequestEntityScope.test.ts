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

// ── All six branches, one test each (WP-6 B-10) ─────────────────────────────
//
// `resolveServiceRequestEntityScope` has exactly six exits. Until B-10 nothing
// in the product sent an explicit scope, so branches 1-3 were dead code in
// practice and the company attachment rested entirely on branch 4's
// `sourcePath` string match — rename a route and a corporate request silently
// becomes a personal one (branch 6), invisible to the rest of the company.

test("branch 1 — an explicit scope that is not 'firm' or 'business' is invalid_scope", () => {
  for (const requestedScope of ["other", "corporate", "FIRM", 7, true, {}]) {
    assert.deepEqual(
      resolveServiceRequestEntityScope({ ...BOTH, requestedScope }),
      { firmId: null, businessId: null, error: "invalid_scope" },
      String(requestedScope),
    );
  }
  // An absent/blank scope is NOT an error — it falls through to the
  // contextual branches below.
  for (const requestedScope of [undefined, null, ""]) {
    assert.notEqual(
      resolveServiceRequestEntityScope({ ...BOTH, requestedScope, userType: "corporate" }).error,
      "invalid_scope",
      String(requestedScope),
    );
  }
});

test("branch 2 — an explicit scope selects ONLY an id the server already proved", () => {
  assert.deepEqual(
    resolveServiceRequestEntityScope({ ...BOTH, requestedScope: "business" }),
    { firmId: null, businessId: "business-1", error: null },
  );
  assert.deepEqual(
    resolveServiceRequestEntityScope({ ...BOTH, requestedScope: "firm" }),
    { firmId: "firm-1", businessId: null, error: null },
  );
});

test("branch 3 — an explicit scope with no proven membership is unauthorized_scope, never a silent fallback", () => {
  assert.deepEqual(
    resolveServiceRequestEntityScope({ firmId: null, businessId: null, requestedScope: "business" }),
    { firmId: null, businessId: null, error: "unauthorized_scope" },
  );
  assert.deepEqual(
    resolveServiceRequestEntityScope({ firmId: "firm-1", businessId: null, requestedScope: "business" }),
    { firmId: null, businessId: null, error: "unauthorized_scope" },
  );
  // The explicit branch also wins over every contextual default below: a
  // corporate account asking for "firm" it cannot prove is refused, not
  // quietly given its company.
  assert.deepEqual(
    resolveServiceRequestEntityScope({
      firmId: null,
      businessId: "business-1",
      requestedScope: "firm",
      userType: "corporate",
      sourcePath: "/dashboard/business",
    }),
    { firmId: null, businessId: null, error: "unauthorized_scope" },
  );
});

test("branch 4 — a proven business + a company intake path attaches the company, whatever the account type", () => {
  for (const sourcePath of [
    "/dashboard/client/requests/new",
    "/dashboard/client/consultation/new",
    "/dashboard/business",
    "/dashboard/business/anything",
  ]) {
    for (const userType of ["lawyer", "individual", "corporate", null]) {
      assert.deepEqual(
        resolveServiceRequestEntityScope({ ...BOTH, userType, sourcePath }),
        { firmId: null, businessId: "business-1", error: null },
        `${sourcePath} / ${userType}`,
      );
    }
  }
  // …and it needs the PROVEN business: the path alone attaches nothing.
  assert.deepEqual(
    resolveServiceRequestEntityScope({
      firmId: null,
      businessId: null,
      userType: "individual",
      sourcePath: "/dashboard/business",
    }),
    { firmId: null, businessId: null, error: null },
  );
});

test("branch 5 — a corporate account with a proven business attaches it from any other path", () => {
  assert.deepEqual(
    resolveServiceRequestEntityScope({
      firmId: null,
      businessId: "business-1",
      userType: "corporate",
      sourcePath: "/ai/orders",
    }),
    { firmId: null, businessId: "business-1", error: null },
  );
});

test("branch 6 — a firm/lawyer path outside the shared intake attaches the firm", () => {
  for (const userType of ["firm", "lawyer"]) {
    assert.deepEqual(
      resolveServiceRequestEntityScope({
        firmId: "firm-1",
        businessId: null,
        userType,
        sourcePath: "/dashboard/lawyer/cases",
      }),
      { firmId: "firm-1", businessId: null, error: null },
      userType,
    );
  }
  // An individual is never given a firm, even with one proven.
  assert.deepEqual(
    resolveServiceRequestEntityScope({
      firmId: "firm-1",
      businessId: null,
      userType: "individual",
      sourcePath: "/dashboard/lawyer/cases",
    }),
    { firmId: null, businessId: null, error: null },
  );
});

test("branch 7 (the fall-through) — nothing proven and nothing contextual is a PERSONAL request", () => {
  assert.deepEqual(
    resolveServiceRequestEntityScope({ firmId: null, businessId: null, userType: "individual", sourcePath: "/x" }),
    { firmId: null, businessId: null, error: null },
  );
  // This is exactly the silent demotion B-10 exists to make impossible for the
  // three corporate intake paths: they now send `entityScope: "business"`
  // whenever the session has a membership, so a renamed route cannot land a
  // company's request here unnoticed.
});

test("no result can ever carry both ids, on any branch", () => {
  const paths = ["/dashboard/client/requests/new", "/dashboard/business", "/dashboard/lawyer/cases", "/x", ""];
  const scopes = [undefined, null, "", "firm", "business", "other"];
  const types = ["corporate", "firm", "lawyer", "individual", null];
  for (const sourcePath of paths) {
    for (const requestedScope of scopes) {
      for (const userType of types) {
        const r = resolveServiceRequestEntityScope({ ...BOTH, requestedScope, userType, sourcePath });
        assert.equal(
          Boolean(r.firmId) && Boolean(r.businessId),
          false,
          `${sourcePath} / ${String(requestedScope)} / ${String(userType)}`,
        );
        if (r.error) assert.equal(r.firmId === null && r.businessId === null, true);
      }
    }
  }
});
