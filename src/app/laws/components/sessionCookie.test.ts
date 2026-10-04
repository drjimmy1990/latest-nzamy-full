import assert from "node:assert/strict";
import test from "node:test";
import { hasSupabaseSessionCookie } from "./sessionCookie.ts";

test("a session cookie, whole or chunked, counts", () => {
  assert.equal(hasSupabaseSessionCookie("sb-auth-auth-token=base64-abc"), true);
  assert.equal(hasSupabaseSessionCookie("theme=dark; sb-abcd1234-auth-token.0=base64-abc; sb-abcd1234-auth-token.1=def"), true);
  assert.equal(hasSupabaseSessionCookie("a=1;sb-x-auth-token=v"), true);
});

test("no session cookie: a guest", () => {
  assert.equal(hasSupabaseSessionCookie(""), false);
  assert.equal(hasSupabaseSessionCookie(null), false);
  assert.equal(hasSupabaseSessionCookie(undefined), false);
  assert.equal(hasSupabaseSessionCookie("theme=dark; nzamy_search=1"), false);
  // The PKCE verifier is written before a session exists; it is not one.
  assert.equal(hasSupabaseSessionCookie("sb-abcd-auth-token-code-verifier=xyz"), false);
  // A value that merely mentions the name is not the cookie.
  assert.equal(hasSupabaseSessionCookie("note=sb-abcd-auth-token"), false);
});
