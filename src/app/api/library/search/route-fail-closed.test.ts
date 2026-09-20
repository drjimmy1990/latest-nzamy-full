import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routeSource = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

test("all required search sections fail with one opaque non-2xx response before partial results are returned", () => {
  assert.match(routeSource, /function searchUnavailableResponse\(status = 503\)/);
  assert.match(routeSource, /error: 'Search temporarily unavailable', code: 'search_unavailable'/);

  for (const name of ["lawError", "precError", "orderError", "feqhError"]) {
    assert.match(routeSource, new RegExp(`if \\(${name}\\) \\{[\\s\\S]{0,180}return searchUnavailableResponse\\(\\);`));
  }
});

test("a null or malformed successful-looking section payload fails closed, while an empty array remains valid", () => {
  for (const name of ["lawResults", "precResults", "orderResults", "feqhResults"]) {
    assert.match(
      routeSource,
      new RegExp(`if \\(!Array\\.isArray\\(${name}\\)\\) \\{[\\s\\S]{0,160}return searchUnavailableResponse\\(\\);`),
    );
  }
  assert.doesNotMatch(routeSource, /if \(!lawError && lawResults\)/);
  assert.match(routeSource, /results\.laws = lawResults\.map/);
});

test("every section catch returns the same opaque failure and the success payload remains after them", () => {
  for (const label of ["Laws", "Precedents", "Orders", "Feqh"]) {
    assert.match(routeSource, new RegExp(`console\\.error\\('\\[Search\\] ${label} error:', e\\);\\s*return searchUnavailableResponse\\(\\);`));
  }
  const lastFailure = routeSource.lastIndexOf("return searchUnavailableResponse();");
  const successPayload = routeSource.indexOf("results: allResults");
  assert.ok(lastFailure < successPayload, "a section failure returns before the only success payload");
  assert.match(routeSource, /return searchUnavailableResponse\(500\);/);
});
