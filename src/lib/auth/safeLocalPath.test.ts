import { test } from "node:test";
import assert from "node:assert/strict";
import { safeLocalPath } from "./safeLocalPath.ts";

const FALLBACK = "/dashboard";

test("ordinary site paths pass through", () => {
  assert.equal(safeLocalPath("/dashboard/lawyer", FALLBACK), "/dashboard/lawyer");
  assert.equal(safeLocalPath("/laws/x?tab=2#a", FALLBACK), "/laws/x?tab=2#a");
});

test("missing, relative and absolute values fall back", () => {
  for (const v of [null, undefined, "", "dashboard", "https://evil.example/", "http:/evil.example"]) {
    assert.equal(safeLocalPath(v, FALLBACK), FALLBACK, String(v));
  }
});

test("protocol-relative and backslash forms fall back", () => {
  for (const v of ["//evil.example", "/\\evil.example", "/\\/evil.example", "/x\\..\\..\\evil"]) {
    assert.equal(safeLocalPath(v, FALLBACK), FALLBACK, v);
  }
});

test("a tab, newline or other control character falls back (browsers strip them: /\\t/evil.example → //evil.example)", () => {
  for (const v of ["/\t/evil.example", "/\n/evil.example", "/\r/evil.example", "/\u0000/x", "/\u007F/x"]) {
    assert.equal(safeLocalPath(v, FALLBACK), FALLBACK, JSON.stringify(v));
  }
  // the decoded form of ?next=/%09/evil.example
  assert.equal(safeLocalPath(decodeURIComponent("/%09/evil.example"), FALLBACK), FALLBACK);
});

test("encoded slashes stay a path on this site", () => {
  assert.equal(safeLocalPath("/%2F%2Fevil.example", FALLBACK), "/%2F%2Fevil.example");
});
