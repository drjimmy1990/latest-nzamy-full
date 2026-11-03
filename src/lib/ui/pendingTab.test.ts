import test from "node:test";
import assert from "node:assert/strict";
import { openPendingTab, type OpenerLike } from "./pendingTab.ts";

function fakeWindow(block = false) {
  const calls: { url?: string; target?: string; features?: string }[] = [];
  const tab = { opener: {} as unknown, closed: false, location: { href: "about:blank" }, close() { this.closed = true; } };
  const win: OpenerLike = {
    open(url, target, features) {
      calls.push({ url, target, features });
      return block ? null : tab;
    },
  };
  return { win, tab, calls };
}

test("opens an empty tab immediately, without noopener (which would return null)", () => {
  const { win, calls } = fakeWindow();
  const t = openPendingTab(win);
  assert.equal(t.opened, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "about:blank");
  assert.equal(calls[0].target, "_blank");
  assert.equal(calls[0].features, undefined);
});

test("navigate points the tab at the URL and cuts the opener", () => {
  const { win, tab } = fakeWindow();
  const t = openPendingTab(win);
  assert.equal(t.navigate("https://storage.test/signed?token=x"), true);
  assert.equal(tab.location.href, "https://storage.test/signed?token=x");
  assert.equal(tab.opener, null);
});

test("a blocked popup: navigate returns false so the caller shows a fallback", () => {
  const { win } = fakeWindow(true);
  const t = openPendingTab(win);
  assert.equal(t.opened, false);
  assert.equal(t.navigate("https://storage.test/x"), false);
  t.close(); // no throw
});

test("close shuts the empty tab when the URL could not be made; navigate then reports false", () => {
  const { win, tab } = fakeWindow();
  const t = openPendingTab(win);
  t.close();
  assert.equal(tab.closed, true);
  assert.equal(t.navigate("https://storage.test/x"), false);
});

test("a window.open that throws is treated as blocked", () => {
  const t = openPendingTab({ open() { throw new Error("denied"); } });
  assert.equal(t.opened, false);
});
