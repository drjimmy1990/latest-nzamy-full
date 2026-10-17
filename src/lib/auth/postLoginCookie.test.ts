import assert from "node:assert/strict";
import test from "node:test";
import {
  POST_LOGIN_COOKIE,
  postLoginCookieAssignment,
  readPostLoginCookie,
  stashablePostLoginPath,
} from "./postLoginCookie.ts";

test("only a same-site path outside the sign-in flow is stashed", () => {
  assert.equal(stashablePostLoginPath("/laws/subscribe?plan=lib-q1"), "/laws/subscribe?plan=lib-q1");
  assert.equal(stashablePostLoginPath("https://evil.example/x"), null);
  assert.equal(stashablePostLoginPath("//evil.example"), null);
  assert.equal(stashablePostLoginPath("/\t/evil.example"), null);
  assert.equal(stashablePostLoginPath("/login"), null);
  assert.equal(stashablePostLoginPath("/onboarding"), null);
  assert.equal(stashablePostLoginPath(""), null);
  assert.equal(stashablePostLoginPath(null), null);
});

test("the cookie is first-party, short-lived, Lax, and Secure on https", () => {
  const c = postLoginCookieAssignment("/book/consultation", true);
  assert.match(c, new RegExp(`^${POST_LOGIN_COOKIE}=%2Fbook%2Fconsultation; `));
  assert.match(c, /; Path=\//);
  assert.match(c, /; Max-Age=600/);
  assert.match(c, /; SameSite=Lax/);
  assert.match(c, /; Secure$/);
  assert.doesNotMatch(postLoginCookieAssignment("/x", false), /Secure/);
});

test("the callback re-validates what it reads", () => {
  assert.equal(readPostLoginCookie(encodeURIComponent("/dashboard/client/requests")), "/dashboard/client/requests");
  assert.equal(readPostLoginCookie(encodeURIComponent("https://evil.example")), null);
  assert.equal(readPostLoginCookie("%E0%A4%A"), null); // malformed escape
  assert.equal(readPostLoginCookie(undefined), null);
});
