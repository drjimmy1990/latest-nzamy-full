import assert from "node:assert/strict";
import test from "node:test";
import { buyClickGate } from "./buyClickGate.ts";

test("a buy click waits while the session resolves — it must not act as a guest", () => {
  assert.equal(buyClickGate({ loading: true, isLoggedIn: false }), "wait");
  assert.equal(buyClickGate({ loading: true, isLoggedIn: true }), "wait");
});

test("a guest keeps the CTA's default navigation (register / login)", () => {
  assert.equal(buyClickGate({ loading: false, isLoggedIn: false }), "default");
});

test("a member gets the existing buy logic (checkout or review request)", () => {
  assert.equal(buyClickGate({ loading: false, isLoggedIn: true }), "member");
});
