/**
 * dashboardService.test.ts
 *
 * THE DEFECT THIS PINS. `getDashboardSummary()` used to end in
 * `catch { return { ...DEMO_SUMMARY } }`, so a failed request reached
 * /dashboard/client as a complete, confident object: no cases, no next
 * appointment, and a subscription reading «مجانية». A client with four open
 * orders saw «قضاياي» disappear and was told nothing had gone wrong.
 *
 * `summaryReadFrom()` is the decision with the I/O taken out of it: what a
 * response body means. Everything below is about the one distinction that
 * must survive — "we could not read it" is not "there is nothing".
 *
 * Run: npm run test:unit
 */
import assert from "node:assert/strict";
import test from "node:test";
import { summaryReadFrom } from "./dashboardService.ts";
import { itemsOf, listViewState } from "./listRead.ts";

test("a summary object is a ready read carrying exactly that object", () => {
  const body = { activeCases: [{ id: "a" }], walletBalance: 12 };
  const read = summaryReadFrom(body);

  assert.equal(read.ok, true);
  assert.equal(listViewState(false, read), "ready");
  assert.equal(itemsOf(read).length, 1);
  // The same object, not a copy merged over a default: a default is how the
  // fixture got in.
  assert.equal(itemsOf(read)[0], body);
});

test("a body with nothing in it is still a read, not a failure", () => {
  // An account that has ordered nothing is a real, honest answer from the
  // route. It must stay distinguishable from a route that did not answer.
  const read = summaryReadFrom({});
  assert.equal(read.ok, true);
  assert.equal(listViewState(false, read), "ready");
});

test("null is unreadable, never an empty dashboard", () => {
  const read = summaryReadFrom(null);
  assert.equal(read.ok, false);
  assert.equal(listViewState(false, read), "unreadable");
});

test("an array body is unreadable — a summary is one object, not a list", () => {
  assert.equal(summaryReadFrom([]).ok, false);
  assert.equal(summaryReadFrom([{ activeCases: [] }]).ok, false);
});

test("a non-object body is unreadable", () => {
  for (const body of [undefined, "", "not json", 0, 42, true]) {
    assert.equal(summaryReadFrom(body).ok, false, `expected ${String(body)} to be unreadable`);
  }
});

test("an unreadable read yields no items and no plan to print", () => {
  // The whole point at the call site: /dashboard/client reads the summary out
  // of this read, so an unreadable one must hand the page nothing at all —
  // not `subscription: { plan: "free", name: "مجانية" }`, which is what the
  // old DEMO_SUMMARY fallback handed it.
  const read = summaryReadFrom(null);
  assert.deepEqual(itemsOf(read), []);
  assert.equal(itemsOf(read)[0], undefined);
});

test("a read that has not happened yet is unreadable, and loading outranks both", () => {
  // Mirrors what the page does with the read before the request settles.
  assert.equal(listViewState(true, null), "loading");
  assert.equal(listViewState(false, null), "unreadable");
  assert.equal(listViewState(true, summaryReadFrom(null)), "loading");
});
