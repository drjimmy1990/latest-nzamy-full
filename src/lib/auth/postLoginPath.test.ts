import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { postLoginPath } from "./postLoginPath.ts";

const DASHBOARD = "/dashboard/client";

test("a local ?next= is where the sign-in lands, query included", () => {
  assert.equal(postLoginPath("/laws/subscribe?plan=lib-q1", DASHBOARD), "/laws/subscribe?plan=lib-q1");
  assert.equal(postLoginPath("/pricing", DASHBOARD), "/pricing");
});

test("no next, or one that leaves the site, falls back to the dashboard", () => {
  for (const v of [null, undefined, "", "https://evil.example/", "//evil.example", "/\\evil.example", "/\t/evil.example"]) {
    assert.equal(postLoginPath(v, DASHBOARD), DASHBOARD, String(v));
  }
});

test("the sign-in flow's own pages are refused (no redirect loop)", () => {
  for (const v of ["/login", "/login?next=/x", "/LOGIN", "/register/client?plan=x", "/auth/callback", "/onboarding", "/onboarding?step=2"]) {
    assert.equal(postLoginPath(v, DASHBOARD), DASHBOARD, v);
  }
  // A path that only starts with the same letters is an ordinary page.
  assert.equal(postLoginPath("/loginhelp", DASHBOARD), "/loginhelp");
});

// N5 (fix plan 2026-10-16): /login ignored ?next=, so a guest sent to sign in
// from /laws/subscribe came back to a dashboard and lost the plan.
test("/login reads ?next= through postLoginPath on every success path", () => {
  const src = readFileSync(new URL("../../app/login/page.tsx", import.meta.url), "utf8");
  assert.match(src, /import \{ postLoginPath \} from "@\/lib\/auth\/postLoginPath";/);
  // Already signed in, password sign-in, demo sign-in.
  assert.equal((src.match(/postLoginPath\(nextFromUrl\(\), getDashboardRoute\(/g) || []).length, 3);
  // A signed-in account with no usable type still goes to /onboarding.
  assert.match(src, /: "\/onboarding";/);
  // No useSearchParams: it would need a Suspense boundary for `next build`.
  assert.doesNotMatch(src, /useSearchParams\(|import[^;]*useSearchParams/);
});
