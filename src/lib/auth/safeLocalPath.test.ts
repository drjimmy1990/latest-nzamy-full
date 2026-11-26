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

// l18 review B1: these normalise to the pathname `//evil.example`, which a
// relative Location header sends to https://evil.example.
test("paths that normalise to a protocol-relative form fall back", () => {
  for (const v of ["/.//evil.example", "/..//evil.example", "/%2e//evil.example", "/%2E%2E//evil.example", "/.///evil.example", "/x/..//evil.example", "/./\\evil.example", "/\\evil.example"]) {
    assert.equal(safeLocalPath(v, FALLBACK), FALLBACK, v);
  }
  // the decoded form of ?next=/%5cevil.example
  assert.equal(safeLocalPath(decodeURIComponent("/%5cevil.example"), FALLBACK), FALLBACK);
});

test("whatever passes stays on this site when resolved as a Location", () => {
  for (const v of ["/%5cevil.example", "/%5C%5Cevil.example", "/%2F%2Fevil.example", "/a/./b", "/a/../b", "/.//evil.example"]) {
    const out = safeLocalPath(v, FALLBACK);
    assert.equal(new URL(out, "https://site.example/login").origin, "https://site.example", `${v} -> ${out}`);
    assert.ok(!out.startsWith("//"), `${v} -> ${out}`);
  }
});
