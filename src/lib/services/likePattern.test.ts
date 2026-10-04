import test from "node:test";
import assert from "node:assert/strict";
import { escapeLikePattern } from "./likePattern.ts";

test("a plain e-mail address is unchanged", () => {
  assert.equal(escapeLikePattern("plain@example.com"), "plain@example.com");
});

test("every LIKE / PostgREST wildcard is escaped so the value matches literally", () => {
  assert.equal(escapeLikePattern("ahmed%@%"), "ahmed\\%@\\%");
  assert.equal(escapeLikePattern("a_b@x.com"), "a\\_b@x.com");
  assert.equal(escapeLikePattern("*@*"), "\\*@\\*");
  assert.equal(escapeLikePattern("back\\slash"), "back\\\\slash");
});

test("escaping is idempotent on already-literal input and never drops characters", () => {
  const input = "first.last+tag@sub.example.co";
  assert.equal(escapeLikePattern(input), input);
  assert.equal(escapeLikePattern("a%b").length, "a%b".length + 1);
});
